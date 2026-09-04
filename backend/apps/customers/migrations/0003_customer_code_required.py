"""Every customer now has a code, so tighten the column to NOT NULL."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0002_customer_code"),
        # Codes are only populated once the backfill has run.
        ("bookings", "0005_backfill_codes"),
    ]

    operations = [
        migrations.AlterField(
            model_name="customer",
            name="code",
            field=models.CharField(
                max_length=8,
                unique=True,
                editable=False,
                help_text="Permanent code for this phone number. Quoted at the counter.",
            ),
        ),
    ]
