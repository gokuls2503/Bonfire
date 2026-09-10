from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import BillItem, CounterSale, Product, ProductCategory, StockMovement


class ProductCategorySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = ProductCategory
        fields = ["id", "name", "slug", "icon", "sort_order", "is_active", "product_count"]
        extra_kwargs = {"slug": {"required": False}}

    def get_product_count(self, obj):
        return obj.products.filter(is_active=True).count()


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    pricing_mode_display = serializers.CharField(source="get_pricing_mode_display", read_only=True)
    available_stock = serializers.IntegerField(read_only=True)
    units_out = serializers.IntegerField(read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "sku", "category", "category_name", "kind", "kind_display",
            "pricing_mode", "pricing_mode_display", "price", "description", "image",
            "track_stock", "stock_quantity", "low_stock_threshold", "available_stock",
            "units_out", "is_low_stock", "sort_order", "is_active", "created_at",
        ]

    def validate(self, attrs):
        instance = Product(**{**self._existing(), **attrs})
        instance.pk = self.instance.pk if self.instance else None
        try:
            instance.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or exc.messages)
        return attrs

    def _existing(self):
        if not self.instance:
            return {}
        return {
            f.name: getattr(self.instance, f.name)
            for f in Product._meta.fields
            if f.name != "id"
        }


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            "id", "product", "product_name", "change", "reason", "reason_display",
            "note", "resulting_stock", "created_at",
        ]
        read_only_fields = ["resulting_stock"]


class BillItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    is_out = serializers.BooleanField(read_only=True)

    class Meta:
        model = BillItem
        fields = [
            "id", "booking", "sale", "product", "product_name", "name", "unit_price",
            "pricing_mode", "kind", "quantity", "hours", "line_total", "returned_at",
            "is_out", "staff_notes", "created_at",
        ]
        read_only_fields = ["name", "unit_price", "pricing_mode", "kind", "line_total"]

    def validate(self, attrs):
        booking = attrs.get("booking", getattr(self.instance, "booking", None))
        sale = attrs.get("sale", getattr(self.instance, "sale", None))
        if bool(booking) == bool(sale):
            raise serializers.ValidationError(
                "Attach the item to exactly one booking or one counter sale."
            )

        item = BillItem(
            booking=booking,
            sale=sale,
            product=attrs.get("product", getattr(self.instance, "product", None)),
            quantity=attrs.get("quantity", getattr(self.instance, "quantity", 1)),
            hours=attrs.get("hours", getattr(self.instance, "hours", Decimal("1.00"))),
        )
        item.pk = self.instance.pk if self.instance else None
        try:
            item.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or exc.messages)
        return attrs


class CounterSaleSerializer(serializers.ModelSerializer):
    items = BillItemSerializer(many=True, read_only=True)
    items_total = serializers.DecimalField(max_digits=9, decimal_places=2, read_only=True)

    class Meta:
        model = CounterSale
        fields = [
            "id", "code", "customer", "full_name", "phone", "payment_status",
            "payment_method", "amount_collected", "completed_at", "staff_notes",
            "items", "items_total", "created_at",
        ]
        read_only_fields = ["code", "items_total"]


class CounterSaleCreateSerializer(serializers.Serializer):
    """Ring up a walk-in in one call: lines in, a settled sale out."""

    full_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=20)
    payment_method = serializers.ChoiceField(choices=CounterSale.PaymentMethod.choices)
    staff_notes = serializers.CharField(required=False, allow_blank=True)
    items = serializers.ListField(
        child=serializers.DictField(), allow_empty=False,
        help_text="[{'product': id, 'quantity': n}, ...]",
    )

    def validate_items(self, rows):
        cleaned = []
        for row in rows:
            try:
                product = Product.objects.get(pk=row.get("product"), is_active=True)
            except (Product.DoesNotExist, ValueError, TypeError):
                raise serializers.ValidationError(f"Unknown product: {row.get('product')!r}")
            quantity = int(row.get("quantity") or 1)
            if quantity < 1:
                raise serializers.ValidationError(f"{product.name}: quantity must be at least 1.")
            available = product.available_stock
            if available is not None and quantity > available:
                raise serializers.ValidationError(
                    f"Only {max(available, 0)} x {product.name} left."
                )
            cleaned.append({"product": product, "quantity": quantity})
        return cleaned
