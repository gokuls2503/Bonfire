"""Walk-in and repeat customers."""
from django.db import models

from apps.catalog.models import TimeStamped


class Customer(TimeStamped):
    class Tier(models.TextChoices):
        WALKIN = "walkin", "Walk-in"
        MEMBER = "member", "Member"
        VIP = "vip", "VIP"
        BANNED = "banned", "Banned"

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
        return f"{self.full_name} ({self.phone})"

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
