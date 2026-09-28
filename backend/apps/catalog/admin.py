from django.contrib import admin

from .models import ControllerRate, Game, PricingPlan, Station, StationType


class StationInline(admin.TabularInline):
    model = Station
    extra = 0
    fields = ("name", "status", "is_active", "is_bookable", "sort_order")


class PricingPlanInline(admin.TabularInline):
    model = PricingPlan
    extra = 0
    fields = ("name", "duration_minutes", "price", "badge", "is_active", "is_bookable",
              "sort_order")


class ControllerRateInline(admin.TabularInline):
    model = ControllerRate
    extra = 0
    fields = ("controllers", "price_per_controller")


@admin.register(StationType)
class StationTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "active_station_count", "sort_order", "is_active")
    list_editable = ("sort_order", "is_active")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [StationInline, PricingPlanInline]


@admin.register(Station)
class StationAdmin(admin.ModelAdmin):
    list_display = ("name", "station_type", "status", "is_active", "is_bookable")
    list_filter = ("station_type", "status", "is_active")
    search_fields = ("name", "specs")


@admin.register(PricingPlan)
class PricingPlanAdmin(admin.ModelAdmin):
    list_display = ("name", "station_type", "duration_minutes", "price", "is_active",
                    "is_bookable")
    list_filter = ("station_type", "is_active", "is_bookable")
    inlines = [ControllerRateInline]


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ("title", "genre", "is_featured", "is_active")
    list_filter = ("is_featured", "is_active", "platforms")
    search_fields = ("title", "genre")
    prepopulated_fields = {"slug": ("title",)}
