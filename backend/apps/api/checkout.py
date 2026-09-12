"""Parsing and validating what happened at the till.

One rule drives all of this: every gap between the bill and what was tendered
is either a recorded discount or a recorded debt. Nothing silently goes missing,
which is why a short tender is rejected rather than quietly accepted.
"""
from decimal import Decimal, InvalidOperation

from rest_framework.exceptions import ValidationError

TENDER_METHODS = ("cash", "upi", "card", "other")


def _decimal(value, field):
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError({field: "Enter a valid amount."})


def resolve_discount(data, gross_due):
    """Return (discount_amount, reason) from either a rupee figure or a percent.

    A percentage is only an input convenience — the rupee value is what gets
    stored, so reports never have to re-derive it.
    """
    percent = data.get("discount_percent")
    if percent not in (None, ""):
        pct = _decimal(percent, "discount_percent")
        if pct < 0 or pct > 100:
            raise ValidationError({"discount_percent": "Use a percentage between 0 and 100."})
        discount = (gross_due * pct / Decimal("100")).quantize(Decimal("0.01"))
    else:
        discount = _decimal(data.get("discount_amount") or 0, "discount_amount")

    if discount < 0:
        raise ValidationError({"discount_amount": "A discount cannot be negative."})

    reason = (data.get("discount_reason") or "").strip()
    if discount > 0 and not reason:
        raise ValidationError(
            {"discount_reason": "Say why the discount was given — it is recorded against the bill."}
        )

    # Comping more than the bill is allowed; it just settles at zero.
    return min(discount, gross_due), reason


def resolve_tenders(data, net_due):
    """Return [(method, amount), ...] that must add up to `net_due` exactly.

    Accepts either `payments: [{method, amount}, ...]` for a split, or a single
    `payment_method` which is taken to cover the whole bill.
    """
    rows = data.get("payments")

    if rows:
        if not isinstance(rows, list):
            raise ValidationError({"payments": "Send a list of {method, amount}."})
        tenders = []
        for row in rows:
            method = (row or {}).get("method")
            if method not in TENDER_METHODS:
                raise ValidationError(
                    {"payments": f"Unknown payment method: {method!r}."}
                )
            amount = _decimal((row or {}).get("amount") or 0, "payments")
            if amount < 0:
                raise ValidationError({"payments": "A tender cannot be negative."})
            if amount > 0:
                tenders.append((method, amount))

        if not tenders:
            raise ValidationError({"payments": "Enter at least one amount."})

        total = sum((a for _, a in tenders), Decimal("0.00"))
        if total != net_due:
            raise ValidationError({
                "payments": (
                    f"The split adds up to {total}, but the bill is {net_due}. "
                    "Adjust the amounts, apply a discount, or leave it unpaid."
                )
            })
        return tenders

    method = data.get("payment_method")
    if method not in TENDER_METHODS:
        raise ValidationError(
            {"payment_method": "Choose how the payment was taken: cash, upi, card or other."}
        )
    return [(method, net_due)]
