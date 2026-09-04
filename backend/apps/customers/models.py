"""Walk-in and repeat customers."""
import re
import secrets

from django.db import models, transaction
from django.db.models import F

from apps.catalog.models import TimeStamped

CODE_LENGTH = 6


def make_customer_code():
    """Six hex characters, e.g. 'A3F92C'. 16.7M possibilities."""
    return secrets.token_hex(CODE_LENGTH // 2).upper()


def normalise_code(raw):
    """Fold whatever the customer typed into the canonical form.

    'a3f92c-001', 'A3F92C 001' and 'A3F92C001' all become 'A3F92C001', so a
    lookup never fails on a missing hyphen or lowercase letters.
    """
    return re.sub(r"[^0-9A-Za-z]", "", str(raw or "")).upper()


class Customer(TimeStamped):
    class Tier(models.TextChoices):
        WALKIN = "walkin", "Walk-in"
        MEMBER = "member", "Member"
        VIP = "vip", "VIP"
        BANNED = "banned", "Banned"

    code = models.CharField(
        max_length=8, unique=True, editable=False,
        help_text="Permanent code for this phone number. Quoted at the counter.",
    )
    booking_sequence = models.PositiveIntegerField(
        default=0,
        help_text="Monotonic counter for this customer's booking codes. "
                  "Never decremented, so a deleted booking's number is not reused.",
    )
    full_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, unique=True, db_index=True)
    email = models.EmailField(blank=True)
    gamer_tag = models.CharField(max_length=60, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    tier = models.CharField(max_length=12, choices=Tier.choices, default=Tier.WALKIN)
    notes = models.TextField(blank=True)
    marketing_opt_in = models.BooleanField(default=False)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.code} - {self.full_name} ({self.phone})"

    def save(self, *args, **kwargs):
        if not self.code:
            # unique=True turns a collision into an IntegrityError rather than a
            # silent duplicate, so retrying a handful of times is enough.
            for _ in range(5):
                candidate = make_customer_code()
                if not Customer.objects.filter(code=candidate).exists():
                    self.code = candidate
                    break
            else:
                raise RuntimeError("Could not allocate a unique customer code.")
        super().save(*args, **kwargs)

    def next_booking_code(self):
        """Claim the next booking code for this customer.

        The counter is bumped with an UPDATE rather than read-modify-write, so
        two simultaneous bookings cannot be handed the same sequence number.
        """
        with transaction.atomic():
            Customer.objects.filter(pk=self.pk).update(
                booking_sequence=F("booking_sequence") + 1
            )
            self.refresh_from_db(fields=["booking_sequence"])
        return f"{self.code}-{self.booking_sequence:03d}"

    @property
    def total_bookings(self):
        return self.bookings.count()

    @property
    def total_hours_played(self):
        minutes = sum(
            b.duration_minutes
            for b in self.bookings.filter(status__in=["completed", "checked_in"])
        )
        return round(minutes / 60, 1)
