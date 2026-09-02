from rest_framework import serializers

from .models import Tournament, TournamentRegistration


class TournamentSerializer(serializers.ModelSerializer):
    platform_name = serializers.CharField(source="platform.name", read_only=True, default=None)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    format_display = serializers.CharField(source="get_format_display", read_only=True)
    confirmed_team_count = serializers.IntegerField(read_only=True)
    slots_left = serializers.IntegerField(read_only=True)
    is_registration_open = serializers.BooleanField(read_only=True)
    registration_count = serializers.SerializerMethodField()

    class Meta:
        model = Tournament
        fields = [
            "id", "title", "slug", "game", "platform", "platform_name", "banner", "tagline",
            "description", "rules", "format", "format_display", "team_size", "max_teams",
            "starts_at", "ends_at", "registration_closes_at", "entry_fee", "prize_pool",
            "prize_breakdown", "status", "status_display", "is_recurring_weekly",
            "is_featured", "venue_note", "confirmed_team_count", "slots_left",
            "is_registration_open", "registration_count", "created_at",
        ]
        read_only_fields = ["slug"]

    def get_registration_count(self, obj):
        return obj.registrations.count()


class TournamentRegistrationSerializer(serializers.ModelSerializer):
    tournament_title = serializers.CharField(source="tournament.title", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = TournamentRegistration
        fields = [
            "id", "tournament", "tournament_title", "customer", "team_name", "captain_name",
            "phone", "email", "roster", "status", "status_display", "payment_status",
            "seed", "final_position", "staff_notes", "created_at",
        ]


class PublicRegistrationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TournamentRegistration
        fields = ["id", "tournament", "team_name", "captain_name", "phone", "email", "roster"]
        # DRF would otherwise auto-add a UniqueTogetherValidator whose message
        # ("The fields tournament, phone must make a unique set") is developer
        # speak on a customer-facing form, and lands on non_field_errors so the
        # frontend cannot attach it to the phone input. validate() handles it.
        validators = []

    def validate_tournament(self, tournament):
        if not tournament.is_registration_open:
            raise serializers.ValidationError("Registration for this tournament is closed.")
        return tournament

    def validate(self, attrs):
        exists = TournamentRegistration.objects.filter(
            tournament=attrs["tournament"], phone=attrs["phone"]
        ).exists()
        if exists:
            raise serializers.ValidationError(
                {"phone": "That number is already registered for this tournament."}
            )
        return attrs
