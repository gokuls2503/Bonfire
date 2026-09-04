"""The staff console. Auth boundaries first, then the booking lifecycle."""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.bookings.models import Booking
from apps.catalog.models import Station
from apps.content.models import ContactMessage, SiteSettings
from apps.tournaments.models import Tournament, TournamentRegistration


pytestmark = pytest.mark.django_db

ADMIN_PATHS = [
    "/api/admin/dashboard/",
    "/api/admin/me/",
    "/api/admin/site-settings/",
    "/api/admin/bookings/",
    "/api/admin/stations/",
    "/api/admin/station-types/",
    "/api/admin/pricing-plans/",
    "/api/admin/customers/",
    "/api/admin/tournaments/",
    "/api/admin/registrations/",
    "/api/admin/messages/",
    "/api/admin/business-hours/",
    "/api/admin/closures/",
    "/api/admin/gallery/",
    "/api/admin/testimonials/",
    "/api/admin/faqs/",
    "/api/admin/games/",
]


class TestAuthBoundary:
    @pytest.mark.parametrize("path", ADMIN_PATHS)
    def test_anonymous_is_rejected(self, api, path):
        assert api.get(path).status_code == 401

    @pytest.mark.parametrize("path", ADMIN_PATHS)
    def test_logged_in_non_staff_is_rejected(self, api, plain_user, path):
        api.force_authenticate(plain_user)
        assert api.get(path).status_code == 403

    def test_staff_gets_through(self, staff_api):
        assert staff_api.get("/api/admin/dashboard/").status_code == 200

    def test_anonymous_cannot_write(self, api, pc_type):
        res = api.post("/api/admin/stations/", {"name": "PC-99", "station_type": pc_type.id})
        assert res.status_code == 401

    def test_non_staff_cannot_write(self, api, plain_user, pc_type):
        api.force_authenticate(plain_user)
        res = api.post("/api/admin/stations/", {"name": "PC-99", "station_type": pc_type.id})
        assert res.status_code == 403

    def test_jwt_flow_issues_a_working_token(self, api, staff_user):
        res = api.post(
            "/api/auth/token/",
            {"username": "counter", "password": "pw-counter"}, format="json",
        )
        assert res.status_code == 200
        access = res.json()["access"]
        api.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        assert api.get("/api/admin/me/").status_code == 200

    def test_wrong_password_gets_no_token(self, api, staff_user):
        res = api.post(
            "/api/auth/token/",
            {"username": "counter", "password": "nope"}, format="json",
        )
        assert res.status_code == 401


class TestBookingLifecycle:
    def test_confirm(self, staff_api, pcs, make_booking):
        booking = make_booking(status=Booking.Status.PENDING)
        res = staff_api.post(f"/api/admin/bookings/{booking.id}/confirm/", {}, format="json")
        assert res.status_code == 200
        booking.refresh_from_db()
        assert booking.status == Booking.Status.CONFIRMED

    def test_check_in_marks_the_station_occupied(self, staff_api, pcs, make_booking):
        booking = make_booking()
        station = pcs[0]
        res = staff_api.post(
            f"/api/admin/bookings/{booking.id}/check_in/",
            {"station": station.id}, format="json",
        )
        assert res.status_code == 200
        booking.refresh_from_db()
        station.refresh_from_db()
        assert booking.status == Booking.Status.CHECKED_IN
        assert booking.checked_in_at is not None
        assert booking.station_id == station.id
        assert station.status == Station.Status.OCCUPIED

    def test_complete_frees_the_station_and_records_payment(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due="70.00")
        station = pcs[0]
        staff_api.post(f"/api/admin/bookings/{booking.id}/check_in/",
                       {"station": station.id}, format="json")
        res = staff_api.post(f"/api/admin/bookings/{booking.id}/complete/",
                             {"payment_method": "cash"}, format="json")

        assert res.status_code == 200
        booking.refresh_from_db()
        station.refresh_from_db()
        assert booking.status == Booking.Status.COMPLETED
        assert booking.payment_status == Booking.PaymentStatus.PAID
        assert float(booking.amount_collected) == 70.0
        assert booking.completed_at is not None
        assert station.status == Station.Status.AVAILABLE

    def test_complete_accepts_a_different_amount(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due="70.00")
        staff_api.post(f"/api/admin/bookings/{booking.id}/complete/",
                       {"amount_collected": "50.00", "payment_method": "upi"}, format="json")
        booking.refresh_from_db()
        assert float(booking.amount_collected) == 50.0
        assert booking.payment_method == Booking.PaymentMethod.UPI

    def test_cancel_releases_the_station(self, staff_api, pcs, make_booking):
        booking = make_booking()
        station = pcs[0]
        staff_api.post(f"/api/admin/bookings/{booking.id}/check_in/",
                       {"station": station.id}, format="json")
        staff_api.post(f"/api/admin/bookings/{booking.id}/cancel/", {}, format="json")
        station.refresh_from_db()
        assert station.status == Station.Status.AVAILABLE

    def test_no_show(self, staff_api, pcs, make_booking):
        booking = make_booking()
        staff_api.post(f"/api/admin/bookings/{booking.id}/no_show/", {}, format="json")
        booking.refresh_from_db()
        assert booking.status == Booking.Status.NO_SHOW

    def test_staff_created_booking_obeys_capacity(self, staff_api, pcs, pc_type, pc_plan,
                                                  make_booking, tomorrow_at):
        make_booking(seats=3, start_at=tomorrow_at(14))
        res = staff_api.post("/api/admin/bookings/", {
            "full_name": "Walk-in", "phone": "9800009999",
            "station_type": pc_type.id, "pricing_plan": pc_plan.id,
            "start_at": tomorrow_at(14).isoformat(),
            "duration_minutes": 60, "seats": 1, "status": "confirmed",
        }, format="json")
        assert res.status_code == 400


class TestStationManagement:
    def test_set_status(self, staff_api, pcs):
        station = pcs[0]
        res = staff_api.post(f"/api/admin/stations/{station.id}/set_status/",
                             {"status": "maintenance", "status_note": "GPU RMA"},
                             format="json")
        assert res.status_code == 200
        station.refresh_from_db()
        assert station.status == Station.Status.MAINTENANCE
        assert station.status_note == "GPU RMA"

    def test_unknown_status_is_rejected(self, staff_api, pcs):
        res = staff_api.post(f"/api/admin/stations/{pcs[0].id}/set_status/",
                             {"status": "on fire"}, format="json")
        assert res.status_code == 400

    def test_adding_a_station_raises_public_capacity(self, staff_api, api, pcs, pc_type,
                                                     site, open_all_week):
        """The growth path: new hardware must widen booking capacity with no code change."""
        tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
        before = api.get(f"/api/public/availability/?date={tomorrow}").json()
        assert before["station_types"][0]["capacity"] == 3

        staff_api.post("/api/admin/stations/",
                       {"name": "PC-04", "station_type": pc_type.id}, format="json")

        after = api.get(f"/api/public/availability/?date={tomorrow}").json()
        assert after["station_types"][0]["capacity"] == 4


class TestDashboard:
    def test_reports_todays_numbers(self, staff_api, pcs, make_booking):
        today = timezone.localtime().replace(hour=14, minute=0, second=0, microsecond=0)
        make_booking(start_at=today, status=Booking.Status.PENDING, phone="9800000011")
        make_booking(start_at=today, status=Booking.Status.CONFIRMED, phone="9800000012")

        body = staff_api.get("/api/admin/dashboard/").json()
        assert body["today"]["bookings"] == 2
        assert body["today"]["pending"] == 1
        assert body["attention"]["pending_bookings"] >= 0
        assert body["stations"]["total"] == 3
        assert len(body["trend_7d"]) == 7

    def test_counts_unread_messages(self, staff_api, pcs):
        ContactMessage.objects.create(name="A", phone="9800000001", message="hi")
        body = staff_api.get("/api/admin/dashboard/").json()
        assert body["attention"]["unread_messages"] == 1


class TestSiteSettings:
    def test_is_a_singleton(self, db):
        first = SiteSettings.load()
        second = SiteSettings.load()
        assert first.pk == second.pk == 1
        assert SiteSettings.objects.count() == 1

    def test_staff_can_patch_it(self, staff_api):
        res = staff_api.patch("/api/admin/site-settings/",
                              {"phone": "+91 98765 43210"}, format="json")
        assert res.status_code == 200
        assert SiteSettings.load().phone == "+91 98765 43210"

    def test_changes_show_on_the_public_site(self, staff_api, api, pcs):
        staff_api.patch("/api/admin/site-settings/",
                        {"tagline": "Stay a while"}, format="json")
        body = api.get("/api/public/bootstrap/").json()
        assert body["settings"]["tagline"] == "Stay a while"

    def test_full_address_joins_the_parts(self, db):
        s = SiteSettings.load()
        s.address_line1 = "2nd Floor, Nexus Plaza"
        s.city = "Kochi"
        s.postal_code = "682016"
        s.save()
        assert s.full_address == "2nd Floor, Nexus Plaza, Kochi, 682016"


class TestTournamentAdmin:
    def test_duplicate_clones_a_week_forward_as_a_draft(self, staff_api, db):
        original = Tournament.objects.create(
            title="Friday Valorant", game="Valorant",
            starts_at=timezone.now() + timedelta(days=2),
            registration_closes_at=timezone.now() + timedelta(days=1),
            status=Tournament.Status.OPEN, is_recurring_weekly=True,
        )
        res = staff_api.post(f"/api/admin/tournaments/{original.id}/duplicate/",
                             {"weeks_ahead": 1}, format="json")
        assert res.status_code == 201
        clone = Tournament.objects.get(id=res.json()["id"])
        assert clone.status == Tournament.Status.DRAFT
        assert clone.starts_at == original.starts_at + timedelta(weeks=1)
        assert clone.registration_closes_at == original.registration_closes_at + timedelta(weeks=1)
        assert clone.slug != original.slug

    def test_set_registration_status(self, staff_api, db):
        tournament = Tournament.objects.create(
            title="Solo Cup", game="EA FC 26",
            starts_at=timezone.now() + timedelta(days=2), status=Tournament.Status.OPEN,
        )
        reg = TournamentRegistration.objects.create(
            tournament=tournament, team_name="Solo", captain_name="A", phone="9871110000",
        )
        res = staff_api.post(
            f"/api/admin/registrations/{reg.id}/set_status/",
            {"status": "confirmed", "payment_status": "paid", "payment_method": "cash"},
            format="json",
        )
        assert res.status_code == 200
        reg.refresh_from_db()
        assert reg.status == TournamentRegistration.Status.CONFIRMED
        assert reg.payment_status == TournamentRegistration.PaymentStatus.PAID
        assert reg.payment_method == "cash"
        assert reg.paid_at is not None
