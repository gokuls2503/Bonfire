"""Monthly memberships — plans the owner edits, and the terms sold against them.

Kept in its own module for the same reason the models are: none of this sits on
the booking or checkout path. A membership is sold, paid for, renewed and left
to lapse on its own.
"""
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from django.core.exceptions import ValidationError as DjangoValidationError

from apps.memberships.models import Membership, MembershipPlan, MembershipUsage
from apps.memberships.serializers import (
    MembershipPlanSerializer, MembershipSerializer, MembershipUsageSerializer,
)

from .permissions import IsStaffUser

TENDER_METHODS = ("cash", "upi", "card", "other")


def _amount(value, fallback):
    if value in (None, ""):
        return None if fallback is None else Decimal(str(fallback))
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        return None


class MembershipPlanViewSet(viewsets.ModelViewSet):
    """The schemes themselves: price, term length, perks, what a member saves."""

    permission_classes = [IsStaffUser]
    queryset = MembershipPlan.objects.prefetch_related("station_types", "memberships")
    serializer_class = MembershipPlanSerializer
    filterset_fields = ["is_active", "is_public"]
    search_fields = ["name", "description"]
    pagination_class = None


class MembershipViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaffUser]
    queryset = Membership.objects.select_related("customer", "plan").prefetch_related("usage")
    serializer_class = MembershipSerializer
    filterset_fields = ["status", "payment_status", "plan", "customer"]
    search_fields = [
        "code", "customer__code", "customer__full_name", "customer__phone",
    ]
    ordering_fields = ["starts_on", "ends_on", "created_at"]

    def get_queryset(self):
        """`?state=` filters on the derived state, which no single column holds."""
        qs = super().get_queryset()
        params = self.request.query_params
        today = timezone.localdate()
        state = params.get("state")

        if state == "active":
            qs = qs.filter(
                status=Membership.Status.ACTIVE,
                payment_status__in=["paid", "waived"],
                starts_on__lte=today,
                ends_on__gte=today,
            )
        elif state == "expiring":
            qs = qs.filter(
                status=Membership.Status.ACTIVE,
                payment_status__in=["paid", "waived"],
                ends_on__gte=today,
                ends_on__lte=today + timedelta(days=7),
            )
        elif state == "expired":
            qs = qs.filter(status=Membership.Status.ACTIVE, ends_on__lt=today)
        elif state == "unpaid":
            qs = qs.filter(payment_status="unpaid")
        elif state == "cancelled":
            qs = qs.filter(status=Membership.Status.CANCELLED)
        elif state == "paused":
            qs = qs.filter(status=Membership.Status.PAUSED)

        if params.get("customer_phone"):
            qs = qs.filter(customer__phone=params["customer_phone"])
        return qs

    @action(detail=True, methods=["post"])
    def record_payment(self, request, pk=None):
        """Take the fee for a term. Cash and online split the same way as a bill."""
        membership = self.get_object()
        method = request.data.get("payment_method")
        if method not in TENDER_METHODS:
            return Response(
                {"payment_method": "Choose how the fee was taken: cash, upi, card or other."},
                status=400,
            )
        amount = _amount(request.data.get("amount_paid"), membership.price)
        if amount is None or amount < 0:
            return Response({"amount_paid": "Enter a valid amount."}, status=400)

        membership.record_payment(method, amount)
        return Response(MembershipSerializer(membership).data)

    @action(detail=True, methods=["post"])
    def waive(self, request, pk=None):
        membership = self.get_object()
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response(
                {"reason": "Say why the fee was waived — it is recorded against the term."},
                status=400,
            )
        membership.waive(reason)
        return Response(MembershipSerializer(membership).data)

    @action(detail=True, methods=["post"])
    def renew(self, request, pk=None):
        """Start the next term, priced at whatever the plan costs today."""
        membership = self.get_object()
        plan = membership.plan
        if request.data.get("plan"):
            plan = MembershipPlan.objects.filter(pk=request.data["plan"]).first()
            if plan is None:
                return Response({"plan": "Unknown plan."}, status=400)

        renewed = membership.renew(plan=plan)
        return Response(
            MembershipSerializer(renewed).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        membership = self.get_object()
        membership.cancel((request.data.get("reason") or "").strip())
        return Response(MembershipSerializer(membership).data)

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        """Freeze a term — days stop ticking until it is resumed."""
        membership = self.get_object()
        try:
            membership.pause((request.data.get("reason") or "").strip())
        except DjangoValidationError as exc:
            return Response({"detail": exc.messages[0]}, status=400)
        return Response(MembershipSerializer(membership).data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        membership = self.get_object()
        try:
            membership.resume()
        except DjangoValidationError as exc:
            return Response({"detail": exc.messages[0]}, status=400)
        return Response(MembershipSerializer(membership).data)

    @action(detail=True, methods=["post"])
    def set_auto_renew(self, request, pk=None):
        membership = self.get_object()
        membership.auto_renew = bool(request.data.get("auto_renew"))
        membership.save(update_fields=["auto_renew", "updated_at"])
        return Response(MembershipSerializer(membership).data)

    @action(detail=True, methods=["get", "post"])
    def usage(self, request, pk=None):
        """GET the ledger for a term, or POST one line to it.

        A manual line is how staff record a walk-in session against a member's
        allowance, or hand hours back after a mistake. Negative hours credit.
        """
        membership = self.get_object()

        if request.method == "GET":
            return Response({
                "included_hours": membership.included_hours,
                "hours_used": membership.hours_used,
                "hours_remaining": membership.hours_remaining,
                "usage_percent": membership.usage_percent,
                "entries": MembershipUsageSerializer(
                    membership.usage.select_related("booking"), many=True
                ).data,
            })

        if not membership.has_hour_allowance:
            return Response(
                {"detail": "This scheme is discount-only — it has no hours to draw on."},
                status=400,
            )

        hours = _amount(request.data.get("hours"), None)
        if hours is None or hours == 0:
            return Response({"hours": "Enter the hours to draw, or a negative number to credit."}, status=400)

        kind = request.data.get("kind") or (
            MembershipUsage.Kind.CREDIT if hours < 0 else MembershipUsage.Kind.ADJUSTMENT
        )
        if kind not in dict(MembershipUsage.Kind.choices):
            return Response({"kind": "Unknown usage kind."}, status=400)

        note = (request.data.get("note") or "").strip()
        if not note:
            return Response(
                {"note": "Say what these hours were for — the member can ask."}, status=400
            )

        membership.log_usage(hours, kind=kind, note=note)
        membership.refresh_from_db()
        return Response(
            MembershipSerializer(membership).data, status=status.HTTP_201_CREATED
        )


@api_view(["GET"])
@permission_classes([IsStaffUser])
def membership_summary(request):
    """Headline numbers for the memberships screen."""
    today = timezone.localdate()
    soon = today + timedelta(days=7)
    month_start = today.replace(day=1)

    live = Membership.objects.filter(
        status=Membership.Status.ACTIVE,
        payment_status__in=["paid", "waived"],
        starts_on__lte=today,
        ends_on__gte=today,
    )
    paid = Membership.objects.filter(payment_status="paid")
    live_rows = list(live)

    return Response({
        "active": len(live_rows),
        "expiring_soon": sum(1 for m in live_rows if m.ends_on <= soon),
        "expired": Membership.objects.filter(
            status=Membership.Status.ACTIVE, ends_on__lt=today
        ).count(),
        "unpaid": Membership.objects.filter(payment_status="unpaid").count(),
        "paused": Membership.objects.filter(status=Membership.Status.PAUSED).count(),
        "auto_renewing": sum(1 for m in live_rows if m.auto_renew),
        "due_to_renew": Membership.due_to_renew().count(),
        "hours_drawn_this_month": float(
            MembershipUsage.objects.filter(created_at__date__gte=month_start).aggregate(
                t=Sum("hours")
            )["t"] or 0
        ),
        "revenue_this_month": float(
            paid.filter(paid_at__date__gte=month_start).aggregate(
                t=Sum("amount_paid")
            )["t"] or 0
        ),
        "revenue_all_time": float(paid.aggregate(t=Sum("amount_paid"))["t"] or 0),
        "by_plan": [
            {
                "plan": plan.name,
                "plan_id": plan.id,
                "price": float(plan.price),
                "duration_days": plan.duration_days,
                "active": sum(1 for m in live_rows if m.plan_id == plan.id),
                "hours_used": float(
                    sum(m.hours_used for m in live_rows if m.plan_id == plan.id)
                ),
            }
            for plan in MembershipPlan.objects.filter(is_active=True)
        ],
    })
