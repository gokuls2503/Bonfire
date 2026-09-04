"""Daily sales reporting and the cash/online split.

Money is recognised on completed_at, so these tests set it explicitly rather
than relying on when the row happened to be written.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.bookings.models import Booking
from apps.tournaments.models import Tournament, TournamentRegistration


pytestmark = pytest.mark.django_db


@pytest.fixture
def settle(pcs, make_booking):
    """Create a completed, paid booking settled on a given day."""
    counter = {"n": 0}

    def _settle(amount, method, days_ago=0, seats=1):
        counter["n"] += 1
        when = timezone.now() - timedelta(days=days_ago)
        booking = make_booking(
            phone=f"98000{counter['n']:05d}",
            start_at=when,
            seats=seats,
            status=Booking.Status.COMPLETED,
            payment_status=Booking.PaymentStatus.PAID,
            payment_method=method,
            amount_due=Decimal(str(amount)),
            amount_collected=Decimal(str(amount)),
        )
        Booking.objects.filter(pk=booking.pk).update(completed_at=when)
        booking.refresh_from_db()
        return booking

    return _settle


def _sales(staff_api, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    res = staff_api.get(f"/api/admin/sales/?{query}")
    assert res.status_code == 200
    return res.json()


class TestAuth:
    def test_anonymous_is_rejected(self, api):
        assert api.get("/api/admin/sales/").status_code == 401

    def test_non_staff_is_rejected(self, api, plain_user):
        api.force_authenticate(plain_user)
        assert api.get("/api/admin/sales/").status_code == 403

    def test_transactions_endpoint_is_also_guarded(self, api):
        assert api.get("/api/admin/sales/transactions/").status_code == 401


class TestTotals:
    def test_empty_range_reports_zeroes_without_dividing_by_zero(self, staff_api, pcs):
        body = _sales(staff_api, preset="today")
        assert body["totals"]["revenue"] == 0
        assert body["totals"]["cash_share"] == 0
        assert body["totals"]["avg_per_session"] == 0

    def test_sums_todays_takings(self, staff_api, settle):
        settle(70, "cash")
        settle(90, "upi")
        body = _sales(staff_api, preset="today")
        assert body["totals"]["revenue"] == 160.0
        assert body["totals"]["sessions"] == 2

    def test_splits_cash_from_online(self, staff_api, settle):
        settle(100, "cash")
        settle(50, "upi")
        settle(50, "card")
        body = _sales(staff_api, preset="today")["totals"]
        assert body["cash"] == 100.0
        assert body["online"] == 100.0
        assert body["cash_share"] == 50.0
        assert body["online_share"] == 50.0

    def test_card_and_other_count_as_online(self, staff_api, settle):
        settle(30, "card")
        settle(20, "other")
        assert _sales(staff_api, preset="today")["totals"]["online"] == 50.0

    def test_average_per_session(self, staff_api, settle):
        settle(100, "cash")
        settle(200, "cash")
        assert _sales(staff_api, preset="today")["totals"]["avg_per_session"] == 150.0

    def test_unpaid_bookings_are_not_revenue(self, staff_api, pcs, make_booking):
        make_booking(
            status=Booking.Status.COMPLETED,
            payment_status=Booking.PaymentStatus.UNPAID,
            amount_due=Decimal("70"), amount_collected=Decimal("0"),
        )
        assert _sales(staff_api, preset="today")["totals"]["revenue"] == 0

    def test_cancelled_bookings_are_not_revenue(self, staff_api, pcs, make_booking):
        make_booking(
            status=Booking.Status.CANCELLED,
            amount_due=Decimal("70"), amount_collected=Decimal("70"),
        )
        assert _sales(staff_api, preset="today")["totals"]["revenue"] == 0


class TestByMethod:
    def test_breakdown_shares_add_up(self, staff_api, settle):
        settle(75, "cash")
        settle(25, "upi")
        rows = {r["method"]: r for r in _sales(staff_api, preset="today")["by_method"]}
        assert rows["cash"]["amount"] == 75.0
        assert rows["cash"]["share"] == 75.0
        assert rows["cash"]["is_online"] is False
        assert rows["upi"]["is_online"] is True

    def test_cash_and_upi_always_appear_even_at_zero(self, staff_api, pcs):
        methods = {r["method"] for r in _sales(staff_api, preset="today")["by_method"]}
        assert {"cash", "upi"} <= methods


class TestByDay:
    def test_one_row_per_day_including_quiet_days(self, staff_api, settle):
        settle(70, "cash", days_ago=0)
        settle(70, "cash", days_ago=3)
        body = _sales(staff_api, preset="7d")
        assert len(body["by_day"]) == 7
        assert sum(1 for d in body["by_day"] if d["revenue"] > 0) == 2
        assert any(d["revenue"] == 0 for d in body["by_day"])

    def test_days_carry_their_own_cash_online_split(self, staff_api, settle):
        settle(60, "cash", days_ago=1)
        settle(40, "upi", days_ago=1)
        yesterday = str((timezone.localdate() - timedelta(days=1)))
        row = next(d for d in _sales(staff_api, preset="7d")["by_day"] if d["date"] == yesterday)
        assert row["cash"] == 60.0
        assert row["online"] == 40.0
        assert row["revenue"] == 100.0

    def test_busiest_day_is_reported(self, staff_api, settle):
        settle(50, "cash", days_ago=2)
        settle(500, "cash", days_ago=1)
        body = _sales(staff_api, preset="7d")
        assert body["busiest_day"]["revenue"] == 500.0


class TestRanges:
    def test_today_excludes_older_takings(self, staff_api, settle):
        settle(70, "cash", days_ago=0)
        settle(999, "cash", days_ago=5)
        assert _sales(staff_api, preset="today")["totals"]["revenue"] == 70.0

    def test_explicit_from_to(self, staff_api, settle):
        settle(70, "cash", days_ago=2)
        target = str(timezone.localdate() - timedelta(days=2))
        body = _sales(staff_api, **{"from": target, "to": target})
        assert body["totals"]["revenue"] == 70.0
        assert body["range"]["days"] == 1

    def test_reversed_range_is_swapped_not_empty(self, staff_api, settle):
        settle(70, "cash", days_ago=2)
        older = str(timezone.localdate() - timedelta(days=4))
        newer = str(timezone.localdate())
        body = _sales(staff_api, **{"from": newer, "to": older})
        assert body["range"]["from"] == older
        assert body["totals"]["revenue"] == 70.0

    def test_month_preset_starts_on_the_first(self, staff_api, pcs):
        body = _sales(staff_api, preset="month")
        assert body["range"]["from"].endswith("-01")

    def test_bad_dates_fall_back_instead_of_erroring(self, staff_api, pcs):
        res = staff_api.get("/api/admin/sales/?from=garbage&to=alsogarbage")
        assert res.status_code == 200


class TestStationTypeBreakdown:
    def test_revenue_attributed_per_platform(self, staff_api, settle, ps5s, ps5_type,
                                             ps5_plan, tomorrow_at):
        settle(70, "cash")
        when = timezone.now()
        console = Booking.objects.create(
            full_name="Console", phone="9899999999", station_type=ps5_type,
            pricing_plan=ps5_plan, start_at=when, duration_minutes=60, seats=1,
            status=Booking.Status.COMPLETED, payment_status=Booking.PaymentStatus.PAID,
            payment_method="upi", amount_due=Decimal("90"), amount_collected=Decimal("90"),
        )
        Booking.objects.filter(pk=console.pk).update(completed_at=when)

        rows = {r["station_type"]: r for r in _sales(staff_api, preset="today")["by_station_type"]}
        assert rows["Gaming PC"]["revenue"] == 70.0
        assert rows["PS5 Console"]["revenue"] == 90.0
        assert rows["PS5 Console"]["hours"] == 1.0


class TestTournamentEntryFees:
    @pytest.fixture
    def paid_team(self, db):
        tournament = Tournament.objects.create(
            title="Friday Valorant", game="Valorant", entry_fee=Decimal("500"),
            starts_at=timezone.now() + timedelta(days=2), status=Tournament.Status.OPEN,
        )
        return TournamentRegistration.objects.create(
            tournament=tournament, team_name="Ember", captain_name="A", phone="9871119999",
            status=TournamentRegistration.Status.CONFIRMED, payment_status="paid",
            payment_method="upi", amount_paid=Decimal("500"), paid_at=timezone.now(),
        )

    def test_entry_fees_are_counted_in_revenue(self, staff_api, pcs, paid_team):
        totals = _sales(staff_api, preset="today")["totals"]
        assert totals["entry_fees_revenue"] == 500.0
        assert totals["revenue"] == 500.0
        assert totals["online"] == 500.0

    def test_entry_fees_and_bookings_are_reported_separately(self, staff_api, settle, paid_team):
        settle(70, "cash")
        totals = _sales(staff_api, preset="today")["totals"]
        assert totals["bookings_revenue"] == 70.0
        assert totals["entry_fees_revenue"] == 500.0
        assert totals["revenue"] == 570.0

    def test_unpaid_entry_fees_are_excluded(self, staff_api, pcs, paid_team):
        paid_team.payment_status = "unpaid"
        paid_team.save()
        assert _sales(staff_api, preset="today")["totals"]["entry_fees_revenue"] == 0


class TestOutstanding:
    def test_unpaid_completed_bookings_are_flagged(self, staff_api, pcs, make_booking):
        make_booking(
            status=Booking.Status.COMPLETED,
            payment_status=Booking.PaymentStatus.UNPAID,
            amount_due=Decimal("70"),
        )
        body = _sales(staff_api, preset="today")
        assert body["totals"]["outstanding"] == 70.0
        assert len(body["outstanding_bookings"]) == 1

    def test_record_payment_settles_a_balance(self, staff_api, pcs, make_booking):
        booking = make_booking(
            status=Booking.Status.COMPLETED,
            payment_status=Booking.PaymentStatus.UNPAID,
            amount_due=Decimal("70"),
        )
        res = staff_api.post(f"/api/admin/bookings/{booking.id}/record_payment/",
                             {"payment_method": "upi"}, format="json")
        assert res.status_code == 200
        booking.refresh_from_db()
        assert booking.payment_status == Booking.PaymentStatus.PAID
        assert booking.payment_method == "upi"
        assert float(booking.amount_collected) == 70.0

    def test_record_payment_needs_a_method(self, staff_api, pcs, make_booking):
        booking = make_booking(status=Booking.Status.COMPLETED)
        res = staff_api.post(f"/api/admin/bookings/{booking.id}/record_payment/", {},
                             format="json")
        assert res.status_code == 400


class TestCompleteRequiresMethod:
    def test_rejects_a_missing_method(self, staff_api, pcs, make_booking):
        booking = make_booking()
        res = staff_api.post(f"/api/admin/bookings/{booking.id}/complete/", {}, format="json")
        assert res.status_code == 400
        assert "payment_method" in res.json()

    def test_rejects_an_unknown_method(self, staff_api, pcs, make_booking):
        booking = make_booking()
        res = staff_api.post(f"/api/admin/bookings/{booking.id}/complete/",
                             {"payment_method": "bitcoin"}, format="json")
        assert res.status_code == 400

    def test_waived_needs_no_method(self, staff_api, pcs, make_booking):
        booking = make_booking()
        res = staff_api.post(f"/api/admin/bookings/{booking.id}/complete/",
                             {"payment_status": "waived"}, format="json")
        assert res.status_code == 200
        booking.refresh_from_db()
        assert booking.payment_status == Booking.PaymentStatus.WAIVED
        assert booking.payment_method == ""

    def test_completing_unpaid_zeroes_the_collected_amount(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("70"))
        staff_api.post(f"/api/admin/bookings/{booking.id}/complete/",
                       {"payment_status": "unpaid"}, format="json")
        booking.refresh_from_db()
        assert float(booking.amount_collected) == 0


class TestTransactions:
    def test_lists_bookings_and_entry_fees_together(self, staff_api, settle):
        settle(70, "cash")
        res = staff_api.get("/api/admin/sales/transactions/?preset=today")
        body = res.json()
        assert body["count"] == 1
        assert body["total"] == 70.0
        assert body["transactions"][0]["kind"] == "booking"
        assert body["transactions"][0]["method_label"] == "Cash"

    def test_filtering_by_method(self, staff_api, settle):
        settle(70, "cash")
        settle(90, "upi")
        body = staff_api.get("/api/admin/sales/transactions/?preset=today&method=upi").json()
        assert body["count"] == 1
        assert body["total"] == 90.0

    def test_newest_first(self, staff_api, settle):
        settle(70, "cash", days_ago=3)
        settle(90, "cash", days_ago=0)
        rows = staff_api.get("/api/admin/sales/transactions/?preset=7d").json()["transactions"]
        assert rows[0]["amount"] == 90.0
