"""Split tenders and manual discounts at checkout.

The invariant under test: every gap between the bill and what was tendered is
either a recorded discount or a recorded debt. Nothing goes missing silently.
"""
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.bookings.models import Booking
from apps.shop.models import BillItem, CounterSale, Payment, Product, ProductCategory


pytestmark = pytest.mark.django_db


def _complete(staff_api, booking, **body):
    return staff_api.post(
        f"/api/admin/bookings/{booking.id}/complete/", body, format="json"
    )


@pytest.fixture
def pepsi(db):
    category = ProductCategory.objects.create(name="Beverages")
    return Product.objects.create(
        name="Pepsi 500ml", category=category, price=Decimal("40"), stock_quantity=20
    )


class TestSplitTender:
    def test_records_one_payment_row_per_tender(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("300"))
        res = _complete(staff_api, booking, payments=[
            {"method": "cash", "amount": "100.00"},
            {"method": "upi", "amount": "200.00"},
        ])
        assert res.status_code == 200

        booking.refresh_from_db()
        assert booking.payments.count() == 2
        assert booking.amount_collected == Decimal("300.00")
        assert booking.payment_method == Booking.PaymentMethod.SPLIT

        by_method = {p.method: p.amount for p in booking.payments.all()}
        assert by_method == {"cash": Decimal("100.00"), "upi": Decimal("200.00")}

    def test_a_short_split_is_rejected(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("300"))
        res = _complete(staff_api, booking, payments=[
            {"method": "cash", "amount": "100.00"},
            {"method": "upi", "amount": "150.00"},
        ])
        assert res.status_code == 400
        assert "payments" in res.json()

        booking.refresh_from_db()
        assert booking.payments.count() == 0
        assert booking.status != Booking.Status.COMPLETED

    def test_an_over_split_is_rejected(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("300"))
        res = _complete(staff_api, booking, payments=[
            {"method": "cash", "amount": "200.00"},
            {"method": "upi", "amount": "200.00"},
        ])
        assert res.status_code == 400

    def test_zero_amounts_are_dropped_not_recorded(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("300"))
        _complete(staff_api, booking, payments=[
            {"method": "cash", "amount": "300.00"},
            {"method": "upi", "amount": "0"},
        ])
        booking.refresh_from_db()
        assert booking.payments.count() == 1
        # One real tender is not a split.
        assert booking.payment_method == "cash"

    def test_unknown_method_is_rejected(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("300"))
        res = _complete(staff_api, booking, payments=[
            {"method": "crypto", "amount": "300.00"},
        ])
        assert res.status_code == 400

    def test_split_covers_station_plus_items(self, staff_api, pcs, pepsi, make_booking):
        booking = make_booking(amount_due=Decimal("70"))
        BillItem.objects.create(booking=booking, product=pepsi, quantity=2)  # 80
        assert booking.total_due == Decimal("150.00")

        res = _complete(staff_api, booking, payments=[
            {"method": "cash", "amount": "50.00"},
            {"method": "upi", "amount": "100.00"},
        ])
        assert res.status_code == 200
        booking.refresh_from_db()
        assert booking.amount_collected == Decimal("150.00")

    def test_re_recording_replaces_rather_than_appends(self, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("100"))
        booking.record_payments([("cash", Decimal("100"))])
        booking.record_payments([("cash", Decimal("40")), ("upi", Decimal("60"))])

        assert booking.payments.count() == 2
        assert booking.amount_collected == Decimal("100.00")


class TestDiscount:
    def test_reduces_the_total(self, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("100"))
        booking.discount_amount = Decimal("25")
        assert booking.gross_due == Decimal("100")
        assert booking.total_due == Decimal("75")

    def test_requires_a_reason(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("100"))
        res = _complete(staff_api, booking, payment_method="cash", discount_amount="20")
        assert res.status_code == 400
        assert "discount_reason" in res.json()

        booking.refresh_from_db()
        assert booking.discount_amount == Decimal("0")

    def test_applied_with_a_reason(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("100"))
        res = _complete(
            staff_api, booking,
            payment_method="cash", discount_amount="20", discount_reason="Regular",
        )
        assert res.status_code == 200
        booking.refresh_from_db()
        assert booking.discount_amount == Decimal("20.00")
        assert booking.discount_reason == "Regular"
        assert booking.amount_collected == Decimal("80.00")

    def test_percentage_resolves_to_rupees(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("250"))
        _complete(
            staff_api, booking,
            payment_method="upi", discount_percent="10", discount_reason="Happy hour",
        )
        booking.refresh_from_db()
        assert booking.discount_amount == Decimal("25.00")
        assert booking.amount_collected == Decimal("225.00")

    def test_a_percentage_over_100_is_rejected(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("100"))
        res = _complete(
            staff_api, booking,
            payment_method="cash", discount_percent="150", discount_reason="Oops",
        )
        assert res.status_code == 400

    def test_a_negative_discount_is_rejected(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("100"))
        res = _complete(
            staff_api, booking,
            payment_method="cash", discount_amount="-20", discount_reason="Nope",
        )
        assert res.status_code == 400

    def test_comping_the_whole_bill_settles_at_zero(self, staff_api, pcs, make_booking):
        """A discount larger than the bill must floor at zero, never go negative."""
        booking = make_booking(amount_due=Decimal("100"))
        res = _complete(
            staff_api, booking,
            discount_amount="500", discount_reason="Tournament winner",
        )
        assert res.status_code == 200
        booking.refresh_from_db()
        assert booking.discount_amount == Decimal("100.00")
        assert booking.total_due == Decimal("0.00")
        assert booking.amount_collected == Decimal("0.00")
        assert booking.payments.count() == 0

    def test_discount_works_alongside_a_split(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("300"))
        res = _complete(staff_api, booking,
            discount_amount="50", discount_reason="Goodwill",
            payments=[
                {"method": "cash", "amount": "100.00"},
                {"method": "upi", "amount": "150.00"},
            ],
        )
        assert res.status_code == 200
        booking.refresh_from_db()
        assert booking.amount_collected == Decimal("250.00")
        assert booking.payments.count() == 2

    def test_a_split_must_balance_the_discounted_total(self, staff_api, pcs, make_booking):
        """The split has to match the bill *after* the discount, not before."""
        booking = make_booking(amount_due=Decimal("300"))
        res = _complete(staff_api, booking,
            discount_amount="50", discount_reason="Goodwill",
            payments=[
                {"method": "cash", "amount": "150.00"},
                {"method": "upi", "amount": "150.00"},
            ],
        )
        assert res.status_code == 400


class TestSalesAttribution:
    def _sales(self, staff_api, preset="today"):
        res = staff_api.get(f"/api/admin/sales/?preset={preset}")
        assert res.status_code == 200
        return res.json()

    def test_a_split_lands_in_both_buckets(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("300"), start_at=timezone.now())
        _complete(staff_api, booking, payments=[
            {"method": "cash", "amount": "120.00"},
            {"method": "upi", "amount": "180.00"},
        ])

        totals = self._sales(staff_api)["totals"]
        assert totals["revenue"] == 300.0
        assert totals["cash"] == 120.0
        assert totals["online"] == 180.0
        assert abs(totals["cash"] + totals["online"] - totals["revenue"]) < 0.01

    def test_method_breakdown_counts_each_tender(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("300"), start_at=timezone.now())
        _complete(staff_api, booking, payments=[
            {"method": "cash", "amount": "120.00"},
            {"method": "upi", "amount": "180.00"},
        ])

        rows = {r["method"]: r for r in self._sales(staff_api)["by_method"]}
        assert rows["cash"]["amount"] == 120.0
        assert rows["upi"]["amount"] == 180.0

    def test_the_daily_series_splits_too(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("300"), start_at=timezone.now())
        _complete(staff_api, booking, payments=[
            {"method": "cash", "amount": "120.00"},
            {"method": "upi", "amount": "180.00"},
        ])

        today = str(timezone.localdate())
        row = next(d for d in self._sales(staff_api)["by_day"] if d["date"] == today)
        assert row["cash"] == 120.0
        assert row["online"] == 180.0
        assert row["revenue"] == 300.0

    def test_discounts_are_reported(self, staff_api, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("200"), start_at=timezone.now())
        _complete(staff_api, booking,
                  payment_method="cash", discount_amount="40", discount_reason="Regular")

        body = self._sales(staff_api)
        assert body["totals"]["discounts"] == 40.0
        assert body["totals"]["revenue"] == 160.0

        given = body["discounts_given"]
        assert len(given) == 1
        assert given[0]["amount"] == 40.0
        assert given[0]["reason"] == "Regular"

    def test_a_bill_with_no_payment_rows_still_reports(self, staff_api, pcs, make_booking):
        """The /django-admin/ path: marked paid by hand, no Payment rows.

        These must not vanish from the cash/online split, so the report falls
        back to the bill's own summary method.
        """
        when = timezone.now()
        booking = make_booking(
            start_at=when,
            status=Booking.Status.COMPLETED,
            payment_status=Booking.PaymentStatus.PAID,
            payment_method="cash",
            amount_due=Decimal("70"),
            amount_collected=Decimal("70"),
        )
        Booking.objects.filter(pk=booking.pk).update(completed_at=when)
        assert booking.payments.count() == 0

        totals = self._sales(staff_api)["totals"]
        assert totals["revenue"] == 70.0
        assert totals["cash"] == 70.0

    def test_totals_reconcile_with_a_mix_of_everything(self, staff_api, pcs, pepsi,
                                                       make_booking, tomorrow_at):
        split = make_booking(amount_due=Decimal("300"), start_at=timezone.now(),
                             phone="9800000001")
        _complete(staff_api, split, payments=[
            {"method": "cash", "amount": "100.00"},
            {"method": "upi", "amount": "200.00"},
        ])
        single = make_booking(amount_due=Decimal("100"), start_at=timezone.now(),
                              phone="9800000002")
        _complete(staff_api, single, payment_method="cash",
                  discount_amount="10", discount_reason="Regular")

        staff_api.post("/api/admin/shop/quick-sale/", {
            "payment_method": "upi",
            "items": [{"product": pepsi.id, "quantity": 1}],
        }, format="json")

        t = self._sales(staff_api)["totals"]
        assert abs(t["cash"] + t["online"] - t["revenue"]) < 0.01
        assert abs(
            t["bookings_revenue"] + t["entry_fees_revenue"] + t["counter_sales_revenue"]
            - t["revenue"]
        ) < 0.01
        assert t["discounts"] == 10.0


class TestDamagedPaymentDetail:
    """A bill can end up marked `split` with its payment rows gone — that is
    what a down-migration does, since the halves cannot be reconstructed from a
    single summary field. The report has to survive it and say so."""

    def test_the_report_survives_an_unmapped_method(self, staff_api, pcs, make_booking):
        when = timezone.now()
        booking = make_booking(
            start_at=when,
            status=Booking.Status.COMPLETED,
            payment_status=Booking.PaymentStatus.PAID,
            payment_method="split",
            amount_due=Decimal("80"),
            amount_collected=Decimal("80"),
        )
        Booking.objects.filter(pk=booking.pk).update(completed_at=when)
        assert booking.payments.count() == 0

        res = staff_api.get("/api/admin/sales/?preset=today")
        assert res.status_code == 200

        totals = res.json()["totals"]
        assert totals["revenue"] == 80.0
        # Counted, but flagged as unattributable rather than guessed at.
        assert totals["unrecorded"] == 80.0
        assert totals["cash"] == 0.0

    def test_split_is_never_stored_as_a_tender(self, staff_api, pcs, make_booking):
        """`split` is a summary label; a Payment row must always name a real
        method, or the cash/online attribution silently loses money."""
        booking = make_booking(amount_due=Decimal("300"))
        _complete(staff_api, booking, payments=[
            {"method": "cash", "amount": "100.00"},
            {"method": "upi", "amount": "200.00"},
        ])
        booking.refresh_from_db()
        assert booking.payment_method == "split"
        assert not Payment.objects.filter(method="split").exists()
        assert set(booking.payments.values_list("method", flat=True)) == {"cash", "upi"}


class TestCounterSaleCheckout:
    def test_split_on_a_counter_sale(self, staff_api, pepsi):
        res = staff_api.post("/api/admin/shop/quick-sale/", {
            "items": [{"product": pepsi.id, "quantity": 5}],   # 200
            "payments": [
                {"method": "cash", "amount": "50.00"},
                {"method": "upi", "amount": "150.00"},
            ],
        }, format="json")
        assert res.status_code == 201
        body = res.json()
        assert body["payment_method"] == "split"
        assert float(body["amount_collected"]) == 200.0
        assert len(body["payments"]) == 2

    def test_discount_on_a_counter_sale(self, staff_api, pepsi):
        res = staff_api.post("/api/admin/shop/quick-sale/", {
            "items": [{"product": pepsi.id, "quantity": 5}],   # 200
            "payment_method": "cash",
            "discount_amount": "20",
            "discount_reason": "Staff",
        }, format="json")
        assert res.status_code == 201
        body = res.json()
        assert float(body["discount_amount"]) == 20.0
        assert float(body["amount_collected"]) == 180.0

    def test_counter_discount_needs_a_reason(self, staff_api, pepsi):
        res = staff_api.post("/api/admin/shop/quick-sale/", {
            "items": [{"product": pepsi.id, "quantity": 5}],
            "payment_method": "cash",
            "discount_amount": "20",
        }, format="json")
        assert res.status_code == 400

    def test_a_short_counter_split_is_rejected(self, staff_api, pepsi):
        res = staff_api.post("/api/admin/shop/quick-sale/", {
            "items": [{"product": pepsi.id, "quantity": 5}],   # 200
            "payments": [{"method": "cash", "amount": "50.00"}],
        }, format="json")
        assert res.status_code == 400


class TestSettleOutstanding:
    def test_settling_accepts_a_split(self, staff_api, pcs, make_booking):
        booking = make_booking(
            amount_due=Decimal("200"),
            status=Booking.Status.COMPLETED,
            payment_status=Booking.PaymentStatus.UNPAID,
        )
        res = staff_api.post(f"/api/admin/bookings/{booking.id}/record_payment/", {
            "payments": [
                {"method": "cash", "amount": "80.00"},
                {"method": "upi", "amount": "120.00"},
            ],
        }, format="json")
        assert res.status_code == 200
        booking.refresh_from_db()
        assert booking.payment_status == Booking.PaymentStatus.PAID
        assert booking.payments.count() == 2


class TestPaymentModel:
    def test_must_belong_to_exactly_one_bill(self, pcs, make_booking):
        from django.core.exceptions import ValidationError

        booking = make_booking()
        sale = CounterSale.objects.create()

        both = Payment(booking=booking, sale=sale, method="cash", amount=Decimal("10"))
        with pytest.raises(ValidationError):
            both.clean()

        neither = Payment(method="cash", amount=Decimal("10"))
        with pytest.raises(ValidationError):
            neither.clean()

    def test_amount_must_be_positive(self, pcs, make_booking):
        from django.core.exceptions import ValidationError

        booking = make_booking()
        zero = Payment(booking=booking, method="cash", amount=Decimal("0"))
        with pytest.raises(ValidationError):
            zero.clean()
