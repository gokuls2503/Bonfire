"""Per-controller pricing for consoles.

A PS5 is one screen a group shares, so it is priced per controller and the rate
falls as the group grows: each person pays less, the console earns more.
"""
from decimal import Decimal

import pytest

from apps.bookings.models import Booking
from apps.catalog.models import ControllerRate

pytestmark = pytest.mark.django_db

# The owner's one-hour rates.
HOURLY = {1: "200", 2: "150", 3: "125", 4: "100"}


@pytest.fixture
def ps5_console(ps5_type):
    ps5_type.prices_per_controller = True
    ps5_type.max_players_per_station = 4
    ps5_type.save()
    return ps5_type


@pytest.fixture
def hour_plan(ps5_console, ps5_plan):
    for controllers, rate in HOURLY.items():
        ControllerRate.objects.create(
            plan=ps5_plan, controllers=controllers, price_per_controller=rate
        )
    return ps5_plan


# ---------- the price itself ----------

@pytest.mark.parametrize("controllers,each,total", [
    (1, "200", "200"), (2, "150", "300"), (3, "125", "375"), (4, "100", "400"),
])
def test_the_group_rate_is_what_the_owner_set(hour_plan, controllers, each, total):
    rate = hour_plan.rate_for(controllers)
    assert rate.price_per_controller == Decimal(each)
    assert rate.total == Decimal(total)
    assert hour_plan.price_for(controllers=controllers) == Decimal(total)


def test_each_controller_costs_less_as_the_group_grows(hour_plan):
    per_head = [hour_plan.rate_for(n).price_per_controller for n in (1, 2, 3, 4)]
    assert per_head == sorted(per_head, reverse=True)

    # ...while the console earns more overall. Both halves matter.
    totals = [hour_plan.price_for(controllers=n) for n in (1, 2, 3, 4)]
    assert totals == sorted(totals)


def test_an_unpriced_group_size_falls_back_to_the_one_below(hour_plan):
    """A plan priced to 4 still answers for 5 rather than failing."""
    assert hour_plan.rate_for(5).price_per_controller == Decimal("100")


def test_booking_two_consoles_doubles_the_group_price(hour_plan):
    assert hour_plan.price_for(controllers=3, seats=2) == Decimal("750")


def test_a_station_priced_per_seat_ignores_controllers(pc_plan):
    """The PC is unchanged: a flat price per station, whatever is plugged in."""
    assert pc_plan.station_type.prices_per_controller is False
    assert pc_plan.price_for(controllers=4) == Decimal("70")
    assert pc_plan.price_for(controllers=1, seats=3) == Decimal("210")


def test_a_console_plan_with_no_rates_falls_back_to_its_flat_price(ps5_console, ps5_plan):
    assert ps5_plan.rate_for(2) is None
    assert ps5_plan.price_for(controllers=2) == Decimal("90")


# ---------- what a booking ends up owing ----------

def test_a_booking_is_priced_from_its_controller_count(hour_plan, ps5s, tomorrow_at):
    booking = Booking.objects.create(
        full_name="Squad", phone="9800007001", station_type=hour_plan.station_type,
        pricing_plan=hour_plan, start_at=tomorrow_at(), duration_minutes=60, controllers=4,
    )
    assert booking.amount_due == Decimal("400.00")


def test_one_player_pays_the_solo_rate(hour_plan, ps5s, tomorrow_at):
    booking = Booking.objects.create(
        full_name="Solo", phone="9800007002", station_type=hour_plan.station_type,
        pricing_plan=hour_plan, start_at=tomorrow_at(), duration_minutes=60, controllers=1,
    )
    assert booking.amount_due == Decimal("200.00")


def test_more_controllers_than_the_console_takes_is_rejected(hour_plan, ps5s, tomorrow_at):
    from django.core.exceptions import ValidationError

    booking = Booking(
        full_name="Too Many", phone="9800007003", station_type=hour_plan.station_type,
        pricing_plan=hour_plan, start_at=tomorrow_at(), duration_minutes=60, controllers=5,
    )
    with pytest.raises(ValidationError) as exc:
        booking.clean()
    assert "controller" in str(exc.value).lower()


# ---------- through the public API ----------

def _payload(station_type, plan, start_at, **extra):
    return {
        "full_name": "Group Booking", "phone": "9812345671",
        "station_type": station_type.id, "pricing_plan": plan.id,
        "start_at": start_at.isoformat(), "seats": 1, **extra,
    }


def test_the_public_site_books_at_the_group_rate(api, ps5s, hour_plan, site, tomorrow_at):
    res = api.post(
        "/api/public/bookings/",
        _payload(hour_plan.station_type, hour_plan, tomorrow_at(), controllers=3),
        format="json",
    )
    assert res.status_code == 201, res.data
    assert Booking.objects.get(code=res.data["code"]).amount_due == Decimal("375.00")


def test_the_public_site_cannot_ask_for_more_controllers_than_exist(
    api, ps5s, hour_plan, site, tomorrow_at
):
    res = api.post(
        "/api/public/bookings/",
        _payload(hour_plan.station_type, hour_plan, tomorrow_at(), controllers=9),
        format="json",
    )
    assert res.status_code == 400
    assert Booking.objects.count() == 0


def test_the_rates_reach_the_public_site(api, ps5s, hour_plan, site):
    types = api.get("/api/public/bootstrap/").json()["station_types"]
    ps5 = next(t for t in types if t["id"] == hour_plan.station_type_id)
    assert ps5["prices_per_controller"] is True
    assert ps5["max_players_per_station"] == 4

    plan = next(p for p in ps5["pricing_plans"] if p["id"] == hour_plan.id)
    rates = {r["controllers"]: r for r in plan["controller_rates"]}
    assert rates[2]["price_per_controller"] == "150.00"
    assert rates[2]["total"] == "300.00"


def test_staff_can_change_a_group_rate(staff_api, hour_plan):
    rate = hour_plan.rate_for(4)
    res = staff_api.patch(
        f"/api/admin/controller-rates/{rate.id}/", {"price_per_controller": "90"},
        format="json",
    )
    assert res.status_code == 200
    assert hour_plan.rate_for(4).price_per_controller == Decimal("90")


def test_one_rate_per_group_size(hour_plan):
    from django.db import IntegrityError

    with pytest.raises(IntegrityError):
        ControllerRate.objects.create(
            plan=hour_plan, controllers=2, price_per_controller="999"
        )


def test_booking_both_consoles_charges_for_both(api, ps5s, ps5_type, hour_plan, site, tomorrow_at):
    """The group rate is per console, so two consoles cost twice one."""
    from apps.catalog.models import Station

    # A second console, so there is capacity for seats=2.
    Station.objects.get_or_create(name="PS5-02", station_type=ps5_type)

    res = api.post(
        "/api/public/bookings/",
        _payload(hour_plan.station_type, hour_plan, tomorrow_at(), controllers=4, seats=2),
        format="json",
    )
    assert res.status_code == 201, res.data
    booking = Booking.objects.get(code=res.data["code"])
    assert booking.seats == 2
    assert booking.controllers == 4
    # 4 controllers at Rs100 each = Rs400 a console, twice over.
    assert booking.amount_due == Decimal("800.00")
