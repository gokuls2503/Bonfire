from django.contrib import admin

from .models import BillItem, CounterSale, Product, ProductCategory, StockMovement


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "sort_order", "is_active")
    list_editable = ("sort_order", "is_active")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "name", "category", "kind", "pricing_mode", "price",
        "stock_quantity", "available_stock", "is_active",
    )
    list_filter = ("category", "kind", "pricing_mode", "is_active", "track_stock")
    search_fields = ("name", "sku", "description")

    @admin.display(description="Available")
    def available_stock(self, obj):
        value = obj.available_stock
        return "—" if value is None else value


class BillItemInline(admin.TabularInline):
    model = BillItem
    extra = 0
    fields = ("product", "quantity", "hours", "line_total", "returned_at")
    readonly_fields = ("line_total",)


@admin.register(CounterSale)
class CounterSaleAdmin(admin.ModelAdmin):
    list_display = ("code", "full_name", "amount_collected", "payment_method", "created_at")
    list_filter = ("payment_status", "payment_method")
    search_fields = ("code", "full_name", "phone")
    readonly_fields = ("code",)
    inlines = [BillItemInline]


@admin.register(BillItem)
class BillItemAdmin(admin.ModelAdmin):
    list_display = ("name", "quantity", "line_total", "booking", "sale", "returned_at")
    list_filter = ("kind", "pricing_mode")
    search_fields = ("name",)


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ("product", "change", "reason", "resulting_stock", "created_at")
    list_filter = ("reason", "product")
