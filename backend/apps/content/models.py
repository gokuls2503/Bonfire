"""Editable site copy, gallery, testimonials, FAQ and the contact inbox."""
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.catalog.models import TimeStamped


class SiteSettings(TimeStamped):
    """Singleton row holding everything the owner can edit without a deploy."""

    brand_name = models.CharField(max_length=80, default="Bonfire Gaming Hub")
    tagline = models.CharField(max_length=140, default="Where the game never dies out.")
    logo = models.ImageField(upload_to="brand/", blank=True, null=True)
    favicon = models.ImageField(upload_to="brand/", blank=True, null=True)

    hero_eyebrow = models.CharField(max_length=60, blank=True, default="Now open")
    hero_headline = models.CharField(max_length=120, default="Fuel the fire.")
    hero_subline = models.CharField(
        max_length=240,
        default="High-spec gaming PCs and PS5s, weekly tournaments, and a room built for squads.",
    )
    hero_image = models.ImageField(upload_to="brand/", blank=True, null=True)
    hero_cta_label = models.CharField(max_length=40, default="Book a station")

    about_heading = models.CharField(max_length=120, default="Built by gamers, for gamers")
    about_body = models.TextField(blank=True)

    announcement = models.CharField(
        max_length=200, blank=True, help_text="Ticker at the top of the public site. Blank hides it."
    )
    announcement_is_active = models.BooleanField(default=False)

    phone = models.CharField(max_length=20, blank=True)
    whatsapp = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    address_line1 = models.CharField(max_length=140, blank=True)
    address_line2 = models.CharField(max_length=140, blank=True)
    city = models.CharField(max_length=60, blank=True)
    state = models.CharField(max_length=60, blank=True)
    postal_code = models.CharField(max_length=12, blank=True)
    map_embed_url = models.URLField(blank=True, help_text="Google Maps embed src URL.")
    directions_url = models.URLField(blank=True)

    instagram_url = models.URLField(blank=True)
    youtube_url = models.URLField(blank=True)
    discord_url = models.URLField(blank=True)
    x_url = models.URLField(blank=True)

    booking_enabled = models.BooleanField(default=True)
    booking_lead_minutes = models.PositiveSmallIntegerField(
        default=30, help_text="Earliest a customer may book from now."
    )
    booking_horizon_days = models.PositiveSmallIntegerField(
        default=14, help_text="How far ahead the public may book."
    )
    booking_note = models.CharField(
        max_length=200, blank=True,
        default="Pay at the counter when you arrive. Hold expires 15 minutes after slot start.",
    )

    seo_title = models.CharField(max_length=70, blank=True)
    seo_description = models.CharField(max_length=170, blank=True)
    og_image = models.ImageField(upload_to="brand/", blank=True, null=True)

    class Meta:
        verbose_name = "Site settings"
        verbose_name_plural = "Site settings"

    def __str__(self):
        return self.brand_name

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Site settings cannot be deleted.")

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def full_address(self):
        parts = [self.address_line1, self.address_line2, self.city, self.state, self.postal_code]
        return ", ".join(p for p in parts if p)


class GalleryImage(TimeStamped):
    class Category(models.TextChoices):
        SETUP = "setup", "The setup"
        EVENTS = "events", "Events"
        SQUAD = "squad", "Squad"
        CAFE = "cafe", "The space"

    image = models.ImageField(upload_to="gallery/")
    caption = models.CharField(max_length=140, blank=True)
    category = models.CharField(max_length=12, choices=Category.choices, default=Category.SETUP)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "-created_at")

    def __str__(self):
        return self.caption or f"Image #{self.pk}"


class Testimonial(TimeStamped):
    name = models.CharField(max_length=80)
    handle = models.CharField(max_length=60, blank=True)
    avatar = models.ImageField(upload_to="testimonials/", blank=True, null=True)
    rating = models.PositiveSmallIntegerField(
        default=5, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    quote = models.TextField()
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "-created_at")

    def __str__(self):
        return f"{self.name} ({self.rating}/5)"


class FAQ(TimeStamped):
    question = models.CharField(max_length=180)
    answer = models.TextField()
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "id")
        verbose_name = "FAQ"
        verbose_name_plural = "FAQs"

    def __str__(self):
        return self.question


class ContactMessage(TimeStamped):
    class Topic(models.TextChoices):
        GENERAL = "general", "General enquiry"
        BOOKING = "booking", "Booking help"
        TOURNAMENT = "tournament", "Tournaments"
        PARTY = "party", "Private / party booking"
        FEEDBACK = "feedback", "Feedback"

    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    topic = models.CharField(max_length=12, choices=Topic.choices, default=Topic.GENERAL)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} - {self.get_topic_display()}"
