# Digital Twin Model Editor — Implementation Plan

> **Purpose of this file.** A self-contained, phased plan for adding *direct-manipulation
> 3D editing* of the digital twin (move / stretch / add / delete / merge rooms) for
> organization admins. Written so it can be handed to a fresh implementer (Sonnet 5)
> after this chat is compacted. Each phase is independently shippable, follows the
> repo's **TDD (Red→Green→Refactor)** rule, and lists concrete files, endpoints, data
> shapes, and acceptance criteria.
>
> **Scope owner:** the frontend `ModelView` + `twin-service`. Touches `sensor-service`
> only for threshold/sensor cleanup on add/delete/merge.

---

## 0. Context the implementer must load first

### 0.1 What already exists (do not rebuild)
- **3D scene:** `client/src/views/ModelView.vue` renders rooms as a single
  `TresInstancedMesh` (unit cube instanced by per-room matrix) plus a separate overlay
  mesh for the *selected* room and an edge-outline for the *exploded* room. See
  `client/src/composables/scene/useInstancedRooms.ts` (`buildRoomMatrix`,
  `applyRoomMatrices`, `applyRoomColors`, `partitionRooms`).
- **Render mode is on-demand.** `client/src/composables/scene/useRenderMode.ts` returns
  `'always'` only while rotating, else `'on-demand'`. Any change that must repaint calls
  `requestFrame()` (bumps `frameRequestTick`, read by
  `client/src/components/scene/RenderInvalidator.vue`). **The editor drag loop must keep
  the canvas repainting** — switch render mode to `'always'` for the whole edit session
  (simplest, mirrors `isRotating`), and still `requestFrame()` after discrete edits.
- **Camera / controls:** `useSceneControls.ts`, `OrbitControls` from `@tresjs/cientos`.
- **Building state:** `client/src/composables/building/useBuildingModel.ts` holds
  `building`, `visibleRooms` (floor-filtered), `selectedRoomId`, `selectedFloor`.
- **Persistence store:** `client/src/stores/buildings.ts` — already has
  `updateRoomConfig()` and `updateBuildingConfig()` that PATCH twin-service and sync
  local state.
- **Permissions:** `client/src/composables/auth/useUserPermissions.ts` → `canEdit(domains)`
  is `true` for roles `business_admin | business_staff | admin`. **Gate all editing on this.**
- **Existing form-based edit:** `EditRoomModal.vue` (name/capacity/maxTemp/color only) wired
  in `RoomsSelector.vue` via `saveRoomConfig`. The new spatial editor is complementary — keep
  the modal for metadata.
- **Gizmo is available:** `@tresjs/cientos` exports `<TransformControls>` (verified). Three
  r0.184 also ships `three/examples/jsm/controls/TransformControls.js` as a fallback.

### 0.2 The room data model (client `models/building.ts`, server `models/building.ts` — identical)
```ts
Room = {
  id: string
  name: string
  capacity: number
  maxTemperature?: number        // lives in sensor-service thresholds, merged in client-side
  position: { x: number; y: number; z: number }
  dimensions: { width: number; height: number; depth: number }
  color?: string
}
Building = { id, name, maxTemperature?, rooms: Room[], domains: string[] }
```

### 0.3 Two invariants that MUST be pinned down in Phase 0 (they are currently ambiguous)
1. **`position` is the geometric CENTER of the box.** `buildRoomMatrix` composes a
   `BoxGeometry(1,1,1)` (centered on origin) translated by `position` and scaled by
   `dimensions` → the box is centered on `position`. The overlay mesh does the same.
   **BUT** the exploded-view containment filter in `useBuildingModel.visibleRooms` treats
   `position` as a **min-corner** (`r.position.x >= target.position.x && r.position.x +
   width <= ...`). This is a latent inconsistency. **Decision for the editor: `position`
   = center everywhere.** Snapping, collision, and floor math use center. Do not "fix" the
   exploded filter as part of this work unless a test forces it — just don't propagate the
   corner assumption.
2. **A "floor" is a distinct `position.y` value.** `visibleRooms` filters
   `r.position.y === selectedFloor`. Moving a room in Y moves it between floors. The editor
   should **snap Y to the set of existing floor levels by default** so admins don't
   accidentally create a new half-floor.

### 0.4 The backend gap you must close (Phase 0)
`server/twin-service/src/services/buildings.ts` → `updateRoom` currently applies **only**
`name | color | capacity` and **silently drops `position` and `dimensions`**, even though
the client `updateRoomConfig` already sends them to
`PATCH /twin/building/:buildingId/room/:roomId`. Nothing spatial can persist until this is
fixed. There is also **no create / delete / merge** endpoint.

### 0.5 Commands (Windows, prefix verbose ones with `rtk`)
- Client: `npm run dev`, `rtk npm run test:unit` (Vitest), `rtk npm run build`, `npm run lint:fix`
- twin-service: `rtk moon run twin-service:test`, `rtk moon run twin-service:build`,
  `rtk moon run twin-service:lint`
- **TDD is mandatory** (root `CLAUDE.md` §2). Write the failing test first for every phase.
- **Never `git commit`/`push` without the user explicitly asking** (root `CLAUDE.md` §4).

---

## 1. UX study — how comfortable 3D/spatial editors do it, and what we adopt

The users are **organization admins, not CAD operators.** The design goal ("more comfortable
than ever") means: never expose raw coordinates as the primary interaction, snap aggressively,
make every action reversible, and keep the number of modes tiny.

| App | The idea worth stealing | Our decision |
|---|---|---|
| **Figma** | Direct drag of an object; bounding-box handles resize; **smart guides + snapping** to other objects' edges/centers; everything is undoable; nudge with arrow keys. | The core interaction model. Our rooms are axis-aligned boxes → this maps perfectly. |
| **SketchUp** | Inference engine (snap to endpoints/edges/axes), on-object push/pull, minimal tool palette. | Snapping to neighbor faces + grid. Push/pull-style face resize in the 2D editor (Phase 4). |
| **Blender** | Transform gizmo with per-axis constraint (G/S/R + X/Y/Z); numeric type-in to confirm. | The 3D gizmo (`TransformControls`) with axis constraints, plus optional numeric readout. Power-user path, not the default. |
| **TinkerCAD** | Beginner-friendly: drag on a ground plane, a single height handle, snap grid, "drop onto workplane". | Constrain translate to the floor plane by default; a dedicated height handle; visible snap grid. |
| **Floor-plan tools** (RoomSketcher / Planner5D / Roomle) | **2D top-down plan** is where non-experts are fastest: drag rectangles, corner handles, merge adjacent rooms, everything on a grid. 3D is for *viewing*. | **The killer feature.** A per-floor 2D plan editor (Phase 4) is the most comfortable surface for the average admin; the 3D gizmo (Phases 2–3) is the "I want to see it in 3D" path. Both edit the same draft. |

### 1.1 Interaction principles we commit to
1. **Explicit Edit Mode.** A toggle (visible only to `canEdit` users) flips the view into an
   editing session. Outside edit mode nothing is draggable — no accidental edits from admins
   just browsing. Entering shows a toolbar; the room panel and telemetry coloring dim/pause.
2. **One selection, clear affordance.** Selecting a room shows its gizmo/handles and a small
   floating **inspector** (name + numeric W/H/D/X/Y/Z, editable). Direct manipulation and the
   numbers are two views of the same draft.
3. **Snap by default, free with a modifier.** Grid snap (e.g. 0.5 unit) + snap to neighbor
   room edges/centers with alignment guides. Hold a modifier (e.g. `Alt`) to move freely.
4. **Everything reversible.** Undo/redo stack from Phase 2 onward; `Esc` cancels a drag;
   Cancel discards the whole session; nothing hits the server until **Save**.
5. **Draft, then commit.** Edits mutate a **local draft**, not the live `building`. A dirty
   indicator + Save/Cancel. Save diffs draft vs. original and issues the minimal set of
   requests. This keeps telemetry/live coloring untouched mid-edit and makes Save atomic-ish.
6. **Guardrails, not walls.** Warn (don't block) on overlaps; block only truly invalid states
   (non-positive dimensions, empty building). Show a toast on save success/failure.

### 1.2 Modes / tools (kept intentionally small)
`Select` · `Move` · `Resize` · `Add room` · `Delete` · `Merge`. Rotate is deliberately
**excluded** (rooms are axis-aligned boxes; arbitrary rotation breaks the instancing model
and the floor/telemetry assumptions). If rotation is ever needed, it's a separate future epic.

---

## 2. Architecture of the editor (frontend)

Introduce an **edit-session draft layer** so live building state is never mutated in place.

```
useModelEditor()  ← new composable, the heart of the feature
  state:
    isEditing: Ref<boolean>
    draft: Ref<Building | null>        // deep clone of the building on enter
    selectedId, activeTool
    history: Building[] (undo), redo stack   // snapshots of draft.rooms (Phase 2+)
    dirty: computed (draft !== original by deep compare, or a mutation counter)
  ops (all mutate draft only, push history):
    beginEdit(building), cancel(), 
    moveRoom(id, newPositionPartial), resizeRoom(id, newDimsPartial),
    addRoom(seed), deleteRoom(id), mergeRooms(idA, idB),
    undo(), redo(),
    save()  → diff draft vs original, call store methods, then refresh
  helpers (pure, unit-tested in isolation):
    snapToGrid(value, step), snapToNeighbors(room, others) → guides,
    floorLevels(rooms) → sorted unique y,
    boxesOverlap(a, b), mergeBoxes(a, b) → union bbox,
    diffRooms(original, draft) → { added[], removed[], updated[] }
```

**Why a draft + diff instead of live PATCH-per-drag:** (a) telemetry coloring keeps working on
the untouched `building`; (b) drags would otherwise spam the server; (c) Save becomes a clean,
testable diff; (d) Cancel is free; (e) undo/redo is just snapshotting the draft.

Rendering during edit: feed `draft.rooms` (floor-filtered) into the existing instancing
pipeline instead of `building.rooms`. The selected room renders as the existing overlay mesh
and additionally hosts the gizmo. Set render mode `'always'` while `isEditing`.

---

## 3. Backend plan (twin-service) — do this in Phase 0, before any UI

All routes already sit behind `requireAuthentication`. **Add an authorization check**: the
caller must be a member with an editing role in one of the building's `domains` (mirror the
`isMemberOf` pattern in `controller/buildings.ts`; today `updateRoom`/`updateBuilding` check
auth but *not* domain-role — tighten this as part of the work and add a test).

### 3.1 Extend `updateRoom` to accept geometry
`services/buildings.ts` `updateRoom`: also apply `position` and `dimensions` when present.
Validate: `dimensions.{width,height,depth} > 0`; `position.{x,y,z}` finite numbers. Reject with
`ValidationError` otherwise. Keep `syncBuildingClone(...)` after save (contracts-service seam).

### 3.2 New endpoints
| Method & path | Purpose | Body | Notes |
|---|---|---|---|
| `POST /building/:buildingId/room` | Create a room | `{ name, capacity, position, dimensions, color? }` (server assigns `id` via `randomUUID`) | After save, init sensor-service thresholds for the new room (see §3.4). |
| `DELETE /building/:buildingId/room/:roomId` | Delete a room | — | After save, clean up thresholds/sensors for that room (§3.4). Block deleting the last room. |
| `PUT /building/:buildingId/rooms` | **Atomic bulk replace** of the rooms array | `{ rooms: Room[] }` | The primary Save path. Server validates every room, computes added/removed vs. current, persists, then reconciles sensor-service (§3.4). Preferred over N per-room calls for a multi-op session. |

**Recommendation:** implement the **bulk `PUT /rooms`** and make the client `save()` use it.
It makes the frontend diff optional (server can diff), keeps Save atomic, and is the cleanest
contract for move+resize+add+delete+merge in one session. Keep the granular POST/DELETE/PATCH
too (useful for tests and future partial saves), but the UI's Save uses `PUT`.

Wire all new routes in `server/twin-service/src/router.ts` and controllers in
`controller/buildings.ts` (HTTP-only; delegate to services).

### 3.3 Merge is a client-composed operation
No dedicated merge endpoint needed. `mergeRooms(a,b)` in the draft produces one room (union
bounding box via `mergeBoxes`, kept name/color of the primary, summed capacity) and drops the
other; Save then persists via `PUT /rooms`. Server stays generic.

### 3.4 Sensor / threshold reconciliation (sensor-service)
Rooms carry threshold rows and possibly registered sensors (see
`useBuildingDraft.submit` and `stores/buildings.ts register`, which init peopleCount/temp/aqi
thresholds per room at `/sensor/thresholds/...`).
- **Add room:** after twin create, PATCH default thresholds for the new room id (reuse the
  defaults in `useBuildingDraft`: `minTemp 18, maxTemp 27, maxAqi 75, maxCo2 1000`).
- **Delete / merge-away room:** best-effort delete/ignore its thresholds and reassign or drop
  its sensors. **Do not fail the geometry save if sensor cleanup fails** — log and continue
  (thresholds for a dead room are harmless; orphaned sensors are a separate cleanup concern).
  Reassign sensors of a merged-away room to the surviving room where feasible.
- Keep this reconciliation in twin-service's service layer calling sensor-service with the
  forwarded bearer token (the existing `authToken` plumbing), so the client stays simple.

### 3.5 Tests (Jest, `mongodb-memory-server`) — write first
- `updateRoom` persists `position`/`dimensions`; rejects non-positive dims / non-finite coords.
- authorization: non-member / viewer role → 403; editing role → 200.
- create room assigns id, appears in `getBuildingById`, thresholds initialized.
- delete room removes it; blocks deleting the last room.
- `PUT /rooms` replaces the array atomically; added/removed reconciled; invalid room in the
  array rejects the whole request (no partial write).
- `syncBuildingClone` invoked on every mutation (spy).

---

## 4. Phases

> Each phase: write tests first, implement, run the suite, report real results. Ship-able alone.

### Phase 0 — Backend foundation + pin invariants  *(no visible UI change)*
**Goal:** geometry can persist; create/delete/bulk endpoints exist; invariants documented.
- twin-service §3.1–3.5 (extend updateRoom, add POST/DELETE/PUT, authz check, sensor recon).
- Add a short note to `documentation/developer/design/buildings.qd` (or `twin-architecture.qd`)
  recording the **position = center** and **floor = distinct y** invariants (§0.3).
- Extend `client/src/stores/buildings.ts`: add `createRoom`, `deleteRoom`, and
  `saveRooms(buildingId, rooms)` (the `PUT /rooms` caller) alongside existing methods; keep
  local `byDomain` state in sync.
- **Client tests:** store methods issue the right requests and sync state (mirror existing
  `updateRoomConfig` tests).
**Acceptance:** twin-service suite green incl. new tests; a manual `curl`/test shows a moved
room persists and survives reload. No UI yet.

### Phase 1 — Edit Mode scaffolding + draft layer + Move gizmo (MVP, the "wow")
**Goal:** an admin can enter Edit Mode, drag a room in 3D, Save, and see it persist.
- `useModelEditor()` composable (§2) with `beginEdit/cancel/save/moveRoom/select`, `draft`,
  `isEditing`, `dirty`. `save()` uses `saveRooms` (bulk PUT).
- ModelView: render `draft.rooms` when editing; set render mode `'always'`; disable
  telemetry recolor while editing (freeze colors to standard).
- New `EditToolbar.vue` (top or left): **Edit / Save / Cancel**, dirty dot. Only mounted when
  `canEdit(building.domains)`.
- `<TransformControls>` (cientos) in **translate** mode attached to the selected room's mesh.
  Wire its `dragging-changed` (or equivalent) to **disable OrbitControls while dragging**, and
  on change write the new center back through `moveRoom(id, position)`. Constrain to the floor
  plane (X/Z) by default; grid-snap via `snapToGrid`.
- Pure helpers + unit tests: `snapToGrid`, `floorLevels`, `moveRoom` updates only draft,
  `diffRooms`, `save()` calls store with the diffed set (mock the store).
- Component test: entering edit mode clones building; Cancel restores; Save calls `saveRooms`.
**Acceptance:** drag a room on its floor, Save, reload → position persisted. Cancel discards.
Non-admins never see the toolbar. Telemetry view unaffected outside edit mode.

### Phase 2 — Resize / stretch + Undo/redo + Inspector
**Goal:** change room size comfortably; every action reversible; numeric precision available.
- Add scale handling: `TransformControls` in **scale** mode → map scale delta to
  `dimensions`, keeping the box axis-aligned; **compensate position** so the face you didn't
  grab stays put (grab a face, opposite face anchored) — implement `resizeRoom` to take a face
  + delta, or map gizmo scale + reposition. Grid-snap dimensions.
- Tool switch **Move / Resize** in the toolbar (and keyboard: e.g. `M`/`S`).
- **Undo/redo**: snapshot `draft.rooms` before each mutating op; `Ctrl+Z` / `Ctrl+Shift+Z`;
  toolbar buttons. Cap history depth (e.g. 50).
- **Inspector panel** (`RoomInspector.vue`): editable numeric X/Y/Z/W/H/D + name/color for the
  selected room; two-way bound to the draft (typing is just another op that snapshots).
  Y field is a **dropdown of existing floor levels** by default (+ "custom").
- Arrow-key nudge of the selected room (grid step); `Shift` = larger step.
- Tests: `resizeRoom` anchors the opposite face; undo/redo restores exact snapshots; inspector
  edits mutate draft and are undoable; dimension validation blocks ≤0.
**Acceptance:** stretch a room from a face, undo returns it exactly; type W=5 and see it apply;
Save persists sizes.

### Phase 3 — Snapping, alignment guides, collision feedback
**Goal:** the Figma-grade "it just lines up" feel.
- `snapToNeighbors(room, others)`: snap moving/resizing edges & centers to nearby rooms'
  edges/centers within a pixel/world threshold; return the guide lines to draw.
- Render transient **guide lines** (thin `TresLineSegments`) while dragging; snap indicator.
- Overlap detection (`boxesOverlap`) on the current floor → **non-blocking** visual warning
  (tint the overlapping room / a toast). Never auto-resolve.
- Modifier to bypass snapping (free move) — e.g. hold `Alt`.
- Tests: snapping picks the nearest candidate within threshold and ignores beyond it; guides
  computed correctly; overlap flagged but save still allowed.
**Acceptance:** dragging a room visibly snaps to a neighbor's edge with a guide line; grid and
neighbor snapping both work; overlaps warn without blocking.

### Phase 4 — 2D top-down floor-plan editor (the most comfortable surface)
**Goal:** a Figma/RoomSketcher-style per-floor plan where non-experts edit fastest.
- New `FloorPlanEditor.vue` — an SVG or 2D `<canvas>` overlay (toggle **3D ⇄ 2D Plan** in the
  toolbar) showing the **current floor** as top-down rectangles (X = x, Y-of-plan = z; height
  is out-of-plane and edited via the inspector or a small field).
- Interactions: click-select; drag to move; **corner + edge handles** to resize; same
  `useModelEditor` draft, snapping, guides, undo/redo (reuse everything from Phases 2–3, just a
  different input surface). Grid background.
- Add-room = drag a rectangle on empty plan; capacity/height default, editable in inspector.
- This is the same draft and same Save path — 2D and 3D are interchangeable views.
- Tests: pointer math (screen→world) round-trips; resize handles map to correct edges;
  drawing a rectangle creates a room in the draft on the active floor's y.
**Acceptance:** an admin can lay out a floor entirely in 2D — move, resize, add — then switch
to 3D and see it, then Save.

### Phase 5 — Add / Delete / Duplicate / Merge / Split
**Goal:** structural editing, not just moving existing boxes.
- **Add:** toolbar "Add room" → drops a default box on the active floor at camera focus (3D)
  or via rectangle draw (2D). Uses `store.createRoom` on Save via the bulk PUT diff.
- **Delete:** select + Delete key / button; confirm if the room has registered sensors.
  Blocks deleting the last room.
- **Duplicate:** clone selected room offset by one grid step (fast way to build repetitive
  layouts).
- **Merge:** select two adjacent rooms → "Merge" → `mergeRooms` (union bbox via `mergeBoxes`,
  keep primary's name/color, sum capacity, reassign the absorbed room's sensors to the
  survivor). Warn if the two boxes aren't actually adjacent/overlapping.
- **Split (optional):** split a selected room along a chosen axis at the midpoint into two
  rooms; new ids; capacity halved.
- Tests: `mergeBoxes` produces the correct union; merge reassigns sensors and drops the second
  room; delete guards; duplicate offsets and gets a fresh id; Save's diff contains the right
  add/remove sets.
**Acceptance:** admin merges two side-by-side rooms into one, sensors preserved on the
survivor, Save persists; add/delete/duplicate all round-trip.

### Phase 6 — Polish, safety, docs
- **Unsaved-changes guard:** intercept route leave / tab close while `dirty` (Vue Router
  `onBeforeRouteLeave` + `beforeunload`).
- **Save UX:** optimistic apply to `building` on success; toasts for success/failure; on
  failure keep the draft so the admin can retry. Handle partial/late telemetry gracefully on
  return to view mode.
- **Performance:** verify the instanced pipeline still updates matrices only on room-set
  changes (don't force per-frame matrix rebuilds); confirm no Three.js leaks (dispose gizmo,
  guide-line geometries, remove listeners on unmount) — the ModelView hot-path rules in
  `client/CLAUDE.md` still apply.
- **Accessibility / keyboard:** document all shortcuts; ensure toolbar is reachable.
- **Docs:** update `documentation/developer/design/buildings.qd` and the user docs
  (`documentation/user/usage/…`) with an "Editing your building" section. Follow the
  Quarkdown code-block convention (fenced ``` blocks).
- Full regression: `rtk npm run test:unit`, `rtk npm run build`, `rtk moon run twin-service:test`.

---

## 5. Risks & decisions locked in
- **No rotation** (axis-aligned boxes only) — protects instancing, floor, and telemetry-routing
  assumptions. Revisit only as a separate epic.
- **position = center, floor = distinct y** — enforced in the editor; do not adopt the
  exploded-filter's corner assumption.
- **Draft + bulk Save**, not live per-drag PATCH — keeps telemetry live, makes Save atomic and
  testable, gives free Cancel/undo.
- **Sensor cleanup is best-effort** on delete/merge — never block a geometry save on it.
- **Authorization is per-domain-role**, checked server-side too (not just the hidden UI).
- Keep the existing `EditRoomModal` for metadata (name/capacity/temp/color); the spatial editor
  owns geometry. Consider merging them behind one inspector in Phase 2.

## 6. Suggested file inventory (new)
**Client**
- `composables/scene/useModelEditor.ts` (+ `__tests__`)
- `composables/scene/editorGeometry.ts` — pure helpers: snapToGrid, snapToNeighbors, mergeBoxes,
  boxesOverlap, floorLevels, diffRooms (+ `__tests__`)
- `components/panels/EditToolbar.vue`
- `components/panels/RoomInspector.vue`
- `components/scene/RoomGizmo.vue` (wraps cientos `TransformControls`)
- `components/scene/EditGuides.vue` (transient guide lines)
- `components/scene/FloorPlanEditor.vue` (Phase 4)
- store additions in `stores/buildings.ts`: `createRoom`, `deleteRoom`, `saveRooms`

**twin-service**
- `services/buildings.ts`: extend `updateRoom`; add `createRoom`, `deleteRoom`, `replaceRooms`
- `controller/buildings.ts` + `router.ts`: new routes
- `services/sensors.ts` (or a new reconcile helper): threshold/sensor reconcile on add/remove
- tests in `__tests__/building.test.ts` (+ authz cases in `authentication.test.ts`)

---

**Start at Phase 0. Write the failing test first each time. Do not commit or push unless the
user explicitly asks.**
