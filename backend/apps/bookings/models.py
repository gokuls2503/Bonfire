"""Slot bookings, opening hours and one-off closures."""
import secrets
from datetime import datetime, timedelta

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.catalog.models import PricingPlan, Station, StationType, TimeStamped
from apps.customers.models import Customer, make_customer_code


def make_booking_code():
    """Deprecated. Booking codes are now `<customer code>-<sequence>`.

    Kept only because migration 0001 references it by name; deleting it breaks
    the migration graph. Nothing in application code should call this.
    """
    return "BF" + secrets.token_hex(3).upper()


def make_orphan_code():
    """Fallback for a booking with no customer (only possible after a customer
    is deleted, since `customer` is SET_NULL). Keeps `code` non-empty."""
    return f"{make_customer_code()}-000"


class BusinessHours(models.Model):
    """Opening hours per weekday. Drives which slots the public site offers."""

    WEEKDAYS = [
        (0, "Monday"), (1, "Tuesday"), (2, "Wednesday"), (3, "Thursday"),
        (4, "Friday"), (5, "Saturday"), (6, "Sunday"),
    ]
    weekday = models.PositiveSmallIntegerField(choices=WEEKDAYS, unique=True)
    opens_at = models.TimeField(default="10:00")
    closes_at = models.TimeField(default="23:00")
    is_closed = models.BooleanField(default=False)

    class Meta:
        ordering = ("weekday",)
        verbose_name_plural = "Business hours"

    def __str__(self):
        if self.is_closed:
            return f"{self.get_weekday_display()}: closed"
        return f"{self.get_weekday_display()}: {self.opens_at:%H:%M}-{self.closes_at:%H:%M}"


class Closure(TimeStamped):
    """A date the cafe is shut, or shut early (holiday, private event)."""

    date = models.DateField(unique=True)
    reason = models.CharField(max_length=140, blank=True)
    is_full_day = models.BooleanField(default=True)
    opens_at = models.TimeField(null=True, blank=True)
    closes_at = models.TimeField(null=True, blank=True)

    class Meta:
        ordering = ("-date",)

    def __str__(self):
        return f"{self.date} - {self.reason or 'Closed'}"


class Booking(TimeStamped):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        CHECKED_IN = "checked_in", "Checked in"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        NO_SHOW = "no_show", "No show"

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

        @classmethod
        def online(cls):
            """Everything that is not physical cash, for the sales split."""
            return [cls.UPI, cls.CARD, cls.OTHER]

    class Source(models.TextChoices):
        WEBSITE = "website", "Website"
        WALKIN = "walkin", "Walk-in"
        PHONE = "phone", "Phone"

    # <customer code>-<3-digit sequence>, e.g. A3F92C-001. Assigned in save()
    # once the customer is resolved from the phone number.
    code = models.CharField(max_length=12, unique=True, editable=False, blank=True)
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="bookings"
    )
    # Denormalised so a booking survives customer deletion and walk-ins need no account.
    full_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, db_index=True)
    email = models.EmailField(blank=True)

    station_type = models.ForeignKey(
        StationType, on_delete=models.PROTECT, related_name="bookings"
    )
    station = models.ForeignKey(
        Station, on_delete=models.SET_NULL, null=True, blank=True, related_name="bookings",
        help_text="Assigned by staff. Leave blank until check-in.",
    )
    pricing_plan = models.ForeignKey(
        PricingPlan, on_delete=models.SET_NULL, null=True, blank=True, related_name="bookings"
    )

    start_at = models.DateTimeField(db_index=True)
    duration_minutes = models.PositiveIntegerField(default=60)
    seats = models.PositiveSmallIntegerField(
        default=1, help_text="How many stations of this type the booking holds."
    )

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True)
    payment_status = models.CharField(
        max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID,
        db_index=True,
    )
    payment_method = models.CharField(
        max_length=10, choices=PaymentMethod.choices, blank=True,
        help_text="How the money was taken. Blank until payment is recorded.",
    )
    amount_due = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    amount_collected = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    discount_amount = models.DecimalField(
        max_digits=9, decimal_places=2, default=0,
        help_text="Manual discount applied at checkout. Always a rupee figure.",
    )
    discount_reason = models.CharField(
        max_length=140, blank=True,
        help_text="Why it was given. Required whenever a discount is applied.",
    )
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.WEBSITE)
    notes = models.TextField(blank=True)
    staff_notes = models.TextField(blank=True)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-start_at",)
        indexes = [models.Index(fields=["start_at", "status"])]

    def __str__(self):
        return f"{self.code} - {self.full_name} - {self.start_at:%d %b %H:%M}"

    @property
    def end_at(self):
        return self.start_at + timedelta(minutes=self.duration_minutes)

    @property
    def settled_at(self):
        """When the cash actually changed hands, for daily sales reporting."""
        return self.completed_at or self.start_at

    @property
    def is_online_payment(self):
        return self.payment_method in Booking.PaymentMethod.online()

    @property
    def is_active_now(self):
        now = timezone.now()
        return self.status in ("confirmed", "checked_in") and self.start_at <= now < self.end_at

    BLOCKING_STATUSES = ("pending", "confirmed", "checked_in")

    def overlapping(self):
        """Other bookings of the same station type that share this time window."""
        if not self.start_at:
            return Booking.objects.none()
        qs = Booking.objects.filter(
            station_type=self.station_type,
            status__in=self.BLOCKING_STATUSES,
            start_at__lt=self.end_at,
        ).exclude(pk=self.pk)
        return [b for b in qs if b.end_at > self.start_at]

    def seats_taken_in_window(self):
        return sum(b.seats for b in self.overlapping())

    def capacity(self):
        return self.station_type.stations.filter(is_active=True, is_bookable=True).count()

    def clean(self):
        if self.start_at and self.start_at < timezone.now() - timedelta(minutes=5) and not self.pk:
            raise ValidationError({"start_at": "Start time is in the past."})
        if self.seats and self.station_type_id:
            capacity = self.capacity()
            if self.seats > capacity:
                raise ValidationError(
                    {"seats": f"Only {capacity} {self.station_type.name} station(s) exist."}
                )
            if self.status in self.BLOCKING_STATUSES:
                taken = self.seats_taken_in_window()
                if taken + self.seats > capacity:
                    raise ValidationError(
                        {"start_at": f"Only {capacity - taken} {self.station_type.name} "
                                     f"station(s) free in that time window."}
                    )

    def save(self, *args, **kwargs):
        if self.customer is None and self.phone:
            self.customer, _ = Customer.objects.get_or_create(
                phone=self.phone,
                defaults={"full_name": self.full_name, "email": self.email},
            )
        if not self.code:
            # Only ever assigned once — re-saving must not renumber a booking.
            self.code = (
                self.customer.next_booking_code() if self.customer else make_orphan_code()
            )
        if not self.amount_due and self.pricing_plan_id:
            self.amount_due = self.pricing_plan.price * self.seats
        super().save(*args, **kwargs)

    @property
    def customer_code(self):
        """The stable half of the booking code — what a regular quotes."""
        return self.code.split("-")[0] if self.code else ""

    @property
    def items_total(self):
        """Snacks, drinks and rented kit added to this bill."""
        from decimal import Decimal

        return sum((i.line_total for i in self.items.all()), Decimal("0.00"))

    @property
    def total_due(self):
        """Station time plus items, less any discount — what the customer pays.

        Floored at zero: comping a whole session must not produce a negative
        bill that would then read as revenue.
        """
        from decimal import Decimal

        gross = self.amount_due + self.items_total
        return max(gross - self.discount_amount, Decimal("0.00"))

    @property
    def gross_due(self):
        """The bill before any discount, for showing what was taken off."""
        return self.amount_due + self.items_total

    def record_payments(self, tenders, discount=None, reason=None):
        """Record how this bill was paid.

        `tenders` is [(method, amount), ...] — one entry for a single method,
        two for a cash/UPI split. Writes the Payment rows and this booking's
        summary fields together so they cannot drift apart.
        """
        from apps.shop.models import _record_payments

        return _record_payments(self, tenders, discount=discount, reason=reason)

    def release_rentals(self):
        """Hand rented kit back to the pool. Called when a bill is closed."""
        for item in self.items.filter(returned_at__isnull=True):
            item.mark_returned()
