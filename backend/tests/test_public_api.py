"""The endpoints the public site calls. No auth, so the guard rails matter."""
import re
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.bookings.models import Booking
from apps.content.models import ContactMessage, SiteSettings
from apps.customers.models import Customer
from apps.tournaments.models import Tournament, TournamentRegistration


pytestmark = pytest.mark.django_db


def _payload(pc_type, pc_plan, start_at, **overrides):
    return {
        "full_name": "New Player",
        "phone": "9812345670",
        "email": "player@example.com",
        "station_type": pc_type.id,
        "pricing_plan": pc_plan.id,
        "start_at": start_at.isoformat(),
        "seats": 1,
        **overrides,
    }


class TestBootstrap:
    def test_returns_everything_the_site_needs_in_one_call(self, api, pcs, pc_plan, site, open_all_week):
        body = api.get("/api/public/bootstrap/").json()
        for key in ("settings", "station_types", "business_hours", "gallery",
                    "testimonials", "faqs", "featured_games", "upcoming_tournaments",
                    "is_open_now"):
            assert key in body
        assert body["station_types"][0]["station_count"] == 3

    def test_inactive_station_types_are_hidden(self, api, pc_type, pcs, site):
        pc_type.is_active = False
        pc_type.save()
        assert api.get("/api/public/bootstrap/").json()["station_types"] == []


class TestBookingCreation:
    def test_creates_a_pending_booking(self, api, pcs, pc_type, pc_plan, site, tomorrow_at):
        res = api.post(
            "/api/public/bookings/",
            _payload(pc_type, pc_plan, tomorrow_at()),
            format="json",
        )
        assert res.status_code == 201
        body = res.json()
        assert re.fullmatch(r"[0-9A-F]{6}-001", body["code"])
        assert body["customer_code"] == body["code"].split("-")[0]
        assert body["status"] == "pending"
        assert float(body["amount_due"]) == 70.0

    def test_price_scales_with_seats(self, api, pcs, pc_type, pc_plan, site, tomorrow_at):
        res = api.post(
            "/api/public/bookings/",
            _payload(pc_type, pc_plan, tomorrow_at(), seats=3),
            format="json",
        )
        assert float(res.json()["amount_due"]) == 210.0

    def test_duration_comes_from_the_plan_not_the_client(self, api, pcs, pc_type, pc_plan,
                                                        site, tomorrow_at):
        api.post(
            "/api/public/bookings/",
            _payload(pc_type, pc_plan, tomorrow_at(), duration_minutes=999),
            format="json",
        )
        assert Booking.objects.get().duration_minutes == 60

    def test_rejects_a_start_inside_the_lead_window(self, api, pcs, pc_type, pc_plan, site):
        soon = timezone.localtime() + timedelta(minutes=5)
        res = api.post("/api/public/bookings/", _payload(pc_type, pc_plan, soon), format="json")
        assert res.status_code == 400
        assert "start_at" in res.json()

    def test_rejects_a_start_beyond_the_horizon(self, api, pcs, pc_type, pc_plan, site, tomorrow_at):
        far = tomorrow_at(days=60)
        res = api.post("/api/public/bookings/", _payload(pc_type, pc_plan, far), format="json")
        assert res.status_code == 400

    def test_rejects_a_short_phone_number(self, api, pcs, pc_type, pc_plan, site, tomorrow_at):
        res = api.post(
            "/api/public/bookings/",
            _payload(pc_type, pc_plan, tomorrow_at(), phone="12345"),
            format="json",
        )
        assert res.status_code == 400
        assert "phone" in res.json()

    def test_rejects_a_plan_from_a_different_station_type(self, api, pcs, ps5s, pc_type,
                                                          ps5_plan, site, tomorrow_at):
        res = api.post(
            "/api/public/bookings/",
            _payload(pc_type, ps5_plan, tomorrow_at()),
            format="json",
        )
        assert res.status_code == 400
        assert "pricing_plan" in res.json()

    def test_refuses_when_booking_is_switched_off(self, api, pcs, pc_type, pc_plan, site, tomorrow_at):
        site.booking_enabled = False
        site.save()
        res = api.post("/api/public/bookings/", _payload(pc_type, pc_plan, tomorrow_at()), format="json")
        assert res.status_code == 400

    def test_refuses_to_overbook(self, api, pcs, pc_type, pc_plan, site, make_booking, tomorrow_at):
        make_booking(seats=3, start_at=tomorrow_at(14))
        res = api.post(
            "/api/public/bookings/",
            _payload(pc_type, pc_plan, tomorrow_at(14), seats=1),
            format="json",
        )
        assert res.status_code == 400

    def test_creates_the_customer_record(self, api, pcs, pc_type, pc_plan, site, tomorrow_at):
        api.post("/api/public/bookings/", _payload(pc_type, pc_plan, tomorrow_at()), format="json")
        assert Customer.objects.filter(phone="9812345670").exists()

    def test_repeat_bookings_reuse_one_customer(self, api, pcs, pc_type, pc_plan, site, tomorrow_at):
        api.post("/api/public/bookings/", _payload(pc_type, pc_plan, tomorrow_at(14)), format="json")
        api.post("/api/public/bookings/", _payload(pc_type, pc_plan, tomorrow_at(18)), format="json")
        assert Customer.objects.filter(phone="9812345670").count() == 1


class TestBookingLookupAndCancel:
    def test_lookup_by_code(self, api, pcs, make_booking):
        booking = make_booking()
        body = api.get(f"/api/public/bookings/{booking.code}/").json()
        assert body["customer_code"] == booking.customer_code
        assert [b["code"] for b in body["bookings"]] == [booking.code]
        assert body["bookings"][0]["station_type"] == "Gaming PC"

    def test_lookup_is_case_insensitive(self, api, pcs, make_booking):
        booking = make_booking()
        assert api.get(f"/api/public/bookings/{booking.code.lower()}/").status_code == 200

    def test_unknown_code_is_404(self, api, db):
        assert api.get("/api/public/bookings/BFNOPE00/").status_code == 404

    def test_cancel_requires_the_matching_phone(self, api, pcs, make_booking):
        booking = make_booking(phone="9800000001")
        res = api.post(
            f"/api/public/bookings/{booking.code}/cancel/",
            {"phone": "9999999999"}, format="json",
        )
        assert res.status_code == 404
        booking.refresh_from_db()
        assert booking.status != Booking.Status.CANCELLED

    def test_cancel_with_the_right_phone(self, api, pcs, make_booking):
        booking = make_booking(phone="9800000001")
        res = api.post(
            f"/api/public/bookings/{booking.code}/cancel/",
            {"phone": "9800000001"}, format="json",
        )
        assert res.status_code == 200
        booking.refresh_from_db()
        assert booking.status == Booking.Status.CANCELLED

    def test_cannot_cancel_a_completed_booking(self, api, pcs, make_booking):
        booking = make_booking(phone="9800000001", status=Booking.Status.COMPLETED)
        res = api.post(
            f"/api/public/bookings/{booking.code}/cancel/",
            {"phone": "9800000001"}, format="json",
        )
        assert res.status_code == 400


class TestTournaments:
    @pytest.fixture
    def open_tournament(self, db):
        return Tournament.objects.create(
            title="Friday Valorant", game="Valorant", team_size=5, max_teams=8,
            starts_at=timezone.now() + timedelta(days=3),
            status=Tournament.Status.OPEN,
        )

    def test_draft_tournaments_are_hidden(self, api, open_tournament):
        open_tournament.status = Tournament.Status.DRAFT
        open_tournament.save()
        assert api.get("/api/public/tournaments/").json() == []

    def test_open_tournaments_are_listed(self, api, open_tournament):
        body = api.get("/api/public/tournaments/").json()
        assert len(body) == 1
        assert body[0]["is_registration_open"] is True

    def test_slug_is_generated_and_unique(self, db):
        first = Tournament.objects.create(
            title="Weekly Clash", game="Valorant",
            starts_at=timezone.now() + timedelta(days=1),
        )
        second = Tournament.objects.create(
            title="Weekly Clash", game="Valorant",
            starts_at=timezone.now() + timedelta(days=8),
        )
        assert first.slug == "weekly-clash"
        assert second.slug == "weekly-clash-2"

    def test_registration_creates_a_team(self, api, open_tournament):
        res = api.post("/api/public/registrations/", {
            "tournament": open_tournament.id, "team_name": "Ember Five",
            "captain_name": "Aditya", "phone": "9871112222",
        }, format="json")
        assert res.status_code == 201
        assert TournamentRegistration.objects.count() == 1

    def test_same_phone_cannot_register_twice(self, api, open_tournament):
        payload = {
            "tournament": open_tournament.id, "team_name": "Ember Five",
            "captain_name": "Aditya", "phone": "9871112222",
        }
        api.post("/api/public/registrations/", payload, format="json")
        res = api.post("/api/public/registrations/", {**payload, "team_name": "Other"},
                       format="json")
        assert res.status_code == 400
        assert "phone" in res.json()

    def test_cannot_register_for_a_closed_tournament(self, api, open_tournament):
        open_tournament.status = Tournament.Status.COMPLETED
        open_tournament.save()
        res = api.post("/api/public/registrations/", {
            "tournament": open_tournament.id, "team_name": "Late",
            "captain_name": "Nobody", "phone": "9871113333",
        }, format="json")
        assert res.status_code == 400

    def test_registration_closes_when_the_bracket_fills(self, api, open_tournament):
        open_tournament.max_teams = 1
        open_tournament.save()
        TournamentRegistration.objects.create(
            tournament=open_tournament, team_name="First", captain_name="A",
            phone="9871114444", status=TournamentRegistration.Status.CONFIRMED,
        )
        open_tournament.refresh_from_db()
        assert open_tournament.slots_left == 0
        assert open_tournament.is_registration_open is False


class TestContactForm:
    def test_accepts_a_message_with_a_phone(self, api, db):
        res = api.post("/api/public/contact/", {
            "name": "Meera", "phone": "9876500011", "message": "Do you do birthdays?",
        }, format="json")
        assert res.status_code == 201
        assert ContactMessage.objects.count() == 1

    def test_rejects_a_message_with_no_way_to_reply(self, api, db):
        res = api.post("/api/public/contact/", {
            "name": "Ghost", "message": "Call me",
        }, format="json")
        assert res.status_code == 400


class TestCounterOnlyRates:
    """Happy hour is advertised on the rates page but never sold by the booking
    flow: it picks a slot days ahead and cannot know whether the customer turns
    up inside the window."""

    @pytest.fixture
    def happy_hour(self, pc_type):
        from datetime import time

        from apps.catalog.models import PricingPlan

        return PricingPlan.objects.create(
            station_type=pc_type, name="Happy Hour", duration_minutes=60, price="50",
            available_from=time(11, 0), available_to=time(15, 0), is_bookable=False,
        )

    def test_a_counter_only_rate_cannot_be_booked(
        self, api, pcs, pc_type, happy_hour, site, tomorrow_at
    ):
        res = api.post(
            "/api/public/bookings/",
            _payload(pc_type, happy_hour, tomorrow_at()),
            format="json",
        )
        assert res.status_code == 400
        assert "counter" in str(res.data["pricing_plan"]).lower()
        assert Booking.objects.count() == 0

    def test_hiding_it_in_the_picker_is_not_the_only_guard(
        self, api, pcs, pc_type, happy_hour, site, tomorrow_at
    ):
        """Posting the id directly is exactly what the server-side check is for."""
        happy_hour.is_active = False   # not even listed on the site
        happy_hour.save()
        res = api.post(
            "/api/public/bookings/",
            _payload(pc_type, happy_hour, tomorrow_at()),
            format="json",
        )
        assert res.status_code == 400

    def test_ordinary_rates_still_book(self, api, pcs, pc_type, pc_plan, site, tomorrow_at):
        res = api.post(
            "/api/public/bookings/", _payload(pc_type, pc_plan, tomorrow_at()), format="json"
        )
        assert res.status_code == 201

    def test_the_rate_is_still_published_for_the_rates_page(
        self, api, pcs, pc_type, happy_hour, pc_plan, site
    ):
        plans = api.get("/api/public/bootstrap/").json()["station_types"][0]["pricing_plans"]
        by_name = {p["name"]: p for p in plans}
        assert by_name["Happy Hour"]["is_bookable"] is False
        assert by_name["1 Hour"]["is_bookable"] is True
        # The window is what the rates page prints next to it.
        assert by_name["Happy Hour"]["available_from"] == "11:00:00"

    def test_staff_can_flip_a_rate_between_bookable_and_counter_only(
        self, staff_api, happy_hour
    ):
        res = staff_api.patch(
            f"/api/admin/pricing-plans/{happy_hour.id}/", {"is_bookable": True}, format="json"
        )
        assert res.status_code == 200
        happy_hour.refresh_from_db()
        assert happy_hour.is_bookable is True
