"""Daily sales reporting, split by payment method.

Revenue is recognised when the money changed hands (`completed_at`), falling
back to `start_at` for rows completed before that field was recorded. Booking
revenue and tournament entry fees are reported separately and combined.
"""
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.bookings.models import Booking
from apps.shop.models import BillItem, CounterSale, Payment
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


def _paid_counter_sales(begin, finish):
    """Walk-in shop sales with no station booked."""
    return (
        CounterSale.objects.filter(payment_status="paid")
        .annotate(settled=Coalesce("completed_at", "created_at"))
        .filter(settled__gte=begin, settled__lt=finish)
    )


def _tender_rows(bookings, counter_sales):
    """Every tender in range as (day, method, amount).

    Payment rows are the detail — a split booking contributes its cash half to
    cash and its UPI half to online. A settled bill with no payment rows falls
    back to its own summary method: that happens for anything marked paid
    through /django-admin/, and dropping those would quietly lose real takings.

    The day comes from the *bill*, not the payment, so the daily series always
    adds up to the same total as the headline figure.
    """
    rows = []
    by_booking = defaultdict(list)
    by_sale = defaultdict(list)

    payments = Payment.objects.filter(
        Q(booking__in=bookings) | Q(sale__in=counter_sales)
    )
    for payment in payments:
        if payment.booking_id:
            by_booking[payment.booking_id].append(payment)
        else:
            by_sale[payment.sale_id].append(payment)

    def _collect(bills, bucket):
        for bill in bills:
            day = timezone.localtime(bill.settled).date()
            tendered = bucket.get(bill.id)
            if tendered:
                for payment in tendered:
                    rows.append((day, payment.method, payment.amount))
            elif bill.amount_collected:
                rows.append((day, bill.payment_method or "", bill.amount_collected))

    _collect(bookings, by_booking)
    _collect(counter_sales, by_sale)
    return rows


@api_view(["GET"])
@permission_classes([IsStaffUser])
def sales(request):
    """GET /api/admin/sales/?preset=7d  (or ?from=&to=)"""
    start, end = _parse_range(request.query_params)
    begin, finish = _bounds(start, end)
    days = (end - start).days + 1

    bookings = _settled_bookings(begin, finish)
    registrations = _paid_registrations(begin, finish)
    counter_sales = _paid_counter_sales(begin, finish)

    booking_total = bookings.aggregate(t=_money(Sum("amount_collected")))["t"]
    entry_total = registrations.aggregate(t=_money(Sum("amount_paid")))["t"]
    counter_total = counter_sales.aggregate(t=_money(Sum("amount_collected")))["t"]
    sessions = bookings.count()

    # ---- split by method, from the individual tenders ----
    tenders = _tender_rows(bookings, counter_sales)
    per_method = {key: {"amount": Decimal("0"), "count": 0} for key in METHOD_LABELS}

    def _bucket(method):
        """Never let an unexpected method take the whole report down.

        "split" is a summary label rather than a tender, so it only reaches here
        when a bill's payment detail is missing — after a down-migration, say.
        Counting it as unrecorded is honest, and the report still renders.
        """
        return per_method[method if method in per_method else ""]

    for _, method, amount in tenders:
        bucket = _bucket(method)
        bucket["amount"] += amount
        bucket["count"] += 1
    # Entry fees are a single small tender and stay on their own field.
    for row in registrations.values("payment_method").annotate(
        amount=_money(Sum("amount_paid")), count=Count("id")
    ):
        bucket = _bucket(row["payment_method"])
        bucket["amount"] += row["amount"]
        bucket["count"] += row["count"]

    grand_total = booking_total + entry_total + counter_total
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
    tender_days = defaultdict(lambda: {"cash": Decimal("0"), "online": Decimal("0")})
    for day, method, amount in tenders:
        if method == "cash":
            tender_days[day]["cash"] += amount
        elif method in ONLINE_METHODS:
            tender_days[day]["online"] += amount

    booking_days = {
        row["day"]: row
        for row in bookings.annotate(day=TruncDate("settled"))
        .values("day")
        .annotate(revenue=_money(Sum("amount_collected")), sessions=Count("id"))
    }
    counter_days = {
        row["day"]: row
        for row in counter_sales.annotate(day=TruncDate("settled"))
        .values("day")
        .annotate(revenue=_money(Sum("amount_collected")))
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
        c = counter_days.get(cursor)
        parts = [p for p in (b, e, c) if p]
        tendered = tender_days.get(cursor, {"cash": Decimal("0"), "online": Decimal("0")})
        by_day.append({
            "date": str(cursor),
            "label": cursor.strftime("%d %b"),
            "weekday": cursor.strftime("%a"),
            "revenue": float(sum(p["revenue"] for p in parts)),
            # Entry fees keep their own field, so add them to the right bucket.
            "cash": float(tendered["cash"] + (e["cash"] if e else Decimal("0"))),
            "online": float(tendered["online"] + (e["online"] if e else Decimal("0"))),
            "sessions": b["sessions"] if b else 0,
            "entry_fees": float(e["revenue"]) if e else 0.0,
            "counter_sales": float(c["revenue"]) if c else 0.0,
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

    # ---- what sold off the shelf ----
    # Counted from the bill lines themselves, so it covers items on a session
    # bill and standalone counter sales alike. This overlaps the revenue totals
    # above by design: it answers "what moved", not "what came in".
    sold = BillItem.objects.filter(
        Q(booking__in=bookings) | Q(sale__in=counter_sales)
    ).select_related("product", "product__category")

    by_product = [
        {
            "product": row["name"],
            "category": row["product__category__name"],
            "kind": row["kind"],
            "units": row["units"],
            "revenue": float(row["revenue"]),
        }
        for row in sold.values("name", "product__category__name", "kind")
        .annotate(units=Sum("quantity"), revenue=_money(Sum("line_total")))
        .order_by("-revenue")[:25]
    ]
    items_total = sold.aggregate(t=_money(Sum("line_total")))["t"]
    units_sold = sold.aggregate(n=Sum("quantity"))["n"] or 0

    # ---- what was given away ----
    discounts_total = (
        bookings.aggregate(t=_money(Sum("discount_amount")))["t"]
        + counter_sales.aggregate(t=_money(Sum("discount_amount")))["t"]
    )
    discounted = [
        {
            "reference": b.code,
            "customer": b.full_name,
            "amount": float(b.discount_amount),
            "reason": b.discount_reason,
            "settled_at": b.settled_at,
        }
        for b in bookings.filter(discount_amount__gt=0).order_by("-settled")[:25]
    ] + [
        {
            "reference": s.code,
            "customer": s.full_name or "Walk-in",
            "amount": float(s.discount_amount),
            "reason": s.discount_reason,
            "settled_at": s.settled_at,
        }
        for s in counter_sales.filter(discount_amount__gt=0).order_by("-settled")[:25]
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
            "counter_sales_revenue": float(counter_total),
            "items_total": float(items_total),
            "units_sold": units_sold,
            "discounts": float(discounts_total),
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
        "by_product": by_product,
        "discounts_given": sorted(discounted, key=lambda d: d["settled_at"], reverse=True),
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
    for b in bookings.prefetch_related("items"):
        detail = f"{b.station_type.name}" + (f" x {b.seats}" if b.seats > 1 else "")
        item_count = sum(i.quantity for i in b.items.all())
        if item_count:
            detail += f" + {item_count} item{'s' if item_count > 1 else ''}"
        rows.append({
            "kind": "booking",
            "id": b.id,
            "reference": b.code,
            "settled_at": b.settled_at,
            "customer": b.full_name,
            "phone": b.phone,
            "detail": detail,
            "amount": float(b.amount_collected),
            "method": b.payment_method or "",
            "method_label": METHOD_LABELS.get(b.payment_method or "", "Unrecorded"),
        })

    counter_sales = _paid_counter_sales(begin, finish).prefetch_related("items")
    if method:
        counter_sales = counter_sales.filter(payment_method=method)
    for s in counter_sales:
        names = ", ".join(f"{i.quantity}x {i.name}" for i in s.items.all()[:3])
        rows.append({
            "kind": "counter_sale",
            "id": s.id,
            "reference": s.code,
            "settled_at": s.settled_at,
            "customer": s.full_name or "Walk-in",
            "phone": s.phone,
            "detail": names or "Counter sale",
            "amount": float(s.amount_collected),
            "method": s.payment_method or "",
            "method_label": METHOD_LABELS.get(s.payment_method or "", "Unrecorded"),
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
