from django.contrib import admin

from .models import Booking, BusinessHours, Closure


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("code", "full_name", "phone", "station_type", "start_at", "status", "payment_status")
    list_filter = ("status", "payment_status", "station_type", "source")
    search_fields = ("code", "full_name", "phone", "email")
    date_hierarchy = "start_at"
    readonly_fields = ("code", "created_at", "updated_at")


@admin.register(BusinessHours)
class BusinessHoursAdmin(admin.ModelAdmin):
    list_display = ("get_weekday_display", "opens_at", "closes_at", "is_closed")
    list_editable = ("opens_at", "closes_at", "is_closed")
    list_display_links = ("get_weekday_display",)


@admin.register(Closure)
class ClosureAdmin(admin.ModelAdmin):
    list_display = ("date", "reason", "is_full_day")
