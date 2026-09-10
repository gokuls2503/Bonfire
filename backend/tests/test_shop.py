"""Products, stock, bill lines and counter sales.

The behaviour that matters: a consumable leaves the shelf for good, a rental is
held only while the bill is open, and neither can be oversold.
"""
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.bookings.models import Booking
from apps.shop.models import BillItem, CounterSale, Product, ProductCategory, StockMovement


pytestmark = pytest.mark.django_db


@pytest.fixture
def category(db):
    return ProductCategory.objects.create(name="Beverages", sort_order=1)


@pytest.fixture
def addons(db):
    return ProductCategory.objects.create(name="Add-ons", sort_order=2)


@pytest.fixture
def pepsi(category):
    return Product.objects.create(
        name="Pepsi 500ml", category=category, kind=Product.Kind.CONSUMABLE,
        pricing_mode=Product.PricingMode.FLAT, price=Decimal("40"),
        stock_quantity=10, low_stock_threshold=3,
    )


@pytest.fixture
def rig(addons):
    return Product.objects.create(
        name="Racing sim rig", category=addons, kind=Product.Kind.RENTAL,
        pricing_mode=Product.PricingMode.HOURLY, price=Decimal("150"),
        stock_quantity=2, low_stock_threshold=1,
    )


@pytest.fixture
def controller(addons):
    return Product.objects.create(
        name="Extra controller", category=addons, kind=Product.Kind.RENTAL,
        pricing_mode=Product.PricingMode.FLAT, price=Decimal("50"),
        stock_quantity=4,
    )


class TestPricing:
    def test_flat_item_ignores_session_length(self, pepsi):
        assert pepsi.price_for(quantity=2, hours=5) == Decimal("80.00")

    def test_hourly_item_scales_with_hours(self, rig):
        assert rig.price_for(quantity=1, hours=2) == Decimal("300.00")

    def test_hourly_item_scales_with_quantity_too(self, rig):
        assert rig.price_for(quantity=2, hours=2) == Decimal("600.00")

    def test_consumable_cannot_be_hourly(self, category):
        product = Product(
            name="Weird", category=category, kind=Product.Kind.CONSUMABLE,
            pricing_mode=Product.PricingMode.HOURLY, price=Decimal("10"),
        )
        with pytest.raises(ValidationError) as exc:
            product.clean()
        assert "pricing_mode" in exc.value.message_dict


class TestConsumableStock:
    def test_selling_reduces_stock(self, pepsi, pcs, make_booking):
        booking = make_booking()
        BillItem.objects.create(booking=booking, product=pepsi, quantity=3)
        pepsi.refresh_from_db()
        assert pepsi.stock_quantity == 7
        assert pepsi.available_stock == 7

    def test_removing_a_line_puts_stock_back(self, pepsi, pcs, make_booking):
        booking = make_booking()
        item = BillItem.objects.create(booking=booking, product=pepsi, quantity=3)
        item.delete()
        pepsi.refresh_from_db()
        assert pepsi.stock_quantity == 10

    def test_increasing_quantity_takes_the_difference(self, pepsi, pcs, make_booking):
        booking = make_booking()
        item = BillItem.objects.create(booking=booking, product=pepsi, quantity=2)
        item.quantity = 5
        item.save()
        pepsi.refresh_from_db()
        assert pepsi.stock_quantity == 5

    def test_decreasing_quantity_returns_the_difference(self, pepsi, pcs, make_booking):
        booking = make_booking()
        item = BillItem.objects.create(booking=booking, product=pepsi, quantity=5)
        item.quantity = 2
        item.save()
        pepsi.refresh_from_db()
        assert pepsi.stock_quantity == 8

    def test_cannot_oversell(self, pepsi, pcs, make_booking):
        booking = make_booking()
        item = BillItem(booking=booking, product=pepsi, quantity=11)
        with pytest.raises(ValidationError) as exc:
            item.clean()
        assert "quantity" in exc.value.message_dict

    def test_closing_the_bill_does_not_return_consumables(self, pepsi, pcs, make_booking):
        booking = make_booking()
        BillItem.objects.create(booking=booking, product=pepsi, quantity=3)
        booking.release_rentals()
        pepsi.refresh_from_db()
        assert pepsi.stock_quantity == 7

    def test_untracked_stock_is_never_reduced(self, category, pcs, make_booking):
        free = Product.objects.create(
            name="Tap water", category=category, price=Decimal("0"),
            track_stock=False, stock_quantity=0,
        )
        booking = make_booking()
        BillItem.objects.create(booking=booking, product=free, quantity=99)
        free.refresh_from_db()
        assert free.stock_quantity == 0
        assert free.available_stock is None


class TestRentalStock:
    def test_holding_a_rental_reduces_availability_not_stock(self, rig, pcs, make_booking):
        booking = make_booking()
        BillItem.objects.create(booking=booking, product=rig, quantity=1)
        rig.refresh_from_db()
        assert rig.stock_quantity == 2          # still owned
        assert rig.units_out == 1
        assert rig.available_stock == 1         # but only one free

    def test_closing_the_bill_returns_the_rental(self, rig, pcs, make_booking):
        booking = make_booking()
        BillItem.objects.create(booking=booking, product=rig, quantity=2)
        assert rig.available_stock == 0

        booking.release_rentals()
        assert rig.available_stock == 2
        assert rig.units_out == 0

    def test_cannot_hand_out_more_than_owned(self, rig, pcs, make_booking, tomorrow_at):
        first = make_booking(phone="9800000001", start_at=tomorrow_at(12))
        BillItem.objects.create(booking=first, product=rig, quantity=2)

        second = make_booking(phone="9800000002", start_at=tomorrow_at(16))
        clash = BillItem(booking=second, product=rig, quantity=1)
        with pytest.raises(ValidationError):
            clash.clean()

    def test_returning_one_frees_it_for_the_next_session(self, rig, pcs, make_booking, tomorrow_at):
        first = make_booking(phone="9800000001", start_at=tomorrow_at(12))
        item = BillItem.objects.create(booking=first, product=rig, quantity=2)
        item.mark_returned()

        second = make_booking(phone="9800000002", start_at=tomorrow_at(16))
        BillItem(booking=second, product=rig, quantity=2).clean()  # must not raise

    def test_mark_returned_is_idempotent(self, rig, pcs, make_booking):
        booking = make_booking()
        item = BillItem.objects.create(booking=booking, product=rig, quantity=1)
        item.mark_returned()
        stamp = item.returned_at
        item.mark_returned()
        item.refresh_from_db()
        assert item.returned_at == stamp

    def test_editing_an_existing_line_does_not_clash_with_itself(self, rig, pcs, make_booking):
        booking = make_booking()
        item = BillItem.objects.create(booking=booking, product=rig, quantity=2)
        item.quantity = 2
        item.clean()  # its own held units must not count against it


class TestBillItem:
    def test_hourly_line_defaults_to_the_session_length(self, rig, pcs, make_booking):
        booking = make_booking(duration_minutes=120)
        item = BillItem.objects.create(booking=booking, product=rig, quantity=1)
        assert item.hours == Decimal("2.00")
        assert item.line_total == Decimal("300.00")

    def test_flat_line_total(self, pepsi, pcs, make_booking):
        booking = make_booking()
        item = BillItem.objects.create(booking=booking, product=pepsi, quantity=3)
        assert item.line_total == Decimal("120.00")

    def test_snapshots_the_name_and_price(self, pepsi, pcs, make_booking):
        booking = make_booking()
        item = BillItem.objects.create(booking=booking, product=pepsi, quantity=1)
        pepsi.price = Decimal("999")
        pepsi.name = "Renamed"
        pepsi.save()
        item.refresh_from_db()
        assert item.name == "Pepsi 500ml"
        assert item.unit_price == Decimal("40.00")

    def test_must_belong_to_exactly_one_bill(self, pepsi, pcs, make_booking):
        booking = make_booking()
        sale = CounterSale.objects.create()
        both = BillItem(booking=booking, sale=sale, product=pepsi, quantity=1)
        with pytest.raises(ValidationError):
            both.clean()

        neither = BillItem(product=pepsi, quantity=1)
        with pytest.raises(ValidationError):
            neither.clean()


class TestBookingTotals:
    def test_total_is_station_plus_items(self, pepsi, rig, pcs, make_booking):
        booking = make_booking(duration_minutes=60, amount_due=Decimal("70"))
        BillItem.objects.create(booking=booking, product=pepsi, quantity=2)   # 80
        BillItem.objects.create(booking=booking, product=rig, quantity=1)     # 150 x 1h

        assert booking.items_total == Decimal("230.00")
        assert booking.total_due == Decimal("300.00")

    def test_no_items_means_total_equals_station_charge(self, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("70"))
        assert booking.total_due == Decimal("70")


class TestCloseOut:
    def test_completing_defaults_to_the_whole_bill(self, staff_api, pepsi, pcs, make_booking):
        booking = make_booking(amount_due=Decimal("70"))
        BillItem.objects.create(booking=booking, product=pepsi, quantity=2)

        res = staff_api.post(f"/api/admin/bookings/{booking.id}/complete/",
                             {"payment_method": "cash"}, format="json")
        assert res.status_code == 200
        booking.refresh_from_db()
        assert booking.amount_collected == Decimal("150.00")

    def test_completing_returns_rented_kit(self, staff_api, rig, pcs, make_booking):
        booking = make_booking()
        BillItem.objects.create(booking=booking, product=rig, quantity=2)
        assert rig.available_stock == 0

        staff_api.post(f"/api/admin/bookings/{booking.id}/complete/",
                       {"payment_method": "cash"}, format="json")
        assert rig.available_stock == 2

    def test_cancelling_returns_rented_kit(self, staff_api, rig, pcs, make_booking):
        booking = make_booking()
        BillItem.objects.create(booking=booking, product=rig, quantity=1)
        staff_api.post(f"/api/admin/bookings/{booking.id}/cancel/", {}, format="json")
        assert rig.available_stock == 2

    def test_no_show_returns_rented_kit(self, staff_api, rig, pcs, make_booking):
        booking = make_booking()
        BillItem.objects.create(booking=booking, product=rig, quantity=1)
        staff_api.post(f"/api/admin/bookings/{booking.id}/no_show/", {}, format="json")
        assert rig.available_stock == 2


class TestQuickSale:
    def test_rings_up_a_walk_in(self, staff_api, pepsi):
        res = staff_api.post("/api/admin/shop/quick-sale/", {
            "payment_method": "upi",
            "items": [{"product": pepsi.id, "quantity": 2}],
        }, format="json")
        assert res.status_code == 201
        body = res.json()
        assert float(body["items_total"]) == 80.0
        assert body["payment_method"] == "upi"

        pepsi.refresh_from_db()
        assert pepsi.stock_quantity == 8

    def test_refuses_to_oversell(self, staff_api, pepsi):
        res = staff_api.post("/api/admin/shop/quick-sale/", {
            "payment_method": "cash",
            "items": [{"product": pepsi.id, "quantity": 99}],
        }, format="json")
        assert res.status_code == 400
        pepsi.refresh_from_db()
        assert pepsi.stock_quantity == 10

    def test_rejects_an_unknown_product(self, staff_api, db):
        res = staff_api.post("/api/admin/shop/quick-sale/", {
            "payment_method": "cash", "items": [{"product": 99999, "quantity": 1}],
        }, format="json")
        assert res.status_code == 400

    def test_needs_a_payment_method(self, staff_api, pepsi):
        res = staff_api.post("/api/admin/shop/quick-sale/", {
            "items": [{"product": pepsi.id, "quantity": 1}],
        }, format="json")
        assert res.status_code == 400

    def test_counter_sale_lands_in_the_sales_report(self, staff_api, pepsi):
        staff_api.post("/api/admin/shop/quick-sale/", {
            "payment_method": "cash",
            "items": [{"product": pepsi.id, "quantity": 2}],
        }, format="json")

        totals = staff_api.get("/api/admin/sales/?preset=today").json()["totals"]
        assert totals["counter_sales_revenue"] == 80.0
        assert totals["revenue"] == 80.0
        assert totals["cash"] == 80.0


class TestStockAdjustment:
    def test_restocking_records_a_movement(self, staff_api, pepsi):
        res = staff_api.post(f"/api/admin/products/{pepsi.id}/adjust_stock/",
                             {"change": 24, "reason": "restock", "note": "Weekly delivery"},
                             format="json")
        assert res.status_code == 200
        pepsi.refresh_from_db()
        assert pepsi.stock_quantity == 34

        movement = StockMovement.objects.get(product=pepsi)
        assert movement.change == 24
        assert movement.resulting_stock == 34

    def test_writing_off_damage(self, staff_api, pepsi):
        staff_api.post(f"/api/admin/products/{pepsi.id}/adjust_stock/",
                       {"change": -2, "reason": "damage"}, format="json")
        pepsi.refresh_from_db()
        assert pepsi.stock_quantity == 8

    def test_zero_change_is_rejected(self, staff_api, pepsi):
        res = staff_api.post(f"/api/admin/products/{pepsi.id}/adjust_stock/",
                             {"change": 0}, format="json")
        assert res.status_code == 400

    def test_unknown_reason_is_rejected(self, staff_api, pepsi):
        res = staff_api.post(f"/api/admin/products/{pepsi.id}/adjust_stock/",
                             {"change": 5, "reason": "vibes"}, format="json")
        assert res.status_code == 400


class TestLowStock:
    def test_flags_at_or_below_the_threshold(self, pepsi):
        pepsi.stock_quantity = 3
        pepsi.save()
        assert pepsi.is_low_stock is True

    def test_not_flagged_above_it(self, pepsi):
        assert pepsi.is_low_stock is False

    def test_rental_low_stock_counts_what_is_out(self, rig, pcs, make_booking):
        assert rig.is_low_stock is False
        booking = make_booking()
        BillItem.objects.create(booking=booking, product=rig, quantity=1)
        assert rig.is_low_stock is True   # 1 of 2 left, threshold 1

    def test_low_stock_filter(self, staff_api, pepsi, rig):
        pepsi.stock_quantity = 1
        pepsi.save()
        rows = staff_api.get("/api/admin/products/?low_stock=1").json()
        assert [r["name"] for r in rows] == ["Pepsi 500ml"]


class TestShopAuth:
    @pytest.mark.parametrize("path", [
        "/api/admin/products/",
        "/api/admin/product-categories/",
        "/api/admin/bill-items/",
        "/api/admin/counter-sales/",
        "/api/admin/shop/summary/",
    ])
    def test_anonymous_is_rejected(self, api, path):
        assert api.get(path).status_code == 401

    def test_non_staff_is_rejected(self, api, plain_user):
        api.force_authenticate(plain_user)
        assert api.get("/api/admin/products/").status_code == 403

    def test_quick_sale_is_staff_only(self, api, pepsi):
        assert api.post("/api/admin/shop/quick-sale/", {}, format="json").status_code == 401


class TestShopSummary:
    def test_returns_the_menu_and_warnings(self, staff_api, pepsi, rig, pcs, make_booking):
        pepsi.stock_quantity = 1
        pepsi.save()
        booking = make_booking()
        BillItem.objects.create(booking=booking, product=rig, quantity=1)

        body = staff_api.get("/api/admin/shop/summary/").json()
        assert len(body["products"]) == 2
        assert [p["name"] for p in body["low_stock"]] == ["Pepsi 500ml", "Racing sim rig"]
        assert body["rentals_out"] == [
            {"id": rig.id, "name": "Racing sim rig", "out": 1, "owned": 2}
        ]
