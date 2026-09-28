from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.customers.models import Customer

from .models import Membership, MembershipPlan, MembershipUsage


class MembershipPlanSerializer(serializers.ModelSerializer):
    perk_list = serializers.ListField(read_only=True)
    active_member_count = serializers.IntegerField(read_only=True)
    station_type_names = serializers.SerializerMethodField()

    class Meta:
        model = MembershipPlan
        fields = [
            "id", "name", "slug", "price", "compare_at_price", "duration_days",
            "discount_percent", "included_hours", "station_types", "station_type_names",
            "description", "perks", "perk_list", "badge", "sort_order", "is_active",
            "is_public", "active_member_count",
        ]
        extra_kwargs = {"slug": {"required": False}}

    def get_station_type_names(self, obj):
        return [t.name for t in obj.station_types.all()]


class PublicMembershipPlanSerializer(serializers.ModelSerializer):
    """What the public site may see — no member counts, no internal flags."""

    perks = serializers.ListField(source="perk_list", read_only=True)
    platforms = serializers.SerializerMethodField()

    class Meta:
        model = MembershipPlan
        fields = [
            "id", "name", "slug", "price", "compare_at_price", "duration_days",
            "discount_percent", "included_hours", "description", "perks", "badge",
            "platforms",
        ]

    def get_platforms(self, obj):
        return [t.name for t in obj.station_types.all()]


class MembershipUsageSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    booking_code = serializers.CharField(source="booking.code", read_only=True, default=None)

    class Meta:
        model = MembershipUsage
        fields = [
            "id", "membership", "booking", "booking_code", "hours", "kind",
            "kind_display", "note", "created_at",
        ]
        read_only_fields = ["membership", "created_at"]


class MembershipSerializer(serializers.ModelSerializer):
    """Read/write shape for the admin console.

    `phone` is write-only sugar: the counter types a number and the customer is
    found or created, exactly as a walk-in booking does it.
    """

    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    full_name = serializers.CharField(write_only=True, required=False, allow_blank=True)

    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    customer_code = serializers.CharField(source="customer.code", read_only=True)
    plan_display = serializers.CharField(source="plan.name", read_only=True)
    state = serializers.CharField(read_only=True)
    is_current = serializers.BooleanField(read_only=True)
    days_remaining = serializers.IntegerField(read_only=True)
    hours_remaining = serializers.DecimalField(
        max_digits=6, decimal_places=1, read_only=True
    )
    usage_percent = serializers.FloatField(read_only=True)
    has_hour_allowance = serializers.BooleanField(read_only=True)

    class Meta:
        model = Membership
        fields = [
            "id", "code", "customer", "customer_name", "customer_phone", "customer_code",
            "phone", "full_name", "plan", "plan_name", "plan_display", "price",
            "duration_days", "discount_percent", "included_hours", "starts_on", "ends_on",
            "status", "payment_status", "payment_method", "amount_paid", "paid_at",
            "hours_used", "notes", "state", "is_current", "days_remaining",
            "hours_remaining", "usage_percent", "has_hour_allowance", "auto_renew",
            "renewed_from", "paused_on", "paused_days", "created_at",
        ]
        read_only_fields = [
            "code", "plan_name", "discount_percent", "included_hours", "amount_paid",
            "paid_at", "hours_used", "paused_on", "paused_days", "renewed_from",
            "created_at",
        ]
        extra_kwargs = {
            "customer": {"required": False},
            "ends_on": {"required": False},
            "duration_days": {"required": False},
        }

    def validate(self, attrs):
        phone = (attrs.pop("phone", "") or "").strip()
        full_name = (attrs.pop("full_name", "") or "").strip()

        if not attrs.get("customer") and not self.instance:
            if not phone:
                raise serializers.ValidationError(
                    {"phone": "Enter the member's phone number, or pick an existing customer."}
                )
            digits = "".join(c for c in phone if c.isdigit())
            if len(digits) < 10:
                raise serializers.ValidationError({"phone": "Enter a valid phone number."})
            customer, created = Customer.objects.get_or_create(
                phone=phone, defaults={"full_name": full_name or "Member"}
            )
            if not created and full_name and customer.full_name != full_name:
                customer.full_name = full_name
                customer.save(update_fields=["full_name", "updated_at"])
            attrs["customer"] = customer

        plan = attrs.get("plan") or (self.instance.plan if self.instance else None)
        if plan and not attrs.get("duration_days") and not self.instance:
            attrs["duration_days"] = plan.duration_days
        if plan and attrs.get("price") in (None, ""):
            attrs.setdefault("price", plan.price)

        instance = Membership(**{**self._instance_data(), **attrs})
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
            for f in Membership._meta.fields
            if f.name != "id"
        }
