from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from apps.content.models import SiteSettings

from .models import Booking, BusinessHours, Closure


class BusinessHoursSerializer(serializers.ModelSerializer):
    weekday_display = serializers.CharField(source="get_weekday_display", read_only=True)

    class Meta:
        model = BusinessHours
        fields = ["id", "weekday", "weekday_display", "opens_at", "closes_at", "is_closed"]


class ClosureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Closure
        fields = ["id", "date", "reason", "is_full_day", "opens_at", "closes_at"]


class BookingSerializer(serializers.ModelSerializer):
    """Full read/write shape used by the admin dashboard."""

    station_type_name = serializers.CharField(source="station_type.name", read_only=True)
    station_name = serializers.CharField(source="station.name", read_only=True, default=None)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    end_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Booking
        fields = [
            "id", "code", "customer", "full_name", "phone", "email", "station_type",
            "station_type_name", "station", "station_name", "pricing_plan", "start_at",
            "end_at", "duration_minutes", "seats", "status", "status_display",
            "payment_status", "amount_due", "amount_collected", "source", "notes",
            "staff_notes", "checked_in_at", "completed_at", "created_at",
        ]
        read_only_fields = ["code", "created_at"]

    def validate(self, attrs):
        instance = Booking(**{**self._instance_data(), **attrs})
        instance.pk = self.instance.pk if self.instance else None
        try:
            instance.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or exc.messages)
        return attrs

    def _instance_data(self):
        if not self.instance:
            return {}
        return {
            f.name: getattr(self.instance, f.name)
            for f in Booking._meta.fields
            if f.name not in ("id",)
        }


class PublicBookingCreateSerializer(serializers.ModelSerializer):
    """What the public site is allowed to submit. Everything else is staff-controlled."""

    class Meta:
        model = Booking
        fields = [
            "id", "code", "full_name", "phone", "email", "station_type", "pricing_plan",
            "start_at", "duration_minutes", "seats", "notes",
        ]
        read_only_fields = ["id", "code"]

    def validate_phone(self, value):
        digits = "".join(c for c in value if c.isdigit())
        if len(digits) < 10:
            raise serializers.ValidationError("Enter a valid phone number.")
        return value

    def validate_start_at(self, value):
        settings_obj = SiteSettings.load()
        now = timezone.now()
        earliest = now + timezone.timedelta(minutes=settings_obj.booking_lead_minutes)
        latest = now + timezone.timedelta(days=settings_obj.booking_horizon_days)
        if value < earliest:
            raise serializers.ValidationError(
                f"Please book at least {settings_obj.booking_lead_minutes} minutes ahead."
            )
        if value > latest:
            raise serializers.ValidationError(
                f"We only take bookings up to {settings_obj.booking_horizon_days} days ahead."
            )
        return value

    def validate(self, attrs):
        if not SiteSettings.load().booking_enabled:
            raise serializers.ValidationError(
                "Online booking is paused right now — please call us instead."
            )
        plan = attrs.get("pricing_plan")
        if plan:
            if plan.station_type_id != attrs["station_type"].id:
                raise serializers.ValidationError(
                    {"pricing_plan": "That plan does not belong to the selected station type."}
                )
            attrs["duration_minutes"] = plan.duration_minutes
        booking = Booking(**attrs, status=Booking.Status.PENDING)
        try:
            booking.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or exc.messages)
        return attrs
