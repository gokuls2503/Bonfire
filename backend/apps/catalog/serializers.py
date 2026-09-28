from rest_framework import serializers

from .models import ControllerRate, Game, PricingPlan, Station, StationType


class ControllerRateSerializer(serializers.ModelSerializer):
    total = serializers.DecimalField(max_digits=9, decimal_places=2, read_only=True)

    class Meta:
        model = ControllerRate
        fields = ["id", "plan", "controllers", "price_per_controller", "total"]


class PricingPlanSerializer(serializers.ModelSerializer):
    station_type_name = serializers.CharField(source="station_type.name", read_only=True)
    controller_rates = ControllerRateSerializer(many=True, read_only=True)

    class Meta:
        model = PricingPlan
        fields = [
            "id", "station_type", "station_type_name", "name", "duration_minutes", "price",
            "compare_at_price", "badge", "description", "available_from", "available_to",
            "sort_order", "is_active", "is_bookable", "controller_rates",
        ]


class StationSerializer(serializers.ModelSerializer):
    station_type_name = serializers.CharField(source="station_type.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Station
        fields = [
            "id", "name", "station_type", "station_type_name", "specs", "peripherals",
            "status", "status_display", "status_note", "is_active", "is_bookable",
            "sort_order", "created_at",
        ]


class StationTypeSerializer(serializers.ModelSerializer):
    pricing_plans = serializers.SerializerMethodField()
    station_count = serializers.IntegerField(source="active_station_count", read_only=True)
    stations = serializers.SerializerMethodField()

    class Meta:
        model = StationType
        fields = [
            "id", "name", "slug", "short_description", "description", "icon", "image",
            "max_players_per_station", "prices_per_controller", "sort_order", "is_active",
            "station_count", "pricing_plans", "stations",
        ]

    def get_pricing_plans(self, obj):
        plans = [p for p in obj.pricing_plans.all() if p.is_active]
        return PricingPlanSerializer(plans, many=True).data

    def get_stations(self, obj):
        stations = [s for s in obj.stations.all() if s.is_active]
        return [
            {"id": s.id, "name": s.name, "specs": s.specs, "peripherals": s.peripherals,
             "status": s.status}
            for s in stations
        ]


class StationTypeWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = StationType
        fields = [
            "id", "name", "slug", "short_description", "description", "icon", "image",
            "max_players_per_station", "prices_per_controller", "sort_order", "is_active",
        ]
        extra_kwargs = {"slug": {"required": False}}


class GameSerializer(serializers.ModelSerializer):
    platform_names = serializers.SerializerMethodField()

    class Meta:
        model = Game
        fields = [
            "id", "title", "slug", "platforms", "platform_names", "genre", "cover",
            "is_featured", "is_active", "sort_order",
        ]
        extra_kwargs = {"slug": {"required": False}}

    def get_platform_names(self, obj):
        return [p.name for p in obj.platforms.all()]
