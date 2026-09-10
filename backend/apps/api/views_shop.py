"""Staff endpoints for the shop: products, stock, bill lines and counter sales."""
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.shop.models import BillItem, CounterSale, Product, ProductCategory, StockMovement
from apps.shop.serializers import (
    BillItemSerializer, CounterSaleCreateSerializer, CounterSaleSerializer,
    ProductCategorySerializer, ProductSerializer, StockMovementSerializer,
)

from .permissions import IsStaffUser


class ShopViewSet(ModelViewSet):
    permission_classes = [IsStaffUser]
    parser_classes = [JSONParser, MultiPartParser, FormParser]


class ProductCategoryViewSet(ShopViewSet):
    queryset = ProductCategory.objects.prefetch_related("products")
    serializer_class = ProductCategorySerializer
    filterset_fields = ["is_active"]
    pagination_class = None


class ProductViewSet(ShopViewSet):
    queryset = Product.objects.select_related("category").prefetch_related("bill_items")
    serializer_class = ProductSerializer
    filterset_fields = ["category", "kind", "is_active", "track_stock"]
    search_fields = ["name", "sku", "description"]
    ordering_fields = ["name", "price", "stock_quantity", "sort_order"]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("low_stock") == "1":
            ids = [p.id for p in qs if p.track_stock and p.is_low_stock]
            qs = qs.filter(id__in=ids)
        return qs

    @action(detail=True, methods=["post"])
    def adjust_stock(self, request, pk=None):
        """Restock, correct a miscount, or write off damage — with an audit line."""
        product = self.get_object()
        try:
            change = int(request.data.get("change"))
        except (TypeError, ValueError):
            return Response({"change": "Enter a whole number, e.g. 24 or -3."}, status=400)
        if change == 0:
            return Response({"change": "Enter a non-zero change."}, status=400)

        reason = request.data.get("reason", StockMovement.Reason.RESTOCK)
        if reason not in dict(StockMovement.Reason.choices):
            return Response({"reason": "Unknown reason."}, status=400)

        with transaction.atomic():
            Product.objects.filter(pk=product.pk).update(
                stock_quantity=F("stock_quantity") + change
            )
            product.refresh_from_db(fields=["stock_quantity"])
            StockMovement.objects.create(
                product=product, change=change, reason=reason,
                note=request.data.get("note", ""),
                resulting_stock=product.stock_quantity,
            )
        return Response(ProductSerializer(product, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def movements(self, request, pk=None):
        qs = self.get_object().movements.all()[:50]
        return Response(StockMovementSerializer(qs, many=True).data)


class BillItemViewSet(ShopViewSet):
    queryset = BillItem.objects.select_related("product", "booking", "sale")
    serializer_class = BillItemSerializer
    filterset_fields = ["booking", "sale", "product", "kind"]
    pagination_class = None

    @action(detail=True, methods=["post"])
    def mark_returned(self, request, pk=None):
        """Hand a rental back early, without closing the whole bill."""
        item = self.get_object()
        if not item.is_out:
            return Response({"detail": "This item is not out."}, status=400)
        item.mark_returned()
        return Response(BillItemSerializer(item).data)


class CounterSaleViewSet(ShopViewSet):
    queryset = CounterSale.objects.prefetch_related("items__product").select_related("customer")
    serializer_class = CounterSaleSerializer
    filterset_fields = ["payment_status", "payment_method"]
    search_fields = ["code", "full_name", "phone"]
    ordering_fields = ["created_at", "amount_collected"]


@api_view(["POST"])
@permission_classes([IsStaffUser])
def quick_sale(request):
    """Ring up a walk-in in one call.

    Creates the sale, its lines and the stock movements together, so a failure
    part-way through cannot leave stock decremented against a sale that does
    not exist.
    """
    serializer = CounterSaleCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    with transaction.atomic():
        sale = CounterSale.objects.create(
            full_name=data.get("full_name", ""),
            phone=data.get("phone", ""),
            staff_notes=data.get("staff_notes", ""),
            payment_status=CounterSale.PaymentStatus.PAID,
            payment_method=data["payment_method"],
            completed_at=timezone.now(),
        )
        total = Decimal("0.00")
        for row in data["items"]:
            item = BillItem.objects.create(
                sale=sale, product=row["product"], quantity=row["quantity"]
            )
            total += item.line_total
        sale.amount_collected = total
        sale.save(update_fields=["amount_collected", "updated_at"])

    return Response(
        CounterSaleSerializer(sale, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsStaffUser])
def shop_summary(request):
    """What the counter screen needs to open: the menu, plus anything running low."""
    products = Product.objects.filter(is_active=True).select_related("category")
    categories = ProductCategory.objects.filter(is_active=True)

    low = [p for p in products if p.track_stock and p.is_low_stock]
    out_now = [p for p in products if p.kind == Product.Kind.RENTAL and p.units_out]

    return Response({
        "categories": ProductCategorySerializer(categories, many=True).data,
        "products": ProductSerializer(products, many=True, context={"request": request}).data,
        "low_stock": ProductSerializer(low, many=True, context={"request": request}).data,
        "rentals_out": [
            {"id": p.id, "name": p.name, "out": p.units_out, "owned": p.stock_quantity}
            for p in out_now
        ],
    })
