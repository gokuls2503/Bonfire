from rest_framework import serializers

from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    total_bookings = serializers.IntegerField(read_only=True)
    total_hours_played = serializers.FloatField(read_only=True)
    membership = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            "id", "code", "full_name", "phone", "email", "gamer_tag", "date_of_birth",
            "tier", "notes", "marketing_opt_in", "total_bookings", "total_hours_played",
            "membership", "created_at",
        ]
        read_only_fields = ["code"]

    def get_membership(self, obj):
        """The term in force today, so the counter can see it on the customer row."""
        from apps.memberships.models import Membership

        current = Membership.current_for(obj)
        if current is None:
            return None
        return {
            "id": current.id,
            "code": current.code,
            "plan": current.plan_name,
            "ends_on": current.ends_on,
            "days_remaining": current.days_remaining,
            "discount_percent": current.discount_percent,
        }
