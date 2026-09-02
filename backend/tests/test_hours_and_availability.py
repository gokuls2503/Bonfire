"""Opening hours, the past-midnight wrap, closures, and the availability endpoint."""
from datetime import time, timedelta
from unittest import mock

import pytest
from django.utils import timezone

from apps.api.views_public import _is_open_now
from apps.bookings.models import BusinessHours, Closure


pytestmark = pytest.mark.django_db


def _set_hours(weekday, opens, closes, is_closed=False):
    BusinessHours.objects.update_or_create(
        weekday=weekday,
        defaults={"opens_at": opens, "closes_at": closes, "is_closed": is_closed},
    )


def _freeze(local_dt):
    """Pin timezone.localtime() to a specific local datetime."""
    return mock.patch.object(timezone, "localtime", return_value=local_dt)


@pytest.fixture
def a_monday():
    """A concrete Monday at 15:00 local, so weekday() is deterministic."""
    local = timezone.localtime().replace(hour=15, minute=0, second=0, microsecond=0)
    return local - timedelta(days=local.weekday())


class TestIsOpenNow:
    def test_open_inside_normal_hours(self, a_monday):
        _set_hours(0, time(10, 0), time(23, 0))
        with _freeze(a_monday.replace(hour=15)):
            assert _is_open_now() is True

    def test_closed_before_opening(self, a_monday):
        _set_hours(0, time(10, 0), time(23, 0))
        with _freeze(a_monday.replace(hour=9)):
            assert _is_open_now() is False

    def test_closed_after_closing(self, a_monday):
        _set_hours(0, time(10, 0), time(23, 0))
        with _freeze(a_monday.replace(hour=23, minute=30)):
            assert _is_open_now() is False

    def test_past_midnight_close_is_open_late_evening(self, a_monday):
        """10:00 -> 02:00 means 'open till 2am', not 'closed all day'."""
        _set_hours(0, time(10, 0), time(2, 0))
        with _freeze(a_monday.replace(hour=23, minute=45)):
            assert _is_open_now() is True

    def test_past_midnight_close_is_open_in_the_small_hours(self, a_monday):
        _set_hours(0, time(10, 0), time(2, 0))
        with _freeze(a_monday.replace(hour=1, minute=30)):
            assert _is_open_now() is True

    def test_past_midnight_close_is_shut_in_the_gap(self, a_monday):
        _set_hours(0, time(10, 0), time(2, 0))
        with _freeze(a_monday.replace(hour=6)):
            assert _is_open_now() is False

    def test_flagged_closed_day(self, a_monday):
        _set_hours(0, time(10, 0), time(23, 0), is_closed=True)
        with _freeze(a_monday.replace(hour=15)):
            assert _is_open_now() is False

    def test_full_day_closure_overrides_open_hours(self, a_monday):
        _set_hours(0, time(10, 0), time(23, 0))
        Closure.objects.create(date=a_monday.date(), reason="Private event", is_full_day=True)
        with _freeze(a_monday.replace(hour=15)):
            assert _is_open_now() is False

    def test_partial_closure_narrows_the_window(self, a_monday):
        _set_hours(0, time(10, 0), time(23, 0))
        Closure.objects.create(
            date=a_monday.date(), reason="Closing early", is_full_day=False,
            opens_at=time(10, 0), closes_at=time(16, 0),
        )
        with _freeze(a_monday.replace(hour=15)):
            assert _is_open_now() is True
        with _freeze(a_monday.replace(hour=17)):
            assert _is_open_now() is False

    def test_no_hours_configured_means_closed(self, a_monday):
        BusinessHours.objects.all().delete()
        with _freeze(a_monday):
            assert _is_open_now() is False


class TestAvailabilityEndpoint:
    def test_returns_slots_for_an_open_day(self, api, pcs, site, open_all_week):
        tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
        res = api.get(f"/api/public/availability/?date={tomorrow}&duration=60")
        assert res.status_code == 200
        body = res.json()
        assert body["is_open"] is True
        pc = body["station_types"][0]
        assert pc["capacity"] == 3
        assert len(pc["slots"]) > 0
        assert all(s["free"] == 3 for s in pc["slots"])

    def test_existing_bookings_reduce_free_seats(self, api, pcs, site, open_all_week,
                                                 make_booking, tomorrow_at):
        make_booking(seats=2, start_at=tomorrow_at(14))
        tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
        res = api.get(f"/api/public/availability/?date={tomorrow}&duration=60")

        slots = {s["label"]: s for s in res.json()["station_types"][0]["slots"]}
        assert slots["2:00 PM"]["free"] == 1
        assert slots["4:00 PM"]["free"] == 3

    def test_closed_day_returns_a_reason_and_no_slots(self, api, pcs, site, open_all_week):
        target = timezone.localdate() + timedelta(days=1)
        Closure.objects.create(date=target, reason="Deep clean", is_full_day=True)
        res = api.get(f"/api/public/availability/?date={target.isoformat()}")
        body = res.json()
        assert body["is_open"] is False
        assert body["slots"] == []
        assert "Deep clean" in body["reason"]

    def test_date_beyond_the_horizon_is_refused(self, api, pcs, site, open_all_week):
        far = (timezone.localdate() + timedelta(days=90)).isoformat()
        body = api.get(f"/api/public/availability/?date={far}").json()
        assert body["is_open"] is False

    def test_malformed_date_is_a_400(self, api, site):
        assert api.get("/api/public/availability/?date=not-a-date").status_code == 400

    def test_filtering_by_station_type(self, api, pcs, ps5s, pc_type, site, open_all_week):
        tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
        body = api.get(
            f"/api/public/availability/?date={tomorrow}&station_type={pc_type.id}"
        ).json()
        assert len(body["station_types"]) == 1
        assert body["station_types"][0]["station_type"] == "Gaming PC"
