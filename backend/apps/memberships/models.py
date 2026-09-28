"""Monthly memberships — a scheme the owner defines, sold to a customer.

A membership is deliberately kept beside the booking flow rather than inside
it: selling one, renewing one and letting one lapse never touch a booking, a
bill or a station. What a member gets is recorded on the plan (a standing
discount, included hours, perks) so the counter can see it while ringing a
session up, but nothing is applied automatically.

Every field a customer's money depends on is snapshotted onto the membership
when it is sold, so raising the price of a plan tomorrow never rewrites what
someone paid today.

Usage is a ledger, not a counter. `MembershipUsage` holds one row per draw —
a completed session, a manual correction, a credit back — and `hours_used` is
a cached sum of it, recomputed from the rows rather than incremented in place.
That is what makes a draw reversible: cancelling a session deletes its row and
the balance follows, which an `F("hours_used") + n` counter could never undo
safely.
"""
import secrets
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models, transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.text import slugify

from apps.catalog.models import TimeStamped
from apps.customers.models import Customer

MONEY = {"max_digits": 9, "decimal_places": 2}


def make_membership_code():
    return "M-" + secrets.token_hex(3).upper()


class MembershipPlan(TimeStamped):
    """A scheme the owner sells: "Monthly Unlimited", "Weekend Pass"…

    Everything here is editable in the admin. `duration_days` is what makes it
    monthly — 30 by default, but a 90-day or 365-day scheme needs no code.
    """

    name = models.CharField(max_length=60, unique=True, help_text="e.g. Monthly Gold")
    slug = models.SlugField(max_length=70, unique=True, blank=True)
    price = models.DecimalField(**MONEY, validators=[MinValueValidator(Decimal("0"))])
    compare_at_price = models.DecimalField(
        **MONEY, null=True, blank=True,
        help_text="Struck-through price, for showing what the scheme saves.",
    )
    duration_days = models.PositiveIntegerField(
        default=30, validators=[MinValueValidator(1)],
        help_text="How long one term runs. 30 for a monthly scheme.",
    )
    discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))],
        help_text="Standing discount a member gets on sessions. Shown at the counter; "
                  "staff still apply it at checkout.",
    )
    included_hours = models.DecimalField(
        max_digits=6, decimal_places=1, default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Play hours the term includes. 0 for a discount-only scheme.",
    )
    station_types = models.ManyToManyField(
        "catalog.StationType", blank=True, related_name="membership_plans",
        help_text="Which platforms the scheme covers. Leave empty for all of them.",
    )
    description = models.CharField(max_length=180, blank=True)
    perks = models.TextField(
        blank=True, help_text="One perk per line. Listed on the plan card."
    )
    badge = models.CharField(max_length=24, blank=True, help_text="e.g. Popular, Best value")
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(
        default=True, help_text="Uncheck to stop selling it without touching live members."
    )
    is_public = models.BooleanField(
        default=True, help_text="Show this scheme on the public site."
    )

    class Meta:
        ordering = ("sort_order", "price", "name")

    def __str__(self):
        return f"{self.name} ({self.duration_days}d)"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:70]
        super().save(*args, **kwargs)

    @property
    def perk_list(self):
        return [line.strip() for line in self.perks.splitlines() if line.strip()]

    @property
    def active_member_count(self):
        return sum(1 for m in self.memberships.all() if m.is_current)


class Membership(TimeStamped):
    """One customer's term on a plan."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        CANCELLED = "cancelled", "Cancelled"

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PAID = "paid", "Paid"
        WAIVED = "waived", "Waived"

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        UPI = "upi", "UPI"
        CARD = "card", "Card"
        OTHER = "other", "Other"

    code = models.CharField(
        max_length=12, unique=True, default=make_membership_code, editable=False
    )
    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name="memberships"
    )
    plan = models.ForeignKey(
        MembershipPlan, on_delete=models.PROTECT, related_name="memberships"
    )

    # Snapshots — a later edit to the plan must not rewrite a sold term.
    plan_name = models.CharField(max_length=60, blank=True)
    price = models.DecimalField(**MONEY, default=0, help_text="What this term was sold for.")
    duration_days = models.PositiveIntegerField(default=30)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    included_hours = models.DecimalField(max_digits=6, decimal_places=1, default=Decimal("0"))

    starts_on = models.DateField(default=timezone.localdate, db_index=True)
    ends_on = models.DateField(db_index=True, blank=True)

    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True
    )
    payment_status = models.CharField(
        max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID, db_index=True
    )
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices, blank=True)
    amount_paid = models.DecimalField(**MONEY, default=0)
    paid_at = models.DateTimeField(null=True, blank=True)

    hours_used = models.DecimalField(
        max_digits=6, decimal_places=1, default=Decimal("0"),
        help_text="Play hours drawn from the term. A cached sum of the usage ledger.",
    )

    auto_renew = models.BooleanField(
        default=False,
        help_text="Roll into a fresh term when this one ends, priced at the plan's "
                  "rate on the day it rolls. The fee is still collected by hand.",
    )
    renewed_from = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="renewals",
        help_text="The term this one followed, so a subscription reads as a chain.",
    )

    paused_on = models.DateField(
        null=True, blank=True, help_text="The day the term was frozen. Null when running."
    )
    paused_days = models.PositiveIntegerField(
        default=0, help_text="Total days this term has been frozen for, across all pauses."
    )

    notes = models.TextField(blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-starts_on", "-created_at")
        indexes = [models.Index(fields=["status", "ends_on"])]

    def __str__(self):
        return f"{self.code} - {self.customer.full_name} - {self.plan_name}"

    # ---- lifecycle -------------------------------------------------------

    def clean(self):
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValidationError({"ends_on": "A term cannot end before it starts."})

    def save(self, *args, **kwargs):
        if self.plan_id:
            # Snapshot on the way in, but only for a term that has not been sold
            # yet — editing a live membership must not silently re-price it.
            if not self.plan_name:
                self.plan_name = self.plan.name
            if self._state.adding:
                # Coerced, because a plan built in the same breath still holds
                # whatever type it was assigned — and these are money and hours.
                if not self.price:
                    self.price = self.plan.price
                self.duration_days = self.duration_days or self.plan.duration_days
                self.discount_percent = Decimal(str(self.plan.discount_percent))
                self.included_hours = Decimal(str(self.plan.included_hours))
        self.price = Decimal(str(self.price or 0)).quantize(Decimal("0.01"))
        self.hours_used = Decimal(str(self.hours_used or 0))
        if not self.ends_on and self.starts_on:
            self.ends_on = self.starts_on + timedelta(days=self.duration_days - 1)
        super().save(*args, **kwargs)

    # ---- derived state ---------------------------------------------------

    @property
    def is_expired(self):
        return bool(self.ends_on) and self.ends_on < timezone.localdate()

    @property
    def is_current(self):
        """Live today: running, inside its dates, and paid for.

        A paused term is deliberately not current — that is the whole point of
        freezing one, and it is what stops a session drawing hours from it.
        """
        today = timezone.localdate()
        return (
            self.status == self.Status.ACTIVE
            and self.payment_status in (self.PaymentStatus.PAID, self.PaymentStatus.WAIVED)
            and self.starts_on <= today <= self.ends_on
        )

    @property
    def state(self):
        """What staff actually see — the stored status, aged by the calendar."""
        if self.status == self.Status.CANCELLED:
            return "cancelled"
        if self.status == self.Status.PAUSED:
            return "paused"
        if self.payment_status == self.PaymentStatus.UNPAID:
            return "unpaid"
        if self.is_expired:
            return "expired"
        if self.starts_on > timezone.localdate():
            return "scheduled"
        return "active"

    @property
    def days_remaining(self):
        if self.state in ("cancelled", "expired"):
            return 0
        if self.status == self.Status.PAUSED and self.paused_on:
            # Frozen: the clock stopped on the day it was paused.
            return max((self.ends_on - self.paused_on).days + 1, 0)
        return max((self.ends_on - timezone.localdate()).days + 1, 0)

    @property
    def has_hour_allowance(self):
        """A discount-only scheme has no bucket to draw on."""
        return self.included_hours > 0

    @property
    def hours_remaining(self):
        """None for a discount-only scheme, which has no hour bucket to draw on."""
        if not self.has_hour_allowance:
            return None
        return max(self.included_hours - self.hours_used, Decimal("0.0"))

    @property
    def usage_percent(self):
        if not self.has_hour_allowance:
            return None
        return min(round(float(self.hours_used) / float(self.included_hours) * 100, 1), 100.0)

    # ---- actions ---------------------------------------------------------

    def record_payment(self, method, amount=None):
        self.payment_method = method
        self.amount_paid = Decimal(str(amount if amount is not None else self.price))
        self.payment_status = self.PaymentStatus.PAID
        self.paid_at = self.paid_at or timezone.now()
        self.save(update_fields=[
            "payment_method", "amount_paid", "payment_status", "paid_at", "updated_at",
        ])
        return self

    def waive(self, reason=""):
        self.payment_status = self.PaymentStatus.WAIVED
        self.amount_paid = Decimal("0.00")
        self.payment_method = ""
        if reason:
            self.notes = f"{self.notes}\nWaived: {reason}".strip()
        self.save(update_fields=[
            "payment_status", "amount_paid", "payment_method", "notes", "updated_at",
        ])
        return self

    def cancel(self, reason=""):
        self.status = self.Status.CANCELLED
        self.cancelled_at = timezone.now()
        if reason:
            self.notes = f"{self.notes}\nCancelled: {reason}".strip()
        self.save(update_fields=["status", "cancelled_at", "notes", "updated_at"])
        return self

    def pause(self, reason=""):
        """Freeze the term. Days stop ticking until it is resumed."""
        if self.status != self.Status.ACTIVE:
            raise ValidationError("Only a running membership can be paused.")
        self.status = self.Status.PAUSED
        self.paused_on = timezone.localdate()
        if reason:
            self.notes = f"{self.notes}\nPaused: {reason}".strip()
        self.save(update_fields=["status", "paused_on", "notes", "updated_at"])
        return self

    def resume(self):
        """Unfreeze, pushing the end date out by however long it was frozen.

        The member gets back exactly the days they lost, which is the only
        reading of a freeze that is fair in both directions.
        """
        if self.status != self.Status.PAUSED:
            raise ValidationError("That membership is not paused.")
        frozen = max((timezone.localdate() - self.paused_on).days, 0) if self.paused_on else 0
        self.ends_on = self.ends_on + timedelta(days=frozen)
        self.paused_days = self.paused_days + frozen
        self.paused_on = None
        self.status = self.Status.ACTIVE
        self.save(update_fields=[
            "status", "ends_on", "paused_days", "paused_on", "updated_at",
        ])
        return self

    def renew(self, plan=None, starts_on=None, auto_renew=None):
        """Sell the next term, at today's price for the plan.

        A renewal picks up the day after this term ends, so a member who pays
        early keeps the days they already bought. Hours do not carry over — a
        fresh term is a fresh allowance, which is what "monthly" means.
        """
        plan = plan or self.plan
        if starts_on is None:
            tomorrow = timezone.localdate() + timedelta(days=1)
            starts_on = max(self.ends_on + timedelta(days=1), tomorrow)
        return Membership.objects.create(
            customer=self.customer,
            plan=plan,
            duration_days=plan.duration_days,
            starts_on=starts_on,
            renewed_from=self,
            auto_renew=self.auto_renew if auto_renew is None else auto_renew,
        )

    # ---- usage -----------------------------------------------------------

    def recalculate_hours(self):
        """Re-derive `hours_used` from the ledger. The rows are the truth."""
        total = self.usage.aggregate(t=Sum("hours"))["t"] or Decimal("0.0")
        self.hours_used = max(Decimal(str(total)), Decimal("0.0"))
        self.save(update_fields=["hours_used", "updated_at"])
        return self.hours_used

    def log_usage(self, hours, kind="adjustment", booking=None, note=""):
        """Write one line to the ledger and refresh the cached total."""
        with transaction.atomic():
            entry = MembershipUsage.objects.create(
                membership=self, booking=booking, hours=Decimal(str(hours)),
                kind=kind, note=note,
            )
            self.recalculate_hours()
        return entry

    def draw_for_booking(self, booking):
        """Draw a completed session's hours from this term.

        Returns (entry, billable_hours). Only what the allowance can still cover
        is drawn; anything beyond it comes back as `billable_hours` for staff to
        charge normally. Nothing here touches the bill — the counter decides
        what to do with the number.

        Idempotent: a booking draws once, so completing a session twice (or
        re-opening and re-closing one) cannot double-charge the allowance.
        """
        if not self.has_hour_allowance or not self.is_current:
            return None, Decimal("0.0")
        if MembershipUsage.objects.filter(booking=booking).exists():
            return None, Decimal("0.0")

        wanted = (
            Decimal(booking.duration_minutes) / Decimal("60") * Decimal(booking.seats)
        ).quantize(Decimal("0.1"))
        remaining = self.hours_remaining or Decimal("0.0")
        covered = min(wanted, remaining)
        billable = (wanted - covered).quantize(Decimal("0.1"))

        if covered <= 0:
            return None, billable

        note = f"Session {booking.code}"
        if billable > 0:
            note += f" — {billable} hr over the allowance"
        entry = self.log_usage(
            covered, kind=MembershipUsage.Kind.SESSION, booking=booking, note=note
        )
        return entry, billable

    @staticmethod
    def credit_for_booking(booking):
        """Give the hours back when a session is cancelled after being drawn."""
        entry = MembershipUsage.objects.filter(booking=booking).select_related(
            "membership"
        ).first()
        if entry is None:
            return None
        membership = entry.membership
        with transaction.atomic():
            entry.delete()
            membership.recalculate_hours()
        return membership

    # ---- lookups ---------------------------------------------------------

    @classmethod
    def due_to_renew(cls, on=None):
        """Terms that have run out and are set to roll into the next one."""
        on = on or timezone.localdate()
        return cls.objects.filter(
            status=cls.Status.ACTIVE,
            auto_renew=True,
            ends_on__lt=on,
            payment_status__in=[cls.PaymentStatus.PAID, cls.PaymentStatus.WAIVED],
            renewals__isnull=True,
        ).select_related("customer", "plan")

    @classmethod
    def expiring_between(cls, start, end):
        """Live terms running out in a window, for the reminder list."""
        return cls.objects.filter(
            status=cls.Status.ACTIVE,
            payment_status__in=[cls.PaymentStatus.PAID, cls.PaymentStatus.WAIVED],
            ends_on__gte=start,
            ends_on__lte=end,
        ).select_related("customer", "plan")

    @classmethod
    def current_for(cls, customer):
        """The membership in force for this customer today, if any."""
        today = timezone.localdate()
        return (
            cls.objects.filter(
                customer=customer,
                status=cls.Status.ACTIVE,
                payment_status__in=[cls.PaymentStatus.PAID, cls.PaymentStatus.WAIVED],
                starts_on__lte=today,
                ends_on__gte=today,
            )
            .select_related("plan")
            .order_by("-ends_on")
            .first()
        )


class MembershipUsage(TimeStamped):
    """One draw against a term's hour allowance.

    Positive hours come off the allowance, negative hours put them back, and
    `Membership.hours_used` is the sum. Keeping it as rows rather than a counter
    is what lets a cancelled session hand its hours back without guesswork, and
    it gives the member an itemised answer to "where did my hours go?".
    """

    class Kind(models.TextChoices):
        SESSION = "session", "Session played"
        ADJUSTMENT = "adjustment", "Manual adjustment"
        CREDIT = "credit", "Hours credited back"

    membership = models.ForeignKey(
        Membership, on_delete=models.CASCADE, related_name="usage"
    )
    booking = models.OneToOneField(
        "bookings.Booking", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="membership_usage",
        help_text="The session this draw came from. A booking draws exactly once.",
    )
    hours = models.DecimalField(
        max_digits=6, decimal_places=1,
        help_text="Positive draws from the allowance, negative gives hours back.",
    )
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.SESSION)
    note = models.CharField(max_length=180, blank=True)

    class Meta:
        ordering = ("-created_at", "-id")
        verbose_name = "Membership usage"
        verbose_name_plural = "Membership usage"

    def __str__(self):
        return f"{self.membership.code} {self.hours:+} hr ({self.get_kind_display()})"

    def clean(self):
        if self.hours is not None and self.hours == 0:
            raise ValidationError({"hours": "A usage line must move the balance."})
