"""Turn each existing paid bill's summary fields into a Payment row.

Before split payments, "how it was paid" lived only in `payment_method` +
`amount_collected`. The sales report now attributes cash and online revenue
from Payment rows, so every settled bill needs one or its takings would vanish
from the breakdown.
"""
from django.db import migrations


def forwards(apps, schema_editor):
    Payment = apps.get_model("shop", "Payment")
    Booking = apps.get_model("bookings", "Booking")
    CounterSale = apps.get_model("shop", "CounterSale")

    rows = []

    # "split" is a summary label, not a tender — the two halves only ever live
    # in Payment rows. A bill already marked split has nothing reconstructable
    # here, so leave it alone rather than inventing a bogus single tender.
    paid_bookings = Booking.objects.filter(
        payment_status="paid", amount_collected__gt=0
    ).exclude(payment_method__in=["", "split"])
    for booking in paid_bookings.iterator():
        rows.append(
            Payment(
                booking_id=booking.id,
                method=booking.payment_method,
                amount=booking.amount_collected,
                # Recognise the money when it was taken, matching the report.
                settled_at=booking.completed_at or booking.start_at,
                note="Backfilled from the booking's recorded method.",
            )
        )

    paid_sales = CounterSale.objects.filter(
        payment_status="paid", amount_collected__gt=0
    ).exclude(payment_method__in=["", "split"])
    for sale in paid_sales.iterator():
        rows.append(
            Payment(
                sale_id=sale.id,
                method=sale.payment_method,
                amount=sale.amount_collected,
                settled_at=sale.completed_at or sale.created_at,
                note="Backfilled from the sale's recorded method.",
            )
        )

    Payment.objects.bulk_create(rows, batch_size=500)


def backwards(apps, schema_editor):
    apps.get_model("shop", "Payment").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("shop", "0002_countersale_discount_amount_and_more"),
        ("bookings", "0006_booking_discount_amount_booking_discount_reason_and_more"),
    ]
    operations = [migrations.RunPython(forwards, backwards)]
