from django.contrib import admin

from .models import Tournament, TournamentRegistration


class RegistrationInline(admin.TabularInline):
    model = TournamentRegistration
    extra = 0
    fields = ("team_name", "captain_name", "phone", "status", "payment_status", "seed")


@admin.register(Tournament)
class TournamentAdmin(admin.ModelAdmin):
    list_display = ("title", "game", "starts_at", "status", "confirmed_team_count", "max_teams")
    list_filter = ("status", "is_featured", "is_recurring_weekly")
    search_fields = ("title", "game")
    date_hierarchy = "starts_at"
    inlines = [RegistrationInline]


@admin.register(TournamentRegistration)
class TournamentRegistrationAdmin(admin.ModelAdmin):
    list_display = ("team_name", "tournament", "captain_name", "phone", "status", "payment_status")
    list_filter = ("tournament", "status", "payment_status")
    search_fields = ("team_name", "captain_name", "phone")
