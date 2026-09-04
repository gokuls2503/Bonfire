from django.contrib import admin

from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("code", "full_name", "phone", "tier", "total_bookings", "created_at")
    list_filter = ("tier", "marketing_opt_in")
    search_fields = ("code", "full_name", "phone", "email", "gamer_tag")
    readonly_fields = ("code", "booking_sequence")
