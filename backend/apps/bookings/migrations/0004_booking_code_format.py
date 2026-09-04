"""Booking codes are now derived from the customer, not generated per booking.

Drops the random default; `Booking.save()` assigns `<customer code>-<sequence>`
once the customer has been resolved from the phone number.
"""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("bookings", "0003_backfill_payment_method"),
        # The backfill in 0005 needs Customer.code to exist.
        ("customers", "0002_customer_code"),
    ]

    operations = [
        migrations.AlterField(
            model_name="booking",
            name="code",
            field=models.CharField(max_length=12, unique=True, editable=False, blank=True),
        ),
    ]
