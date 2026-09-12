"""Sellable items — snacks, drinks, and rentable kit like rigs and controllers.

Two kinds of product behave differently once they are on a bill:

* **Consumable** (a Pepsi) permanently reduces stock the moment it is sold.
* **Rental** (a racing rig) is *held* while the session is open and returns to
  the pool when the bill is closed, so the available count always reflects what
  is actually free right now.

Both live on the same bill, which can hang off either a Booking or a standalone
CounterSale for a walk-in who only wants a drink.
"""
import secrets
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models, transaction
from django.db.models import F, Q, Sum
from django.utils import timezone
from django.utils.text import slugify

from apps.catalog.models import TimeStamped
from apps.customers.models import Customer

MONEY = {"max_digits": 9, "decimal_places": 2}


def make_sale_code():
    return "S-" + secrets.token_hex(3).upper()


class ProductCategory(TimeStamped):
    """How the counter screen groups items: Snacks, Beverages, Add-ons…"""

    name = models.CharField(max_length=60, unique=True)
    slug = models.SlugField(max_length=70, unique=True, blank=True)
    icon = models.CharField(
        max_length=30, default="star",
        help_text="Icon key rendered by the admin (star, flame, gamepad, monitor, wheel, vr).",
    )
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "name")
        verbose_name_plural = "Product categories"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class Product(TimeStamped):
    class Kind(models.TextChoices):
        CONSUMABLE = "consumable", "Consumable (snacks, drinks)"
        RENTAL = "rental", "Rental (kit that comes back)"

    class PricingMode(models.TextChoices):
        FLAT = "flat", "Flat charge"
        HOURLY = "hourly", "Per hour of the session"

    name = models.CharField(max_length=100)
    sku = models.CharField(max_length=40, blank=True, help_text="Optional shelf or barcode label.")
    category = models.ForeignKey(
        ProductCategory, on_delete=models.PROTECT, related_name="products"
    )
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.CONSUMABLE)
    pricing_mode = models.CharField(
        max_length=8, choices=PricingMode.choices, default=PricingMode.FLAT,
        help_text="Hourly items multiply by the length of the session they are added to.",
    )
    price = models.DecimalField(**MONEY, validators=[MinValueValidator(Decimal("0"))])
    description = models.CharField(max_length=180, blank=True)
    image = models.ImageField(upload_to="products/", blank=True, null=True)

    track_stock = models.BooleanField(
        default=True, help_text="Uncheck for something you never run out of."
    )
    stock_quantity = models.IntegerField(
        default=0, help_text="Consumables: units on the shelf. Rentals: units owned."
    )
    low_stock_threshold = models.PositiveIntegerField(
        default=5, help_text="Flag the item in the admin at or below this count."
    )

    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("category__sort_order", "sort_order", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("name", "category"), name="unique_product_name_per_category"
            )
        ]

    def __str__(self):
        return self.name

    def clean(self):
        if self.pricing_mode == self.PricingMode.HOURLY and self.kind == self.Kind.CONSUMABLE:
            raise ValidationError(
                {"pricing_mode": "A consumable cannot be charged by the hour."}
            )

    @property
    def units_out(self):
        """Rentals currently on an open bill."""
        if self.kind != self.Kind.RENTAL:
            return 0
        return (
            self.bill_items.filter(returned_at__isnull=True).aggregate(
                n=Sum("quantity")
            )["n"]
            or 0
        )

    @property
    def available_stock(self):
        """What can be sold or handed out right now."""
        if not self.track_stock:
            return None
        if self.kind == self.Kind.RENTAL:
            return self.stock_quantity - self.units_out
        return self.stock_quantity

    @property
    def is_low_stock(self):
        available = self.available_stock
        return available is not None and available <= self.low_stock_threshold

    def price_for(self, quantity=1, hours=None):
        """Line total for this product. Hourly items scale with session length."""
        if self.pricing_mode == self.PricingMode.HOURLY:
            billable = Decimal(str(hours or 1))
            return (self.price * Decimal(quantity) * billable).quantize(Decimal("0.01"))
        return (self.price * Decimal(quantity)).quantize(Decimal("0.01"))


class CounterSale(TimeStamped):
    """A walk-in buying items with no station booked."""

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PAID = "paid", "Paid"
        WAIVED = "waived", "Waived"

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        UPI = "upi", "UPI"
        CARD = "card", "Card"
        OTHER = "other", "Other"
        SPLIT = "split", "Split"

    code = models.CharField(max_length=12, unique=True, default=make_sale_code, editable=False)
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="counter_sales"
    )
    full_name = models.CharField(max_length=120, blank=True, help_text="Optional for a walk-in.")
    phone = models.CharField(max_length=20, blank=True)

    payment_status = models.CharField(
        max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.PAID, db_index=True
    )
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices, blank=True)
    amount_collected = models.DecimalField(**MONEY, default=0)
    discount_amount = models.DecimalField(**MONEY, default=0)
    discount_reason = models.CharField(max_length=140, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    staff_notes = models.TextField(blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.code} - {self.items_total}"

    @property
    def items_total(self):
        return sum((i.line_total for i in self.items.all()), Decimal("0.00"))

    @property
    def total_due(self):
        """What the customer actually pays, after any discount."""
        return max(self.items_total - self.discount_amount, Decimal("0.00"))

    @property
    def settled_at(self):
        return self.completed_at or self.created_at

    def record_payments(self, tenders, discount=None, reason=None):
        """Single writer for how a sale was paid. See Booking.record_payments."""
        return _record_payments(self, tenders, discount=discount, reason=reason)

    def save(self, *args, **kwargs):
        if self.customer is None and self.phone:
            self.customer, _ = Customer.objects.get_or_create(
                phone=self.phone,
                defaults={"full_name": self.full_name or "Counter customer"},
            )
        super().save(*args, **kwargs)


class BillItem(TimeStamped):
    """One line on a bill. Belongs to exactly one Booking or one CounterSale."""

    booking = models.ForeignKey(
        "bookings.Booking", on_delete=models.CASCADE, null=True, blank=True,
        related_name="items",
    )
    sale = models.ForeignKey(
        CounterSale, on_delete=models.CASCADE, null=True, blank=True, related_name="items"
    )
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="bill_items")

    # Snapshots, so an old bill still reads correctly after a price change.
    name = models.CharField(max_length=100)
    unit_price = models.DecimalField(**MONEY)
    pricing_mode = models.CharField(max_length=8, choices=Product.PricingMode.choices)
    kind = models.CharField(max_length=12, choices=Product.Kind.choices)

    quantity = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    hours = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("1.00"),
        help_text="Billable hours for an hourly item.",
    )
    line_total = models.DecimalField(**MONEY, default=0)

    returned_at = models.DateTimeField(
        null=True, blank=True,
        help_text="When a rental came back. Null means it is still out.",
    )
    staff_notes = models.CharField(max_length=140, blank=True)

    class Meta:
        ordering = ("created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(booking__isnull=False, sale__isnull=True)
                    | Q(booking__isnull=True, sale__isnull=False)
                ),
                name="bill_item_belongs_to_exactly_one_bill",
            )
        ]

    def __str__(self):
        return f"{self.quantity} x {self.name}"

    @property
    def is_out(self):
        return self.kind == Product.Kind.RENTAL and self.returned_at is None

    def clean(self):
        if bool(self.booking_id) == bool(self.sale_id):
            raise ValidationError("A bill item must belong to one booking or one counter sale.")

        if self.product_id and self.product.track_stock:
            available = self.product.available_stock
            # An existing line already holds its own units; only the delta matters.
            if self.pk:
                previous = BillItem.objects.filter(pk=self.pk).first()
                if previous and previous.product_id == self.product_id:
                    if self.product.kind == Product.Kind.RENTAL and not previous.returned_at:
                        available += previous.quantity
                    elif self.product.kind == Product.Kind.CONSUMABLE:
                        available += previous.quantity
            if self.quantity > available:
                raise ValidationError(
                    {"quantity": f"Only {max(available, 0)} x {self.product.name} left."}
                )

    def save(self, *args, **kwargs):
        creating = self.pk is None
        previous_qty = 0
        if not creating:
            previous = BillItem.objects.filter(pk=self.pk).values("quantity").first()
            previous_qty = previous["quantity"] if previous else 0

        if self.product_id:
            self.name = self.name or self.product.name
            if not self.unit_price:
                self.unit_price = self.product.price
            self.pricing_mode = self.product.pricing_mode
            self.kind = self.product.kind

            if self.pricing_mode == Product.PricingMode.HOURLY and creating and self.booking_id:
                # Default an hourly add-on to the length of the session it joins.
                self.hours = Decimal(self.booking.duration_minutes) / Decimal("60")

        billable = self.hours if self.pricing_mode == Product.PricingMode.HOURLY else Decimal("1")
        self.line_total = (self.unit_price * Decimal(self.quantity) * billable).quantize(
            Decimal("0.01")
        )

        with transaction.atomic():
            super().save(*args, **kwargs)
            # Consumables leave the shelf for good; rentals are tracked by returned_at.
            if self.kind == Product.Kind.CONSUMABLE and self.product.track_stock:
                delta = self.quantity - previous_qty
                if delta:
                    Product.objects.filter(pk=self.product_id).update(
                        stock_quantity=F("stock_quantity") - delta
                    )

    def delete(self, *args, **kwargs):
        with transaction.atomic():
            if self.kind == Product.Kind.CONSUMABLE and self.product.track_stock:
                Product.objects.filter(pk=self.product_id).update(
                    stock_quantity=F("stock_quantity") + self.quantity
                )
            super().delete(*args, **kwargs)

    def mark_returned(self):
        if self.is_out:
            self.returned_at = timezone.now()
            self.save(update_fields=["returned_at", "updated_at"])


class StockMovement(TimeStamped):
    """An audit line for every manual stock change, so counts can be explained."""

    class Reason(models.TextChoices):
        RESTOCK = "restock", "Restocked"
        CORRECTION = "correction", "Count correction"
        DAMAGE = "damage", "Damaged or lost"
        RETURN = "return", "Returned to supplier"

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="movements")
    change = models.IntegerField(help_text="Positive to add stock, negative to remove.")
    reason = models.CharField(max_length=12, choices=Reason.choices, default=Reason.RESTOCK)
    note = models.CharField(max_length=140, blank=True)
    resulting_stock = models.IntegerField(default=0)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.product.name} {self.change:+d} ({self.get_reason_display()})"


class Payment(TimeStamped):
    """One tender against a bill. A split payment is simply two of these.

    `Booking.payment_method` and `amount_collected` remain as denormalised
    summaries for display, but these rows are the detail the sales report
    attributes cash and online revenue from.
    """

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        UPI = "upi", "UPI"
        CARD = "card", "Card"
        OTHER = "other", "Other"

        @classmethod
        def online(cls):
            return [cls.UPI, cls.CARD, cls.OTHER]

    booking = models.ForeignKey(
        "bookings.Booking", on_delete=models.CASCADE, null=True, blank=True,
        related_name="payments",
    )
    sale = models.ForeignKey(
        CounterSale, on_delete=models.CASCADE, null=True, blank=True, related_name="payments"
    )
    method = models.CharField(max_length=10, choices=Method.choices)
    amount = models.DecimalField(**MONEY)
    settled_at = models.DateTimeField(
        default=timezone.now, db_index=True, help_text="When the money actually moved."
    )
    note = models.CharField(max_length=140, blank=True)

    class Meta:
        ordering = ("settled_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(booking__isnull=False, sale__isnull=True)
                    | Q(booking__isnull=True, sale__isnull=False)
                ),
                name="payment_belongs_to_exactly_one_bill",
            )
        ]

    def __str__(self):
        return f"{self.get_method_display()} {self.amount}"

    def clean(self):
        if bool(self.booking_id) == bool(self.sale_id):
            raise ValidationError("A payment must belong to one booking or one counter sale.")
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({"amount": "A payment must be for more than zero."})


def _record_payments(bill, tenders, discount=None, reason=None):
    """Replace a bill's payments, keeping its summary fields in step.

    `tenders` is [(method, amount), ...]. One tender records that method; more
    than one records SPLIT. Writing the rows and the summary together is what
    keeps `amount_collected` from drifting away from the payment detail.
    """
    cleaned = [
        (method, Decimal(str(amount)))
        for method, amount in tenders
        if Decimal(str(amount)) > 0
    ]

    with transaction.atomic():
        if discount is not None:
            bill.discount_amount = Decimal(str(discount))
            bill.discount_reason = reason or ""

        bill.payments.all().delete()
        now = timezone.now()
        for method, amount in cleaned:
            Payment.objects.create(
                **{"booking" if bill._meta.model_name == "booking" else "sale": bill},
                method=method,
                amount=amount,
                settled_at=now,
            )

        bill.amount_collected = sum((a for _, a in cleaned), Decimal("0.00"))
        if len(cleaned) > 1:
            bill.payment_method = "split"
        elif cleaned:
            bill.payment_method = cleaned[0][0]
        else:
            bill.payment_method = ""

        fields = ["amount_collected", "payment_method", "updated_at"]
        if discount is not None:
            fields += ["discount_amount", "discount_reason"]
        bill.save(update_fields=fields)

    return bill
