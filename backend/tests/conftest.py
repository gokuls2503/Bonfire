"""Shared fixtures. Everything builds on a small, realistic cafe: 3 PCs, 1 PS5."""
from datetime import time, timedelta

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.bookings.models import Booking, BusinessHours
from apps.catalog.models import PricingPlan, Station, StationType
from apps.content.models import SiteSettings


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def pc_type(db):
    return StationType.objects.create(name="Gaming PC", sort_order=1)


@pytest.fixture
def ps5_type(db):
    return StationType.objects.create(name="PS5 Console", sort_order=2)


@pytest.fixture
def pcs(pc_type):
    return [
        Station.objects.create(name=f"PC-0{i}", station_type=pc_type, sort_order=i)
        for i in range(1, 4)
    ]


@pytest.fixture
def ps5s(ps5_type):
    return [Station.objects.create(name="PS5-01", station_type=ps5_type)]


@pytest.fixture
def pc_plan(pc_type):
    return PricingPlan.objects.create(
        station_type=pc_type, name="1 Hour", duration_minutes=60, price="70"
    )


@pytest.fixture
def ps5_plan(ps5_type):
    return PricingPlan.objects.create(
        station_type=ps5_type, name="1 Hour", duration_minutes=60, price="90"
    )


@pytest.fixture
def open_all_week(db):
    """Open 10:00-23:00 every day, so date maths never trips over a closed day."""
    for weekday in range(7):
        BusinessHours.objects.update_or_create(
            weekday=weekday,
            defaults={"opens_at": time(10, 0), "closes_at": time(23, 0), "is_closed": False},
        )


@pytest.fixture
def site(db):
    settings_obj = SiteSettings.load()
    settings_obj.booking_enabled = True
    settings_obj.booking_lead_minutes = 30
    settings_obj.booking_horizon_days = 14
    settings_obj.save()
    return settings_obj


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        username="counter", password="pw-counter", is_staff=True
    )


@pytest.fixture
def plain_user(db):
    return User.objects.create_user(username="randomer", password="pw-randomer")


@pytest.fixture
def staff_api(api, staff_user):
    api.force_authenticate(staff_user)
    return api


@pytest.fixture
def tomorrow_at():
    """A timezone-aware datetime at a given hour tomorrow, safely inside opening hours."""
    def _at(hour=14, minute=0, days=1):
        local = timezone.localtime() + timedelta(days=days)
        return local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return _at


@pytest.fixture
def make_booking(pc_type, pc_plan, tomorrow_at):
    def _make(**kwargs):
        defaults = {
            "full_name": "Regular",
            "phone": "9800000001",
            "station_type": pc_type,
            "pricing_plan": pc_plan,
            "start_at": tomorrow_at(),
            "duration_minutes": 60,
            "seats": 1,
            "status": Booking.Status.CONFIRMED,
        }
        return Booking.objects.create(**{**defaults, **kwargs})
    return _make
