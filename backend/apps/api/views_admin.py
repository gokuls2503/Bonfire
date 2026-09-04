"""admin.bonfiregaminghub.com API. Everything here requires a staff JWT."""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.models import Booking, BusinessHours, Closure
from apps.bookings.serializers import (
    BookingSerializer, BusinessHoursSerializer, ClosureSerializer,
)
from apps.catalog.models import Game, PricingPlan, Station, StationType
from apps.catalog.serializers import (
    GameSerializer, PricingPlanSerializer, StationSerializer,
    StationTypeSerializer, StationTypeWriteSerializer,
)
from apps.content.models import ContactMessage, FAQ, GalleryImage, SiteSettings, Testimonial
from apps.content.serializers import (
    ContactMessageSerializer, FAQSerializer, GalleryImageSerializer,
    SiteSettingsSerializer, TestimonialSerializer,
)
from apps.customers.models import Customer
from apps.customers.serializers import CustomerSerializer
from apps.tournaments.models import Tournament, TournamentRegistration
from apps.tournaments.serializers import (
    TournamentRegistrationSerializer, TournamentSerializer,
)

from .permissions import IsStaffUser


class StaffViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaffUser]
    parser_classes = [JSONParser, MultiPartParser, FormParser]


class StationTypeViewSet(StaffViewSet):
    queryset = StationType.objects.prefetch_related("stations", "pricing_plans")
    filterset_fields = ["is_active"]
    search_fields = ["name", "description"]
    pagination_class = None

    def get_serializer_class(self):
        if self.action in ("list", "retrieve"):
            return StationTypeSerializer
        return StationTypeWriteSerializer


class StationViewSet(StaffViewSet):
    queryset = Station.objects.select_related("station_type")
    serializer_class = StationSerializer
    filterset_fields = ["station_type", "status", "is_active", "is_bookable"]
    search_fields = ["name", "specs"]
    pagination_class = None

    @action(detail=True, methods=["post"])
    def set_status(self, request, pk=None):
        station = self.get_object()
        new_status = request.data.get("status")
        if new_status not in dict(Station.Status.choices):
            return Response({"detail": "Unknown status."}, status=400)
        station.status = new_status
        station.status_note = request.data.get("status_note", "")
        station.save(update_fields=["status", "status_note", "updated_at"])
        return Response(StationSerializer(station).data)


class PricingPlanViewSet(StaffViewSet):
    queryset = PricingPlan.objects.select_related("station_type")
    serializer_class = PricingPlanSerializer
    filterset_fields = ["station_type", "is_active"]
    pagination_class = None


class GameViewSet(StaffViewSet):
    queryset = Game.objects.prefetch_related("platforms")
    serializer_class = GameSerializer
    filterset_fields = ["is_active", "is_featured", "platforms"]
    search_fields = ["title", "genre"]
    pagination_class = None


class CustomerViewSet(StaffViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    filterset_fields = ["tier", "marketing_opt_in"]
    search_fields = ["code", "full_name", "phone", "email", "gamer_tag"]

    @action(detail=True, methods=["get"])
    def bookings(self, request, pk=None):
        customer = self.get_object()
        qs = customer.bookings.select_related("station_type", "station")[:50]
        return Response(BookingSerializer(qs, many=True).data)


class BookingViewSet(StaffViewSet):
    queryset = Booking.objects.select_related("station_type", "station", "customer", "pricing_plan")
    serializer_class = BookingSerializer
    filterset_fields = ["status", "payment_status", "station_type", "station", "source"]
    search_fields = ["code", "customer__code", "full_name", "phone", "email"]
    ordering_fields = ["start_at", "created_at", "amount_due"]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get("date"):
            tz = timezone.get_current_timezone()
            qs = qs.filter(start_at__date=params["date"])
        if params.get("from"):
            qs = qs.filter(start_at__gte=params["from"])
        if params.get("to"):
            qs = qs.filter(start_at__lte=params["to"])
        if params.get("upcoming") == "1":
            qs = qs.filter(start_at__gte=timezone.now() - timedelta(hours=2))
        return qs

    def _transition(self, booking, new_status, **extra):
        booking.status = new_status
        fields = ["status", "updated_at"]
        for key, value in extra.items():
            setattr(booking, key, value)
            fields.append(key)
        booking.save(update_fields=fields)
        return Response(BookingSerializer(booking).data)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        booking = self.get_object()
        station_id = request.data.get("station")
        extra = {}
        if station_id:
            extra["station_id"] = station_id
        return self._transition(booking, Booking.Status.CONFIRMED, **extra)

    @action(detail=True, methods=["post"])
    def check_in(self, request, pk=None):
        booking = self.get_object()
        station_id = request.data.get("station")
        extra = {"checked_in_at": timezone.now()}
        if station_id:
            extra["station_id"] = station_id
            Station.objects.filter(pk=station_id).update(status=Station.Status.OCCUPIED)
        return self._transition(booking, Booking.Status.CHECKED_IN, **extra)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """End the session and record how the money was taken.

        `payment_method` drives the cash/online split in the sales report, so it
        is required unless the session is explicitly waived or left unpaid.
        """
        booking = self.get_object()
        collected = request.data.get("amount_collected", booking.amount_due)
        payment_status = request.data.get("payment_status", Booking.PaymentStatus.PAID)
        method = request.data.get("payment_method", "")

        if payment_status == Booking.PaymentStatus.PAID:
            if method not in dict(Booking.PaymentMethod.choices):
                return Response(
                    {"payment_method": "Choose how the payment was taken: cash, upi, card or other."},
                    status=400,
                )
        else:
            method = ""
            if payment_status == Booking.PaymentStatus.UNPAID:
                collected = 0

        if booking.station_id:
            Station.objects.filter(pk=booking.station_id).update(status=Station.Status.AVAILABLE)

        return self._transition(
            booking,
            Booking.Status.COMPLETED,
            completed_at=timezone.now(),
            amount_collected=Decimal(str(collected)),
            payment_status=payment_status,
            payment_method=method,
        )

    @action(detail=True, methods=["post"])
    def record_payment(self, request, pk=None):
        """Settle an outstanding balance without touching the booking's status."""
        booking = self.get_object()
        method = request.data.get("payment_method", "")
        if method not in dict(Booking.PaymentMethod.choices):
            return Response({"payment_method": "Choose a payment method."}, status=400)
        collected = Decimal(str(request.data.get("amount_collected", booking.amount_due)))
        booking.payment_status = Booking.PaymentStatus.PAID
        booking.payment_method = method
        booking.amount_collected = collected
        if not booking.completed_at:
            booking.completed_at = timezone.now()
        booking.save(update_fields=[
            "payment_status", "payment_method", "amount_collected", "completed_at", "updated_at",
        ])
        return Response(BookingSerializer(booking).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        booking = self.get_object()
        if booking.station_id:
            Station.objects.filter(pk=booking.station_id).update(status=Station.Status.AVAILABLE)
        return self._transition(booking, Booking.Status.CANCELLED)

    @action(detail=True, methods=["post"])
    def no_show(self, request, pk=None):
        return self._transition(self.get_object(), Booking.Status.NO_SHOW)


class TournamentViewSet(StaffViewSet):
    queryset = Tournament.objects.select_related("platform").prefetch_related("registrations")
    serializer_class = TournamentSerializer
    filterset_fields = ["status", "is_featured", "is_recurring_weekly", "platform"]
    search_fields = ["title", "game"]
    ordering_fields = ["starts_at", "created_at"]

    @action(detail=True, methods=["get"])
    def registrations(self, request, pk=None):
        qs = self.get_object().registrations.all()
        return Response(TournamentRegistrationSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """Clone next week's edition of a recurring tournament in one click."""
        original = self.get_object()
        weeks = int(request.data.get("weeks_ahead", 1))
        clone = Tournament.objects.get(pk=original.pk)
        clone.pk = None
        clone.slug = ""
        clone.status = Tournament.Status.DRAFT
        clone.starts_at = original.starts_at + timedelta(weeks=weeks)
        if original.ends_at:
            clone.ends_at = original.ends_at + timedelta(weeks=weeks)
        if original.registration_closes_at:
            clone.registration_closes_at = original.registration_closes_at + timedelta(weeks=weeks)
        clone.save()
        return Response(TournamentSerializer(clone).data, status=status.HTTP_201_CREATED)


class TournamentRegistrationViewSet(StaffViewSet):
    queryset = TournamentRegistration.objects.select_related("tournament", "customer")
    serializer_class = TournamentRegistrationSerializer
    filterset_fields = ["tournament", "status", "payment_status"]
    search_fields = ["team_name", "captain_name", "phone"]

    @action(detail=True, methods=["post"])
    def set_status(self, request, pk=None):
        reg = self.get_object()
        new_status = request.data.get("status")
        if new_status not in dict(TournamentRegistration.Status.choices):
            return Response({"detail": "Unknown status."}, status=400)
        reg.status = new_status

        if "payment_status" in request.data:
            reg.payment_status = request.data["payment_status"]
            if reg.payment_status == "paid":
                method = request.data.get("payment_method", "")
                if method not in dict(TournamentRegistration.PaymentMethod.choices):
                    return Response(
                        {"payment_method": "Choose how the entry fee was taken."}, status=400
                    )
                reg.payment_method = method
                reg.amount_paid = Decimal(
                    str(request.data.get("amount_paid", reg.tournament.entry_fee))
                )
                reg.paid_at = reg.paid_at or timezone.now()
        reg.save()
        return Response(TournamentRegistrationSerializer(reg).data)


class GalleryImageViewSet(StaffViewSet):
    queryset = GalleryImage.objects.all()
    serializer_class = GalleryImageSerializer
    filterset_fields = ["category", "is_active"]
    pagination_class = None


class TestimonialViewSet(StaffViewSet):
    queryset = Testimonial.objects.all()
    serializer_class = TestimonialSerializer
    filterset_fields = ["is_active"]
    pagination_class = None


class FAQViewSet(StaffViewSet):
    queryset = FAQ.objects.all()
    serializer_class = FAQSerializer
    filterset_fields = ["is_active"]
    pagination_class = None


class BusinessHoursViewSet(StaffViewSet):
    queryset = BusinessHours.objects.all()
    serializer_class = BusinessHoursSerializer
    pagination_class = None


class ClosureViewSet(StaffViewSet):
    queryset = Closure.objects.all()
    serializer_class = ClosureSerializer
    pagination_class = None


class ContactMessageViewSet(StaffViewSet):
    queryset = ContactMessage.objects.all()
    serializer_class = ContactMessageSerializer
    filterset_fields = ["topic", "is_read", "is_archived"]
    search_fields = ["name", "phone", "email", "message"]
    http_method_names = ["get", "patch", "delete", "head", "options"]


class SiteSettingsView(APIView):
    """Singleton — GET to read, PATCH to edit. Supports multipart for logo/hero uploads."""

    permission_classes = [IsStaffUser]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        return Response(SiteSettingsSerializer(SiteSettings.load(), context={"request": request}).data)

    def patch(self, request):
        serializer = SiteSettingsSerializer(
            SiteSettings.load(), data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsStaffUser])
def dashboard(request):
    """The one screen a cafe owner looks at every morning."""
    now = timezone.now()
    today = timezone.localdate()
    week_ago = now - timedelta(days=7)
    month_start = today.replace(day=1)

    todays = Booking.objects.filter(start_at__date=today)
    completed_today = todays.filter(status="completed")
    live = Booking.objects.filter(status="checked_in")

    stations = Station.objects.filter(is_active=True).select_related("station_type")
    station_breakdown = [
        {
            "id": s.id, "name": s.name, "type": s.station_type.name, "status": s.status,
            "status_note": s.status_note,
            "current_booking": next(
                (
                    {"code": b.code, "full_name": b.full_name, "end_at": b.end_at}
                    for b in live if b.station_id == s.id
                ),
                None,
            ),
        }
        for s in stations
    ]

    revenue_today = completed_today.aggregate(t=Sum("amount_collected"))["t"] or 0
    cash_today = completed_today.filter(payment_method="cash").aggregate(
        t=Sum("amount_collected"))["t"] or 0
    online_today = completed_today.filter(
        payment_method__in=["upi", "card", "other"]
    ).aggregate(t=Sum("amount_collected"))["t"] or 0
    revenue_month = Booking.objects.filter(
        status="completed", start_at__date__gte=month_start
    ).aggregate(t=Sum("amount_collected"))["t"] or 0

    by_type = list(
        Booking.objects.filter(start_at__gte=week_ago)
        .values("station_type__name")
        .annotate(count=Count("id"))
        .order_by("-count")
    )

    trend = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_qs = Booking.objects.filter(start_at__date=day)
        trend.append({
            "date": str(day),
            "label": day.strftime("%a"),
            "bookings": day_qs.count(),
            "revenue": float(
                day_qs.filter(status="completed").aggregate(t=Sum("amount_collected"))["t"] or 0
            ),
        })

    upcoming_tournament = (
        Tournament.objects.filter(status__in=["open", "full", "live"], starts_at__gte=now)
        .order_by("starts_at").first()
    )

    return Response({
        "today": {
            "date": str(today),
            "bookings": todays.count(),
            "pending": todays.filter(status="pending").count(),
            "confirmed": todays.filter(status="confirmed").count(),
            "checked_in": live.count(),
            "completed": completed_today.count(),
            "no_show": todays.filter(status="no_show").count(),
            "revenue": float(revenue_today),
            "cash": float(cash_today),
            "online": float(online_today),
        },
        "month": {
            "revenue": float(revenue_month),
            "bookings": Booking.objects.filter(start_at__date__gte=month_start).count(),
        },
        "stations": {
            "total": stations.count(),
            "available": stations.filter(status="available").count(),
            "occupied": stations.filter(status="occupied").count(),
            "maintenance": stations.filter(status__in=["maintenance", "offline"]).count(),
            "breakdown": station_breakdown,
        },
        "next_up": BookingSerializer(
            Booking.objects.filter(
                status__in=["pending", "confirmed"], start_at__gte=now - timedelta(minutes=30)
            ).select_related("station_type", "station").order_by("start_at")[:8],
            many=True,
        ).data,
        "live_now": BookingSerializer(
            live.select_related("station_type", "station"), many=True
        ).data,
        "attention": {
            "pending_bookings": Booking.objects.filter(
                status="pending", start_at__gte=now
            ).count(),
            "unread_messages": ContactMessage.objects.filter(
                is_read=False, is_archived=False
            ).count(),
            "pending_registrations": TournamentRegistration.objects.filter(
                status="pending"
            ).count(),
            "stations_down": stations.filter(status__in=["maintenance", "offline"]).count(),
        },
        "customers": {
            "total": Customer.objects.count(),
            "new_this_week": Customer.objects.filter(created_at__gte=week_ago).count(),
            "members": Customer.objects.filter(tier__in=["member", "vip"]).count(),
        },
        "bookings_by_type_7d": by_type,
        "trend_7d": trend,
        "next_tournament": (
            TournamentSerializer(upcoming_tournament, context={"request": request}).data
            if upcoming_tournament else None
        ),
    })


@api_view(["GET"])
@permission_classes([IsStaffUser])
def me(request):
    user = request.user
    return Response({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.get_full_name() or user.username,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
    })
