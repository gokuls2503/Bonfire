"""Add the per-phone customer code and its booking counter.

`code` lands nullable so existing rows survive the schema change; migration
`bookings.0005_backfill_codes` fills it in and `0003_customer_code_required`
then tightens it to NOT NULL.
"""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("customers", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="code",
            field=models.CharField(
                max_length=8,
                unique=True,
                null=True,
                editable=False,
                help_text="Permanent code for this phone number. Quoted at the counter.",
            ),
        ),
        migrations.AddField(
            model_name="customer",
            name="booking_sequence",
            field=models.PositiveIntegerField(
                default=0,
                help_text="Monotonic counter for this customer's booking codes. "
                          "Never decremented, so a deleted booking's number is not reused.",
            ),
        ),
    ]
