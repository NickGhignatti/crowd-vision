from geometry import Layout, Point, Room


def _room(room_id: str, x: float, z: float, y: float = 1.5) -> Room:
    return Room(room_id, Point(x, y, z), width=10.0, height=3.0, depth=10.0)


ADJACENT = [_room("a", 5, 5), _room("b", 15, 5)]
CORRIDOR = [_room("a", 5, 5), _room("b", 17, 5)]
STACKED = [_room("ground", 5, 5, y=1.5), _room("upper", 5, 5, y=4.5)]


def test_two_points_in_one_room_cross_no_wall():
    assert Layout(ADJACENT, []).walls_between(Point(2, 1.2, 2), Point(8, 1.2, 8)) == 0


def test_adjacent_rooms_share_one_wall():
    assert Layout(ADJACENT, []).walls_between(Point(5, 1.2, 5), Point(15, 1.2, 5)) == 1


def test_a_corridor_between_two_rooms_is_two_walls():
    assert Layout(CORRIDOR, []).walls_between(Point(5, 1.2, 5), Point(17, 1.2, 5)) == 2


def test_floors_come_from_room_bottoms_and_one_slab_separates_them():
    layout = Layout(STACKED, [])
    assert (layout.floor_of(1.2), layout.floor_of(4.2)) == (0, 1)
    assert layout.slabs_between(Point(5, 1.2, 5), Point(5, 4.2, 5)) == 1
    assert layout.slabs_between(Point(5, 1.2, 5), Point(6, 2.5, 5)) == 0


def test_room_at_finds_the_box_on_the_points_own_floor():
    upper = Layout(STACKED, []).room_at(Point(5, 4.2, 5))
    assert upper is not None and upper.id == "upper"
    assert Layout(CORRIDOR, []).room_at(Point(11, 1.2, 5)) is None


def test_a_placed_router_sits_where_placed_else_at_its_room_centre():
    layout = Layout.of(
        ADJACENT, [("r1", "a"), ("r2", "b"), ("r3", "ghost")], {"r1": Point(1, 2.8, 1)}
    )
    assert layout.routers["r1"].position == Point(1, 2.8, 1)
    assert layout.routers["r2"].position == Point(15, 1.5, 5)
    assert "r3" not in layout.routers


def test_the_footprint_spans_every_room():
    assert Layout(CORRIDOR, []).footprint == (0.0, 0.0, 22.0, 10.0)
