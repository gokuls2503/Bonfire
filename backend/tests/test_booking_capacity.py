"""Capacity is the rule that stops the cafe double-selling a seat.

It lives in Booking.clean() so staff-created and website bookings obey it equally.
"""
import re
from datetime import timedelta

import pytest
from django.core.exceptions import ValidationError

from apps.bookings.models import Booking


pytestmark = pytest.mark.django_db


def test_booking_within_capacity_is_allowed(pcs, make_booking):
    booking = make_booking(seats=3)
    booking.full_clean(exclude=["code"])


def test_booking_more_seats_than_stations_is_rejected(pcs, pc_type, pc_plan, tomorrow_at):
    booking = Booking(
        full_name="Too big", phone="9800000002", station_type=pc_type,
        pricing_plan=pc_plan, start_at=tomorrow_at(), duration_minutes=60, seats=4,
    )
    with pytest.raises(ValidationError) as exc:
        booking.clean()
    assert "seats" in exc.value.message_dict


def test_overlapping_bookings_cannot_exceed_capacity(pcs, pc_type, pc_plan, make_booking, tomorrow_at):
    make_booking(seats=2, start_at=tomorrow_at(14))

    clash = Booking(
        full_name="Third wheel", phone="9800000003", station_type=pc_type,
        pricing_plan=pc_plan, start_at=tomorrow_at(14, 30), duration_minutes=60, seats=2,
    )
    with pytest.raises(ValidationError) as exc:
        clash.clean()
    assert "start_at" in exc.value.message_dict


def test_back_to_back_bookings_do_not_overlap(pcs, pc_type, pc_plan, make_booking, tomorrow_at):
    """A booking that starts exactly when another ends is not a conflict."""
    make_booking(seats=3, start_at=tomorrow_at(14))

    later = Booking(
        full_name="Next up", phone="9800000004", station_type=pc_type,
        pricing_plan=pc_plan, start_at=tomorrow_at(15), duration_minutes=60, seats=3,
    )
    later.clean()  # must not raise


def test_cancelled_bookings_free_their_seats(pcs, pc_type, pc_plan, make_booking, tomorrow_at):
    make_booking(seats=3, start_at=tomorrow_at(14), status=Booking.Status.CANCELLED)

    replacement = Booking(
        full_name="Takes the slot", phone="9800000005", station_type=pc_type,
        pricing_plan=pc_plan, start_at=tomorrow_at(14), duration_minutes=60, seats=3,
    )
    replacement.clean()  # cancelled rows must not block


def test_other_station_types_do_not_consume_pc_capacity(pcs, ps5s, ps5_type, ps5_plan,
                                                        make_booking, pc_type, pc_plan, tomorrow_at):
    make_booking(seats=3, start_at=tomorrow_at(14))

    console = Booking(
        full_name="Console player", phone="9800000006", station_type=ps5_type,
        pricing_plan=ps5_plan, start_at=tomorrow_at(14), duration_minutes=60, seats=1,
    )
    console.clean()  # PS5 capacity is tracked separately


def test_inactive_stations_do_not_count_toward_capacity(pcs, pc_type, pc_plan, tomorrow_at):
    pcs[0].is_active = False
    pcs[0].save()

    booking = Booking(
        full_name="Optimist", phone="9800000007", station_type=pc_type,
        pricing_plan=pc_plan, start_at=tomorrow_at(), duration_minutes=60, seats=3,
    )
    with pytest.raises(ValidationError):
        booking.clean()


def test_editing_a_booking_does_not_conflict_with_itself(pcs, make_booking):
    booking = make_booking(seats=3)
    booking.duration_minutes = 120
    booking.clean()  # its own row must be excluded from the overlap scan


def test_end_at_is_derived_from_duration(make_booking):
    booking = make_booking(duration_minutes=90)
    assert booking.end_at == booking.start_at + timedelta(minutes=90)


def test_booking_code_is_unique_and_derived_from_the_customer(pcs, make_booking):
    """Five different phones -> five customers -> five distinct -001 codes."""
    codes = {make_booking(phone=f"98000001{i:02d}", seats=1).code for i in range(5)}
    assert len(codes) == 5
    assert all(re.fullmatch(r"[0-9A-F]{6}-001", code) for code in codes)
