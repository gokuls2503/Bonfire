"""Read-only + submit-only endpoints for bonfiregaminghub.com. No auth."""
from datetime import datetime, time, timedelta

from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.bookings.models import Booking, BusinessHours, Closure
from apps.bookings.serializers import PublicBookingCreateSerializer
from apps.catalog.models import Game, PricingPlan, StationType
from apps.catalog.serializers import GameSerializer, StationTypeSerializer
from apps.content.models import FAQ, GalleryImage, SiteSettings, Testimonial
from apps.content.serializers import (
    FAQSerializer, GalleryImageSerializer, PublicContactMessageSerializer,
    SiteSettingsSerializer, TestimonialSerializer,
)
from apps.tournaments.models import Tournament
from apps.tournaments.serializers import (
    PublicRegistrationCreateSerializer, TournamentSerializer,
)


@api_view(["GET"])
@permission_classes([AllowAny])
def site_bootstrap(request):
    """Everything the public site needs to paint its first frame, in one call."""
    settings_obj = SiteSettings.load()
    station_types = (
        StationType.objects.filter(is_active=True)
        .prefetch_related("stations", "pricing_plans")
    )
    hours = BusinessHours.objects.all()
    return Response(
        {
            "settings": SiteSettingsSerializer(settings_obj, context={"request": request}).data,
            "station_types": StationTypeSerializer(
                station_types, many=True, context={"request": request}
            ).data,
            "business_hours": [
                {
                    "weekday": h.weekday,
                    "weekday_display": h.get_weekday_display(),
                    "opens_at": h.opens_at,
                    "closes_at": h.closes_at,
                    "is_closed": h.is_closed,
                }
                for h in hours
            ],
            "gallery": GalleryImageSerializer(
                GalleryImage.objects.filter(is_active=True), many=True,
                context={"request": request},
            ).data,
            "testimonials": TestimonialSerializer(
                Testimonial.objects.filter(is_active=True), many=True,
                context={"request": request},
            ).data,
            "faqs": FAQSerializer(FAQ.objects.filter(is_active=True), many=True).data,
            "featured_games": GameSerializer(
                Game.objects.filter(is_active=True).prefetch_related("platforms")[:24],
                many=True, context={"request": request},
            ).data,
            "upcoming_tournaments": TournamentSerializer(
                Tournament.objects.filter(
                    status__in=["open", "full", "live"], starts_at__gte=timezone.now() - timedelta(hours=6)
                ).order_by("starts_at")[:6],
                many=True, context={"request": request},
            ).data,
            "is_open_now": _is_open_now(),
        }
    )


def _is_open_now():
    now = timezone.localtime()
    closure = Closure.objects.filter(date=now.date()).first()
    if closure and closure.is_full_day:
        return False
    hours = BusinessHours.objects.filter(weekday=now.weekday()).first()
    if not hours or hours.is_closed:
        return False
    opens = closure.opens_at if closure and closure.opens_at else hours.opens_at
    closes = closure.closes_at if closure and closure.closes_at else hours.closes_at
    if closes <= opens:  # past-midnight close, e.g. 10:00 -> 02:00
        return now.time() >= opens or now.time() <= closes
    return opens <= now.time() <= closes


class PublicTournamentList(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = TournamentSerializer
    pagination_class = None

    def get_queryset(self):
        qs = Tournament.objects.exclude(status="draft").select_related("platform")
        scope = self.request.query_params.get("scope", "upcoming")
        if scope == "past":
            return qs.filter(status__in=["completed", "cancelled"]).order_by("-starts_at")[:20]
        if scope == "all":
            return qs.order_by("-starts_at")[:50]
        return qs.filter(status__in=["open", "full", "live"]).order_by("starts_at")


class PublicTournamentDetail(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = TournamentSerializer
    lookup_field = "slug"
    queryset = Tournament.objects.exclude(status="draft").select_related("platform")


@api_view(["GET"])
@permission_classes([AllowAny])
def availability(request):
    """Free capacity per station type, slot by slot, for one date.

    GET /api/public/availability/?date=2026-09-05&station_type=1
    """
    date_str = request.query_params.get("date")
    try:
        day = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else timezone.localdate()
    except ValueError:
        return Response({"detail": "date must be YYYY-MM-DD."}, status=400)

    site = SiteSettings.load()
    horizon = timezone.localdate() + timedelta(days=site.booking_horizon_days)
    if day < timezone.localdate() or day > horizon:
        return Response({"date": str(day), "is_open": False, "slots": [],
                         "reason": "Outside the booking window."})

    closure = Closure.objects.filter(date=day).first()
    hours = BusinessHours.objects.filter(weekday=day.weekday()).first()
    if (closure and closure.is_full_day) or not hours or hours.is_closed:
        return Response({"date": str(day), "is_open": False, "slots": [],
                         "reason": (closure.reason if closure else "Closed this day.")})

    opens = closure.opens_at if closure and closure.opens_at else hours.opens_at
    closes = closure.closes_at if closure and closure.closes_at else hours.closes_at

    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(day, opens), tz)
    end_dt = timezone.make_aware(datetime.combine(day, closes), tz)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)

    type_qs = StationType.objects.filter(is_active=True).prefetch_related("stations")
    requested_type = request.query_params.get("station_type")
    if requested_type:
        type_qs = type_qs.filter(pk=requested_type)

    duration = int(request.query_params.get("duration") or 60)
    step = timedelta(minutes=30)
    lead_cutoff = timezone.now() + timedelta(minutes=site.booking_lead_minutes)

    bookings = list(
        Booking.objects.filter(
            status__in=Booking.BLOCKING_STATUSES,
            start_at__lt=end_dt,
            start_at__gte=start_dt - timedelta(hours=12),
        ).only("station_type_id", "start_at", "duration_minutes", "seats")
    )

    payload = []
    for st in type_qs:
        capacity = st.stations.filter(is_active=True, is_bookable=True).count()
        slots = []
        cursor = start_dt
        while cursor + timedelta(minutes=duration) <= end_dt:
            slot_end = cursor + timedelta(minutes=duration)
            taken = sum(
                b.seats for b in bookings
                if b.station_type_id == st.id
                and b.start_at < slot_end
                and b.start_at + timedelta(minutes=b.duration_minutes) > cursor
            )
            slots.append({
                "start": cursor.isoformat(),
                "label": timezone.localtime(cursor).strftime("%I:%M %p").lstrip("0"),
                "free": max(capacity - taken, 0),
                "capacity": capacity,
                "bookable": cursor >= lead_cutoff and capacity - taken > 0,
            })
            cursor += step
        payload.append({
            "station_type_id": st.id,
            "station_type": st.name,
            "slug": st.slug,
            "capacity": capacity,
            "slots": slots,
        })

    return Response({
        "date": str(day),
        "is_open": True,
        "opens_at": opens,
        "closes_at": closes,
        "duration_minutes": duration,
        "station_types": payload,
    })


class PublicBookingCreate(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicBookingCreateSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_write"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = serializer.save(source=Booking.Source.WEBSITE, status=Booking.Status.PENDING)
        return Response(
            {
                "code": booking.code,
                "status": booking.status,
                "start_at": booking.start_at,
                "end_at": booking.end_at,
                "station_type": booking.station_type.name,
                "seats": booking.seats,
                "amount_due": booking.amount_due,
                "message": SiteSettings.load().booking_note,
            },
            status=status.HTTP_201_CREATED,
        )


@api_view(["GET"])
@permission_classes([AllowAny])
def booking_lookup(request, code):
    """Let a customer check their own booking with the code they were given."""
    booking = Booking.objects.filter(code__iexact=code).select_related("station_type").first()
    if not booking:
        return Response({"detail": "No booking with that code."}, status=404)
    return Response({
        "code": booking.code,
        "full_name": booking.full_name,
        "status": booking.status,
        "status_display": booking.get_status_display(),
        "station_type": booking.station_type.name,
        "station": booking.station.name if booking.station else None,
        "start_at": booking.start_at,
        "end_at": booking.end_at,
        "seats": booking.seats,
        "amount_due": booking.amount_due,
        "payment_status": booking.payment_status,
    })


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def cancel_booking(request, code):
    booking = Booking.objects.filter(code__iexact=code).first()
    phone = (request.data.get("phone") or "").strip()
    if not booking or booking.phone != phone:
        return Response({"detail": "Booking code and phone number do not match."}, status=404)
    if booking.status in ("completed", "cancelled", "no_show"):
        return Response({"detail": f"This booking is already {booking.get_status_display().lower()}."},
                        status=400)
    booking.status = Booking.Status.CANCELLED
    booking.save(update_fields=["status", "updated_at"])
    return Response({"code": booking.code, "status": booking.status})


cancel_booking.throttle_scope = "public_write"


class PublicRegistrationCreate(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicRegistrationCreateSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_write"


class PublicContactCreate(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicContactMessageSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_write"
