"""Per-phone customer codes and the booking sequence derived from them.

A code identifies the customer; the 3-digit suffix identifies the visit. The
customer half must never change, and a sequence number must never be reused.
"""
import re
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.bookings.models import Booking
from apps.customers.models import Customer, normalise_code


pytestmark = pytest.mark.django_db

CUSTOMER_RE = re.compile(r"^[0-9A-F]{6}$")
BOOKING_RE = re.compile(r"^[0-9A-F]{6}-\d{3}$")


class TestCustomerCode:
    def test_assigned_on_creation(self, db):
        customer = Customer.objects.create(full_name="Meera", phone="9800000001")
        assert CUSTOMER_RE.match(customer.code)

    def test_carries_no_prefix(self, db):
        customer = Customer.objects.create(full_name="Meera", phone="9800000001")
        assert not customer.code.startswith("BF")

    def test_is_stable_across_saves(self, db):
        customer = Customer.objects.create(full_name="Meera", phone="9800000001")
        original = customer.code
        customer.full_name = "Meera K"
        customer.save()
        customer.refresh_from_db()
        assert customer.code == original

    def test_different_phones_get_different_codes(self, db):
        a = Customer.objects.create(full_name="A", phone="9800000001")
        b = Customer.objects.create(full_name="B", phone="9800000002")
        assert a.code != b.code

    def test_booking_sequence_starts_at_zero(self, db):
        customer = Customer.objects.create(full_name="Meera", phone="9800000001")
        assert customer.booking_sequence == 0


class TestBookingCode:
    def test_first_booking_is_001(self, pcs, make_booking):
        booking = make_booking(phone="9800000001")
        assert booking.code.endswith("-001")
        assert BOOKING_RE.match(booking.code)

    def test_second_booking_same_phone_increments(self, pcs, make_booking, tomorrow_at):
        first = make_booking(phone="9800000001", start_at=tomorrow_at(12))
        second = make_booking(phone="9800000001", start_at=tomorrow_at(16))
        assert first.customer_code == second.customer_code
        assert first.code.endswith("-001")
        assert second.code.endswith("-002")

    def test_prefix_matches_the_customer_code(self, pcs, make_booking):
        booking = make_booking(phone="9800000001")
        assert booking.code.split("-")[0] == booking.customer.code
        assert booking.customer_code == booking.customer.code

    def test_different_phones_get_different_prefixes(self, pcs, make_booking, tomorrow_at):
        a = make_booking(phone="9800000001", start_at=tomorrow_at(12))
        b = make_booking(phone="9800000002", start_at=tomorrow_at(16))
        assert a.customer_code != b.customer_code
        assert a.code.endswith("-001") and b.code.endswith("-001")

    def test_resaving_does_not_renumber(self, pcs, make_booking):
        booking = make_booking(phone="9800000001")
        original = booking.code
        booking.staff_notes = "regular"
        booking.save()
        booking.refresh_from_db()
        assert booking.code == original
        assert booking.customer.booking_sequence == 1

    def test_deleting_a_booking_does_not_free_its_number(self, pcs, make_booking, tomorrow_at):
        """The counter is monotonic — a retired number must never come back."""
        first = make_booking(phone="9800000001", start_at=tomorrow_at(12))
        second = make_booking(phone="9800000001", start_at=tomorrow_at(16))
        assert second.code.endswith("-002")

        second.delete()
        third = make_booking(phone="9800000001", start_at=tomorrow_at(20))
        assert third.code.endswith("-003")
        assert third.code != second.code

    def test_sequence_past_999_stays_unique(self, pcs, make_booking):
        customer = Customer.objects.create(full_name="Regular", phone="9800009999")
        Customer.objects.filter(pk=customer.pk).update(booking_sequence=999)
        customer.refresh_from_db()

        code = customer.next_booking_code()
        assert code == f"{customer.code}-1000"
        assert code != f"{customer.code}-000"

    def test_codes_are_unique_across_customers(self, pcs, make_booking, tomorrow_at):
        codes = {
            make_booking(phone=f"98000000{i:02d}", start_at=tomorrow_at(10 + i)).code
            for i in range(1, 6)
        }
        assert len(codes) == 5


class TestNormalise:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("A3F92C-001", "A3F92C001"),
            ("a3f92c-001", "A3F92C001"),
            ("a3f92c001", "A3F92C001"),
            ("A3F92C 001", "A3F92C001"),
            ("  a3f92c–001 ", "A3F92C001"),
            ("A3F92C", "A3F92C"),
            ("", ""),
            (None, ""),
        ],
    )
    def test_folds_to_canonical_form(self, raw, expected):
        assert normalise_code(raw) == expected


class TestLookup:
    def test_customer_code_returns_all_recent_bookings(self, api, pcs, make_booking, tomorrow_at):
        first = make_booking(phone="9800000001", start_at=tomorrow_at(12))
        second = make_booking(phone="9800000001", start_at=tomorrow_at(16))

        body = api.get(f"/api/public/bookings/{first.customer_code}/").json()
        assert body["customer_code"] == first.customer_code
        assert {b["code"] for b in body["bookings"]} == {first.code, second.code}

    def test_full_code_returns_only_that_booking(self, api, pcs, make_booking, tomorrow_at):
        first = make_booking(phone="9800000001", start_at=tomorrow_at(12))
        make_booking(phone="9800000001", start_at=tomorrow_at(16))

        body = api.get(f"/api/public/bookings/{first.code}/").json()
        assert [b["code"] for b in body["bookings"]] == [first.code]

    @pytest.mark.parametrize("style", ["lower", "nohyphen", "spaced"])
    def test_lookup_tolerates_how_it_was_typed(self, api, pcs, make_booking, style):
        booking = make_booking(phone="9800000001")
        variants = {
            "lower": booking.code.lower(),
            "nohyphen": booking.code.replace("-", ""),
            "spaced": booking.code.replace("-", " "),
        }
        res = api.get(f"/api/public/bookings/{variants[style]}/")
        assert res.status_code == 200
        assert res.json()["bookings"][0]["code"] == booking.code

    def test_unknown_code_is_404(self, api, db):
        assert api.get("/api/public/bookings/ZZZZZZ-001/").status_code == 404

    def test_customer_with_no_recent_bookings_returns_an_empty_list(self, api, db):
        customer = Customer.objects.create(full_name="Lapsed", phone="9800000001")
        body = api.get(f"/api/public/bookings/{customer.code}/").json()
        assert body["customer_code"] == customer.code
        assert body["bookings"] == []

    def test_old_bookings_are_not_listed(self, api, pcs, make_booking):
        old = make_booking(phone="9800000001")
        Booking.objects.filter(pk=old.pk).update(
            start_at=timezone.now() - timedelta(days=30)
        )
        body = api.get(f"/api/public/bookings/{old.customer_code}/").json()
        assert body["bookings"] == []

    def test_can_cancel_flag_reflects_status(self, api, pcs, make_booking):
        booking = make_booking(phone="9800000001", status=Booking.Status.COMPLETED)
        body = api.get(f"/api/public/bookings/{booking.code}/").json()
        assert body["bookings"][0]["can_cancel"] is False


class TestCancel:
    def test_cancels_with_the_matching_phone(self, api, pcs, make_booking):
        booking = make_booking(phone="9800000001")
        res = api.post(f"/api/public/bookings/{booking.code}/cancel/",
                       {"phone": "9800000001"}, format="json")
        assert res.status_code == 200
        booking.refresh_from_db()
        assert booking.status == Booking.Status.CANCELLED

    def test_rejects_a_mismatched_phone(self, api, pcs, make_booking):
        booking = make_booking(phone="9800000001")
        res = api.post(f"/api/public/bookings/{booking.code}/cancel/",
                       {"phone": "9999999999"}, format="json")
        assert res.status_code == 404

    def test_bare_customer_code_cannot_cancel(self, api, pcs, make_booking, tomorrow_at):
        """With several bookings it would be ambiguous, so refuse rather than guess."""
        first = make_booking(phone="9800000001", start_at=tomorrow_at(12))
        second = make_booking(phone="9800000001", start_at=tomorrow_at(16))

        res = api.post(f"/api/public/bookings/{first.customer_code}/cancel/",
                       {"phone": "9800000001"}, format="json")
        assert res.status_code == 404
        first.refresh_from_db()
        second.refresh_from_db()
        assert first.status != Booking.Status.CANCELLED
        assert second.status != Booking.Status.CANCELLED

    def test_cancelling_one_leaves_the_other(self, api, pcs, make_booking, tomorrow_at):
        first = make_booking(phone="9800000001", start_at=tomorrow_at(12))
        second = make_booking(phone="9800000001", start_at=tomorrow_at(16))

        api.post(f"/api/public/bookings/{first.code}/cancel/",
                 {"phone": "9800000001"}, format="json")
        first.refresh_from_db()
        second.refresh_from_db()
        assert first.status == Booking.Status.CANCELLED
        assert second.status == Booking.Status.CONFIRMED


class TestAdminSearch:
    def test_staff_can_find_every_booking_by_customer_code(self, staff_api, pcs,
                                                           make_booking, tomorrow_at):
        first = make_booking(phone="9800000001", start_at=tomorrow_at(12))
        make_booking(phone="9800000001", start_at=tomorrow_at(16))
        make_booking(phone="9800000002", start_at=tomorrow_at(18))

        res = staff_api.get(f"/api/admin/bookings/?search={first.customer_code}")
        assert res.status_code == 200
        codes = [b["code"] for b in res.json()["results"]]
        assert len(codes) == 2
        assert all(c.startswith(first.customer_code) for c in codes)

    def test_customer_list_exposes_the_code(self, staff_api, pcs, make_booking):
        booking = make_booking(phone="9800000001")
        res = staff_api.get(f"/api/admin/customers/?search={booking.customer_code}")
        rows = res.json()["results"]
        assert len(rows) == 1
        assert rows[0]["code"] == booking.customer_code
