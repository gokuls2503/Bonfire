from django.contrib import admin

from .models import Membership, MembershipPlan, MembershipUsage


@admin.register(MembershipPlan)
class MembershipPlanAdmin(admin.ModelAdmin):
    list_display = ("name", "price", "duration_days", "discount_percent", "is_active", "is_public")
    list_filter = ("is_active", "is_public")
    search_fields = ("name", "description")
    filter_horizontal = ("station_types",)
    prepopulated_fields = {"slug": ("name",)}


class MembershipUsageInline(admin.TabularInline):
    model = MembershipUsage
    extra = 0
    fields = ("created_at", "kind", "hours", "booking", "note")
    readonly_fields = ("created_at",)


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("code", "customer", "plan_name", "starts_on", "ends_on", "status",
                    "payment_status", "amount_paid")
    list_filter = ("status", "payment_status", "plan")
    search_fields = ("code", "customer__code", "customer__full_name", "customer__phone")
    readonly_fields = ("code", "plan_name", "hours_used", "paused_days")
    autocomplete_fields = ("customer",)
    inlines = [MembershipUsageInline]


@admin.register(MembershipUsage)
class MembershipUsageAdmin(admin.ModelAdmin):
    list_display = ("membership", "kind", "hours", "booking", "created_at")
    list_filter = ("kind",)
    search_fields = ("membership__code", "membership__customer__full_name", "note")
