"""Weekly tournaments and their registrations."""
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from apps.catalog.models import StationType, TimeStamped
from apps.customers.models import Customer


class Tournament(TimeStamped):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        OPEN = "open", "Registration open"
        FULL = "full", "Full"
        LIVE = "live", "Live now"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    class Format(models.TextChoices):
        SINGLE_ELIM = "single_elim", "Single elimination"
        DOUBLE_ELIM = "double_elim", "Double elimination"
        ROUND_ROBIN = "round_robin", "Round robin"
        POINTS = "points", "Points / leaderboard"

    title = models.CharField(max_length=140)
    slug = models.SlugField(max_length=160, unique=True, blank=True)
    game = models.CharField(max_length=100, help_text="e.g. Valorant, FIFA 26, BGMI")
    platform = models.ForeignKey(
        StationType, on_delete=models.SET_NULL, null=True, blank=True, related_name="tournaments"
    )
    banner = models.ImageField(upload_to="tournaments/", blank=True, null=True)
    tagline = models.CharField(max_length=180, blank=True)
    description = models.TextField(blank=True)
    rules = models.TextField(blank=True)

    format = models.CharField(max_length=20, choices=Format.choices, default=Format.SINGLE_ELIM)
    team_size = models.PositiveSmallIntegerField(default=1, help_text="1 for solo events.")
    max_teams = models.PositiveSmallIntegerField(default=16)

    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    registration_closes_at = models.DateTimeField(null=True, blank=True)

    entry_fee = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    prize_pool = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    prize_breakdown = models.TextField(blank=True, help_text="One prize per line, e.g. '1st - Rs 3000'")

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT, db_index=True)
    is_recurring_weekly = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)
    venue_note = models.CharField(max_length=160, blank=True)

    class Meta:
        ordering = ("-starts_at",)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:150] or "tournament"
            slug, i = base, 2
            while Tournament.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base}-{i}"
                i += 1
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def confirmed_team_count(self):
        return self.registrations.filter(status="confirmed").count()

    @property
    def slots_left(self):
        return max(self.max_teams - self.confirmed_team_count, 0)

    @property
    def is_registration_open(self):
        if self.status != self.Status.OPEN:
            return False
        if self.registration_closes_at and timezone.now() > self.registration_closes_at:
            return False
        return self.slots_left > 0


class TournamentRegistration(TimeStamped):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        WAITLIST = "waitlist", "Waitlisted"
        REJECTED = "rejected", "Rejected"
        WITHDRAWN = "withdrawn", "Withdrawn"

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PAID = "paid", "Paid at counter"
        WAIVED = "waived", "Waived"

    tournament = models.ForeignKey(
        Tournament, on_delete=models.CASCADE, related_name="registrations"
    )
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="tournament_registrations",
    )
    team_name = models.CharField(max_length=80)
    captain_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, db_index=True)
    email = models.EmailField(blank=True)
    roster = models.TextField(blank=True, help_text="One player per line: name / in-game ID.")

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    payment_status = models.CharField(
        max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID
    )
    seed = models.PositiveSmallIntegerField(null=True, blank=True)
    final_position = models.PositiveSmallIntegerField(null=True, blank=True)
    staff_notes = models.TextField(blank=True)

    class Meta:
        ordering = ("tournament", "seed", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=("tournament", "phone"), name="unique_registration_per_phone"
            )
        ]

    def __str__(self):
        return f"{self.team_name} @ {self.tournament.title}"

    def save(self, *args, **kwargs):
        if self.customer is None and self.phone:
            self.customer, _ = Customer.objects.get_or_create(
                phone=self.phone,
                defaults={"full_name": self.captain_name, "email": self.email},
            )
        super().save(*args, **kwargs)
