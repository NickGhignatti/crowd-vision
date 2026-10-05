"""One building's routers as OpenWrt access points, and the phones moving through it.

A router lists only the phones associated to it; every router in range hears a phone's scan burst.
"""

from __future__ import annotations

import math
import random
import secrets
import threading
import time
from collections import deque
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

from config import SimConfig
from geometry import Layout, Point, Room
from phones import Passerby, Phone, burst_mac, bursts, make_phone, passersby, random_mac, screen_on
from physics import free_space_rssi, gaussian, uniform

ROUTER = "router"
IFACE = "wlan0"
USERNAME = PASSWORD = "collector"
BROADCAST = "ff:ff:ff:ff:ff:ff"
SESSION_TTL_S = 300.0
_CHANNELS_MHZ = (5180, 5200, 5220, 5240, 5745, 5765, 5785, 5805)
_MAX_AID = 2007
_CELL_M = 0.5
_WALL_CACHE_LIMIT = 200_000
_EVENT_MEMORY_S = 600.0


@dataclass(frozen=True)
class Station:
    """One row of a router's station table."""

    mac: str
    signal: int
    aid: int
    connected_s: int
    inactive_ms: int
    rx_packets: int
    tx_packets: int
    stale: bool


@dataclass(frozen=True)
class Event:
    """One hostapd ubus notification: `probe`, `auth` or `assoc`."""

    at: float
    kind: str
    payload: dict


@dataclass
class _Link:
    router: str
    since: float
    aid: int
    signal: int
    ended: float | None = None


@dataclass(frozen=True)
class _Sender:
    key: str
    mac: str
    gain_db: float
    random_fraction: float
    where: Callable[[float], tuple[Point, bool] | None]


def next_association(
    current: str | None, signals: Mapping[str, float], config: SimConfig
) -> str | None:
    """Where a phone is associated after one step: join the loudest, roam once its own link degrades."""
    if not signals:
        return None
    best = max(signals, key=lambda router: (signals[router], router))
    if current is None:
        return best if signals[best] >= config.join_dbm else None
    own = signals.get(current, -math.inf)
    if own < config.drop_dbm:
        return None
    if own < config.roam_trigger_dbm and signals[best] >= own + config.roam_delta_db:
        return best
    return current


class BuildingWorld:
    def __init__(self, building_id: str, layout: Layout, config: SimConfig) -> None:
        self.building_id = building_id
        self.layout = layout
        self.config = config
        self.aps = layout.routers
        # Seeded by building so a restart walks the same people through the same rooms.
        rng = random.Random(building_id)
        ordered = sorted(layout.routers)
        spread = config.router_gain_spread_db
        self._gain = {r: rng.uniform(-spread, spread) for r in ordered}
        self._freq = {r: _CHANNELS_MHZ[i % len(_CHANNELS_MHZ)] for i, r in enumerate(ordered)}
        self._bssid = {r: random_mac(rng) for r in ordered}
        self._phones = [
            make_phone(rng, layout, config)
            for _ in range(config.phones_per_room * len(layout.rooms))
        ]
        self._links: dict[str, _Link] = {}
        self._stale: dict[str, dict[str, _Link]] = {r: {} for r in ordered}
        self._events: dict[str, deque[Event]] = {r: deque() for r in ordered}
        self._aids = dict.fromkeys(ordered, 0)
        self._walls: dict[tuple[str, int, int, int], int] = {}
        self._walkers: dict[int, list[Passerby]] = {}
        self._stepped: float | None = None
        self._sessions: dict[str, tuple[str, float]] = {}
        self._down: set[str] = set()
        self._lock = threading.Lock()

    @property
    def device_macs(self) -> list[str]:
        return [phone.mac for phone in self._phones]

    def freq(self, ap_id: str) -> int:
        return self._freq[ap_id]

    def login(self, ap_id: str, username: str, password: str) -> str | None:
        if (username, password) != (USERNAME, PASSWORD):
            return None
        token = secrets.token_hex(16)
        self._sessions[token] = (ap_id, time.monotonic() + SESSION_TTL_S)
        return token

    def check_session(self, ap_id: str, token: str) -> bool:
        """rpcd renews a session on every call and expires it after `SESSION_TTL_S` of silence."""
        held = self._sessions.get(token)
        if held is None or held[0] != ap_id or time.monotonic() >= held[1]:
            return False
        self._sessions[token] = (ap_id, time.monotonic() + SESSION_TTL_S)
        return True

    @property
    def down(self) -> set[str]:
        return set(self._down)

    def kill(self, ap_id: str) -> None:
        self._down.add(ap_id)

    def revive(self, ap_id: str) -> None:
        self._down.discard(ap_id)

    def is_down(self, ap_id: str) -> bool:
        return ap_id in self._down

    def clients(self, ap_id: str, now: float) -> list[Station]:
        """The router's station table: its associated phones, plus roamed-away ones not yet expired."""
        with self._lock:
            self._advance(now)
            rows: list[Station] = []
            for phone in self._phones:
                link = self._links.get(phone.mac)
                if link is None or link.router != ap_id:
                    continue
                at, _walking = phone.where(now)
                link.signal = round(self._signal(phone.mac, phone.gain_db, at, ap_id, now))
                rows.append(self._station(phone.mac, link, now))
            rows += [self._station(mac, link, now) for mac, link in self._stale[ap_id].items()]
            return rows

    def events(self, ap_id: str, t0: float, t1: float) -> list[Event]:
        """hostapd's notifications on this router in (t0, t1]: every probe it heard, every join."""
        cfg = self.config
        spread = cfg.burst_spread_s
        with self._lock:
            self._advance(t1)
            found = [event for event in self._events[ap_id] if t0 < event.at <= t1]
            for sender in self._senders(t0 - spread, t1):
                for slot, at, mac, point in self._bursts(sender, t0 - spread, t1):
                    signal = self._signal(sender.key, sender.gain_db, point, ap_id, at)
                    if signal < cfg.probe_sensitivity_dbm:
                        continue
                    # A burst sweeps channel by channel, so each router hears it at its own moment.
                    heard = at + uniform(sender.key, slot, ap_id) * spread
                    repeats = 2 if uniform(sender.key, slot, ap_id, "repeat") < 0.5 else 1
                    for k in range(repeats):
                        if t0 < heard + 0.02 * k <= t1:
                            echo = round(signal + gaussian(cfg.fading_sigma_db, mac, ap_id, k))
                            payload = self._notification(ap_id, mac, echo, BROADCAST)
                            found.append(Event(heard + 0.02 * k, "probe", payload))
            return sorted(found, key=lambda event: event.at)

    def ground_truth(self, now: float, window_s: float = 60.0) -> dict:
        """Where every phone really is, and who sent every burst in the last `window_s`."""
        with self._lock:
            self._advance(now)
            phones = []
            for phone in self._phones:
                present = phone.present_at(now)
                at, walking = phone.where(now)
                room = self.layout.room_at(at) if present else None
                link = self._links.get(phone.mac)
                phones.append(
                    {
                        "mac": phone.mac,
                        "present": present,
                        "position": {"x": at.x, "y": at.y, "z": at.z} if present else None,
                        "roomId": room.id if room else None,
                        "walking": present and walking,
                        "associatedTo": link.router if link else None,
                    }
                )
            sent = [
                {"address": mac, "source": sender.key, "at": at}
                for sender in self._senders(now - window_s, now)
                for _slot, at, mac, _point in self._bursts(sender, now - window_s, now)
            ]
            return {"phones": phones, "bursts": sent}

    def _advance(self, now: float) -> None:
        """Steps every association up to `now`; a caller asking about the past changes nothing."""
        step = self.config.assoc_step_s
        if self._stepped is None:
            self._stepped = math.floor(now / step) * step - step
        while self._stepped + step <= now:
            self._stepped += step
            self._step(self._stepped)
        limit = self.config.ap_max_inactivity_s
        for table in self._stale.values():
            for mac in [m for m, link in table.items() if (link.ended or 0.0) + limit <= now]:
                del table[mac]
        for events in self._events.values():
            while events and events[0].at < now - _EVENT_MEMORY_S:
                events.popleft()

    def _step(self, now: float) -> None:
        for phone in self._phones:
            link = self._links.get(phone.mac)
            if not phone.present_at(now):
                if link is not None:
                    self._end(phone.mac, link, now)
                continue
            at, _walking = phone.where(now)
            signals = {r: self._signal(phone.mac, phone.gain_db, at, r, now) for r in self.aps}
            choice = next_association(link.router if link else None, signals, self.config)
            if link is not None and choice == link.router:
                link.signal = round(signals[link.router])
                continue
            if link is not None:
                self._end(phone.mac, link, now)
            if choice is not None:
                self._join(phone.mac, choice, round(signals[choice]), now)

    def _join(self, mac: str, router: str, signal: int, now: float) -> None:
        # A rejoin replaces the station entry the router still held from before.
        self._stale[router].pop(mac, None)
        self._aids[router] = self._aids[router] % _MAX_AID + 1
        self._links[mac] = _Link(router, now, self._aids[router], signal)
        for kind in ("auth", "assoc"):
            payload = self._notification(router, mac, signal, self._bssid[router])
            self._events[router].append(Event(now, kind, payload))

    def _end(self, mac: str, link: _Link, now: float) -> None:
        # Nothing tells the old router a phone left: it keeps the entry until inactivity expires it.
        del self._links[mac]
        link.ended = now
        self._stale[link.router][mac] = link

    def _station(self, mac: str, link: _Link, now: float) -> Station:
        until = link.ended if link.ended is not None else now
        connected = until - link.since
        per_second = 2.0 + 18.0 * uniform(mac, "traffic")
        if link.ended is None:
            inactive_ms = round(uniform(mac, "idle", int(now)) * 2000)
        else:
            inactive_ms = round((now - link.ended) * 1000)
        return Station(
            mac=mac,
            signal=link.signal,
            aid=link.aid,
            connected_s=int(connected),
            inactive_ms=inactive_ms,
            rx_packets=int(per_second * connected),
            tx_packets=int(per_second * connected * 0.6),
            stale=link.ended is not None,
        )

    def _notification(self, router: str, address: str, signal: int, target: str) -> dict:
        return {
            "address": address,
            "ifname": IFACE,
            "target": target,
            "signal": signal,
            "freq": self._freq[router],
        }

    def _signal(self, key: str, gain_db: float, at: Point, router_id: str, now: float) -> float:
        cfg = self.config
        router = self.layout.routers[router_id]
        loss = cfg.wall_loss_db * self._walls_to(router_id, at)
        loss += cfg.slab_loss_db * self.layout.slabs_between(at, router.position)
        shadow = gaussian(cfg.shadow_sigma_db, key, router_id, int(now // cfg.shadow_period_s))
        fading = gaussian(cfg.fading_sigma_db, key, router_id, int(now))
        distance = at.distance(router.position)
        rssi = free_space_rssi(distance, cfg.rssi_at_1m_dbm, cfg.path_loss_exponent)
        return rssi - loss + self._gain[router_id] + gain_db + shadow + fading

    def _walls_to(self, router_id: str, at: Point) -> int:
        cell = (
            router_id,
            self.layout.floor_of(at.y),
            round(at.x / _CELL_M),
            round(at.z / _CELL_M),
        )
        walls = self._walls.get(cell)
        if walls is None:
            if len(self._walls) >= _WALL_CACHE_LIMIT:
                self._walls.clear()
            walls = self.layout.walls_between(at, self.layout.routers[router_id].position)
            self._walls[cell] = walls
        return walls

    def _senders(self, t0: float, t1: float) -> list[_Sender]:
        fraction = self.config.probe_random_mac_fraction
        senders = [
            _Sender(phone.mac, phone.mac, phone.gain_db, fraction, _phone_where(phone))
            for phone in self._phones
        ]
        for hour in range(math.floor(t0 / 3600) - 1, math.floor(t1 / 3600) + 1):
            for walker in self._walkers_of(hour):
                if walker.t1 >= t0 and walker.t0 <= t1:
                    # Not on this Wi-Fi, so every scan uses a fresh private address.
                    senders.append(
                        _Sender(walker.id, "", walker.gain_db, 1.0, _walker_where(walker))
                    )
        return senders

    def _walkers_of(self, hour: int) -> list[Passerby]:
        if hour not in self._walkers:
            for old in [h for h in self._walkers if h < hour - 3]:
                del self._walkers[old]
            self._walkers[hour] = passersby(self.building_id, self.layout, hour, self.config)
        return self._walkers[hour]

    def _bursts(self, sender: _Sender, t0: float, t1: float) -> list[tuple[int, float, str, Point]]:
        cfg = self.config

        def lit(now: float) -> bool:
            spot = sender.where(now)
            return spot is not None and screen_on(sender.key, now, spot[1], cfg)

        found: list[tuple[int, float, str, Point]] = []
        for slot, at in bursts(sender.key, t0, t1, lit, cfg):
            spot = sender.where(at)
            if spot is not None:
                mac = burst_mac(sender.key, slot, sender.mac, sender.random_fraction)
                found.append((slot, at, mac, spot[0]))
        return found


def simulate(
    building_id: str,
    rooms: Sequence[Room],
    routers: Sequence[tuple[str, str]],
    placements: Mapping[str, Point] | None,
    config: SimConfig,
) -> BuildingWorld | None:
    """The building's world; None when no router sits in a room the twin knows."""
    layout = Layout.of(rooms, routers, placements)
    return BuildingWorld(building_id, layout, config) if layout.routers else None


def _phone_where(phone: Phone) -> Callable[[float], tuple[Point, bool] | None]:
    def where(now: float) -> tuple[Point, bool] | None:
        return phone.where(now) if phone.present_at(now) else None

    return where


def _walker_where(walker: Passerby) -> Callable[[float], tuple[Point, bool] | None]:
    def where(now: float) -> tuple[Point, bool] | None:
        spot = walker.where(now)
        return (spot, True) if spot is not None else None

    return where
