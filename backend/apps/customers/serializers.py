from rest_framework import serializers

from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    total_bookings = serializers.IntegerField(read_only=True)
    total_hours_played = serializers.FloatField(read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id", "code", "full_name", "phone", "email", "gamer_tag", "date_of_birth",
            "tier", "notes", "marketing_opt_in", "total_bookings", "total_hours_played",
            "created_at",
        ]
        read_only_fields = ["code"]
