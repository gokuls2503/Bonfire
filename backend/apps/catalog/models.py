"""Stations, station types, pricing and the game library."""
from django.core.validators import MinValueValidator
from django.db import models
from django.utils.text import slugify


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class StationType(TimeStamped):
    """A category of thing a customer can book: Gaming PC, PS5, racing rig..."""

    name = models.CharField(max_length=60, unique=True)
    slug = models.SlugField(max_length=70, unique=True, blank=True)
    short_description = models.CharField(max_length=180, blank=True)
    description = models.TextField(blank=True)
    icon = models.CharField(
        max_length=30,
        default="monitor",
        help_text="Icon key rendered by the frontend (monitor, gamepad, wheel, vr, headset).",
    )
    image = models.ImageField(upload_to="station-types/", blank=True, null=True)
    max_players_per_station = models.PositiveSmallIntegerField(default=1)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "name")

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    @property
    def active_station_count(self):
        return self.stations.filter(is_active=True).count()


class Station(TimeStamped):
    """One physical seat: PC-01, PS5-02."""

    class Status(models.TextChoices):
        AVAILABLE = "available", "Available"
        OCCUPIED = "occupied", "Occupied"
        RESERVED = "reserved", "Reserved"
        MAINTENANCE = "maintenance", "Maintenance"
        OFFLINE = "offline", "Offline"

    station_type = models.ForeignKey(
        StationType, on_delete=models.PROTECT, related_name="stations"
    )
    name = models.CharField(max_length=40, unique=True, help_text="e.g. PC-01, PS5-02")
    specs = models.TextField(blank=True, help_text="CPU / GPU / RAM / monitor, or console details.")
    peripherals = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    status_note = models.CharField(max_length=160, blank=True)
    is_active = models.BooleanField(default=True, help_text="Uncheck to hide without deleting.")
    is_bookable = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("station_type__sort_order", "sort_order", "name")

    def __str__(self):
        return self.name


class PricingPlan(TimeStamped):
    """A sellable block of time on a station type."""

    station_type = models.ForeignKey(
        StationType, on_delete=models.CASCADE, related_name="pricing_plans"
    )
    name = models.CharField(max_length=60, help_text="e.g. 1 Hour, Happy Hour, 5-Hour Pack")
    duration_minutes = models.PositiveIntegerField(validators=[MinValueValidator(15)])
    price = models.DecimalField(max_digits=8, decimal_places=2)
    compare_at_price = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True,
        help_text="Struck-through price, for showing a discount.",
    )
    badge = models.CharField(max_length=24, blank=True, help_text="e.g. Popular, Best value")
    description = models.CharField(max_length=180, blank=True)
    available_from = models.TimeField(null=True, blank=True, help_text="Happy-hour window start.")
    available_to = models.TimeField(null=True, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("station_type__sort_order", "sort_order", "duration_minutes")

    def __str__(self):
        return f"{self.station_type.name} - {self.name}"


class Game(TimeStamped):
    """The library customers can browse before they come in."""

    title = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    platforms = models.ManyToManyField(StationType, blank=True, related_name="games")
    genre = models.CharField(max_length=60, blank=True)
    cover = models.ImageField(upload_to="games/", blank=True, null=True)
    is_featured = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("-is_featured", "sort_order", "title")

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)[:140]
        super().save(*args, **kwargs)
