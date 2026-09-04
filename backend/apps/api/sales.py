"""Daily sales reporting, split by payment method.

Revenue is recognised when the money changed hands (`completed_at`), falling
back to `start_at` for rows completed before that field was recorded. Booking
revenue and tournament entry fees are reported separately and combined.
"""
from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.bookings.models import Booking
from apps.tournaments.models import TournamentRegistration

from .permissions import IsStaffUser

ONLINE_METHODS = ["upi", "card", "other"]
METHOD_LABELS = {"cash": "Cash", "upi": "UPI", "card": "Card", "other": "Other", "": "Unrecorded"}

MONEY = DecimalField(max_digits=12, decimal_places=2)


def _zero():
    return Value(Decimal("0"), output_field=MONEY)


def _money(expr):
    return Coalesce(expr, _zero(), output_field=MONEY)


def _parse_range(params):
    """Resolve ?preset= or ?from=&to= into a pair of local dates."""
    today = timezone.localdate()
    preset = params.get("preset")

    if preset == "today":
        return today, today
    if preset == "yesterday":
        return today - timedelta(days=1), today - timedelta(days=1)
    if preset == "7d":
        return today - timedelta(days=6), today
    if preset == "30d":
        return today - timedelta(days=29), today
    if preset == "month":
        return today.replace(day=1), today
    if preset == "last_month":
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        return last_prev.replace(day=1), last_prev

    def _date(key, fallback):
        raw = params.get(key)
        if not raw:
            return fallback
        try:
            return datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError:
            return fallback

    start = _date("from", today - timedelta(days=6))
    end = _date("to", today)
    if end < start:
        start, end = end, start
    return start, end


def _bounds(start, end):
    """Local dates -> aware datetimes covering the whole range."""
    tz = timezone.get_current_timezone()
    begin = timezone.make_aware(datetime.combine(start, datetime.min.time()), tz)
    finish = timezone.make_aware(
        datetime.combine(end + timedelta(days=1), datetime.min.time()), tz
    )
    return begin, finish


def _settled_bookings(begin, finish):
    """Completed bookings annotated with the moment the money was taken."""
    return (
        Booking.objects.filter(status=Booking.Status.COMPLETED)
        .annotate(settled=Coalesce("completed_at", "start_at"))
        .filter(settled__gte=begin, settled__lt=finish)
    )


def _paid_registrations(begin, finish):
    return (
        TournamentRegistration.objects.filter(payment_status="paid")
        .annotate(settled=Coalesce("paid_at", "updated_at"))
        .filter(settled__gte=begin, settled__lt=finish)
        .select_related("tournament")
    )


@api_view(["GET"])
@permission_classes([IsStaffUser])
def sales(request):
    """GET /api/admin/sales/?preset=7d  (or ?from=&to=)"""
    start, end = _parse_range(request.query_params)
    begin, finish = _bounds(start, end)
    days = (end - start).days + 1

    bookings = _settled_bookings(begin, finish)
    registrations = _paid_registrations(begin, finish)

    booking_total = bookings.aggregate(t=_money(Sum("amount_collected")))["t"]
    entry_total = registrations.aggregate(t=_money(Sum("amount_paid")))["t"]
    sessions = bookings.count()

    # ---- split by method, bookings and entry fees combined ----
    per_method = {key: {"amount": Decimal("0"), "count": 0} for key in METHOD_LABELS}
    for row in bookings.values("payment_method").annotate(
        amount=_money(Sum("amount_collected")), count=Count("id")
    ):
        bucket = per_method[row["payment_method"] or ""]
        bucket["amount"] += row["amount"]
        bucket["count"] += row["count"]
    for row in registrations.values("payment_method").annotate(
        amount=_money(Sum("amount_paid")), count=Count("id")
    ):
        bucket = per_method[row["payment_method"] or ""]
        bucket["amount"] += row["amount"]
        bucket["count"] += row["count"]

    grand_total = booking_total + entry_total
    cash_total = per_method["cash"]["amount"]
    online_total = sum(per_method[m]["amount"] for m in ONLINE_METHODS)
    unrecorded_total = per_method[""]["amount"]

    by_method = [
        {
            "method": key or "unrecorded",
            "label": label,
            "amount": float(per_method[key]["amount"]),
            "count": per_method[key]["count"],
            "share": round(float(per_method[key]["amount"]) / float(grand_total) * 100, 1)
            if grand_total else 0.0,
            "is_online": key in ONLINE_METHODS,
        }
        for key, label in METHOD_LABELS.items()
        if per_method[key]["count"] or key in ("cash", "upi")
    ]

    # ---- day by day ----
    booking_days = {
        row["day"]: row
        for row in bookings.annotate(day=TruncDate("settled"))
        .values("day")
        .annotate(
            revenue=_money(Sum("amount_collected")),
            cash=_money(Sum("amount_collected", filter=Q(payment_method="cash"))),
            online=_money(Sum("amount_collected", filter=Q(payment_method__in=ONLINE_METHODS))),
            sessions=Count("id"),
        )
    }
    entry_days = {
        row["day"]: row
        for row in registrations.annotate(day=TruncDate("settled"))
        .values("day")
        .annotate(
            revenue=_money(Sum("amount_paid")),
            cash=_money(Sum("amount_paid", filter=Q(payment_method="cash"))),
            online=_money(Sum("amount_paid", filter=Q(payment_method__in=ONLINE_METHODS))),
        )
    }

    by_day = []
    cursor = start
    while cursor <= end:
        b = booking_days.get(cursor)
        e = entry_days.get(cursor)
        revenue = (b["revenue"] if b else Decimal("0")) + (e["revenue"] if e else Decimal("0"))
        by_day.append({
            "date": str(cursor),
            "label": cursor.strftime("%d %b"),
            "weekday": cursor.strftime("%a"),
            "revenue": float(revenue),
            "cash": float((b["cash"] if b else 0) + (e["cash"] if e else 0)),
            "online": float((b["online"] if b else 0) + (e["online"] if e else 0)),
            "sessions": b["sessions"] if b else 0,
            "entry_fees": float(e["revenue"]) if e else 0.0,
        })
        cursor += timedelta(days=1)

    # ---- where the money came from ----
    by_station_type = [
        {
            "station_type": row["station_type__name"],
            "revenue": float(row["revenue"]),
            "sessions": row["sessions"],
            "hours": round((row["minutes"] or 0) / 60, 1),
        }
        for row in bookings.values("station_type__name").annotate(
            revenue=_money(Sum("amount_collected")),
            sessions=Count("id"),
            minutes=Sum("duration_minutes"),
        ).order_by("-revenue")
    ]

    # ---- money still owed, so the owner can chase it ----
    outstanding_qs = (
        Booking.objects.filter(
            status__in=["completed", "checked_in"],
            payment_status="unpaid",
            start_at__gte=begin - timedelta(days=60),
        ).select_related("station_type").order_by("-start_at")[:25]
    )
    outstanding_total = Booking.objects.filter(
        status__in=["completed", "checked_in"], payment_status="unpaid"
    ).aggregate(t=_money(Sum("amount_due")))["t"]

    busiest = max(by_day, key=lambda d: d["revenue"]) if by_day else None

    return Response({
        "range": {
            "from": str(start), "to": str(end), "days": days,
            "preset": request.query_params.get("preset", "custom"),
        },
        "totals": {
            "revenue": float(grand_total),
            "bookings_revenue": float(booking_total),
            "entry_fees_revenue": float(entry_total),
            "cash": float(cash_total),
            "online": float(online_total),
            "unrecorded": float(unrecorded_total),
            "cash_share": round(float(cash_total) / float(grand_total) * 100, 1) if grand_total else 0.0,
            "online_share": round(float(online_total) / float(grand_total) * 100, 1) if grand_total else 0.0,
            "sessions": sessions,
            "avg_per_session": round(float(booking_total) / sessions, 2) if sessions else 0.0,
            "avg_per_day": round(float(grand_total) / days, 2) if days else 0.0,
            "outstanding": float(outstanding_total),
        },
        "by_method": by_method,
        "by_day": by_day,
        "by_station_type": by_station_type,
        "busiest_day": busiest,
        "outstanding_bookings": [
            {
                "id": b.id, "code": b.code, "full_name": b.full_name, "phone": b.phone,
                "start_at": b.start_at, "station_type": b.station_type.name,
                "amount_due": float(b.amount_due), "status": b.status,
            }
            for b in outstanding_qs
        ],
    })


@api_view(["GET"])
@permission_classes([IsStaffUser])
def sales_transactions(request):
    """Every settled line in the range, for reconciling the till."""
    start, end = _parse_range(request.query_params)
    begin, finish = _bounds(start, end)
    method = request.query_params.get("method")

    rows = []
    bookings = _settled_bookings(begin, finish).select_related("station_type")
    if method:
        bookings = bookings.filter(payment_method=method)
    for b in bookings:
        rows.append({
            "kind": "booking",
            "id": b.id,
            "reference": b.code,
            "settled_at": b.settled_at,
            "customer": b.full_name,
            "phone": b.phone,
            "detail": f"{b.station_type.name}" + (f" x {b.seats}" if b.seats > 1 else ""),
            "amount": float(b.amount_collected),
            "method": b.payment_method or "",
            "method_label": METHOD_LABELS.get(b.payment_method or "", "Unrecorded"),
        })

    registrations = _paid_registrations(begin, finish)
    if method:
        registrations = registrations.filter(payment_method=method)
    for r in registrations:
        rows.append({
            "kind": "entry_fee",
            "id": r.id,
            "reference": f"T{r.id}",
            "settled_at": r.paid_at or r.updated_at,
            "customer": r.captain_name,
            "phone": r.phone,
            "detail": f"{r.tournament.title} — {r.team_name}",
            "amount": float(r.amount_paid),
            "method": r.payment_method or "",
            "method_label": METHOD_LABELS.get(r.payment_method or "", "Unrecorded"),
        })

    rows.sort(key=lambda r: r["settled_at"], reverse=True)
    return Response({
        "range": {"from": str(start), "to": str(end)},
        "count": len(rows),
        "total": round(sum(r["amount"] for r in rows), 2),
        "transactions": rows,
    })
