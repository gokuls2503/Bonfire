"""Existing paid bookings predate the cash/online split.

They were all taken at the counter in cash, so label them that way rather than
leaving them in an "unknown" bucket that would skew the first sales reports.
"""
from django.db import migrations


def backfill(apps, schema_editor):
    Booking = apps.get_model("bookings", "Booking")
    Booking.objects.filter(payment_status="paid", payment_method="").update(
        payment_method="cash"
    )


def unbackfill(apps, schema_editor):
    Booking = apps.get_model("bookings", "Booking")
    Booking.objects.filter(payment_method="cash").update(payment_method="")


class Migration(migrations.Migration):
    dependencies = [
        ("bookings", "0002_booking_payment_method_alter_booking_payment_status"),
    ]
    operations = [migrations.RunPython(backfill, unbackfill)]
