"""Move the PS5 onto per-controller pricing.

A console is one screen a group shares, so charging per station priced a solo
player and a group of four the same. The rate is now set per controller and
falls as the group grows: each person pays less, the console earns more.

Only the one-hour row is the owner's own figure. The other durations are seeded
pro-rata from it so nothing is left unpriced and unbookable, and they are meant
to be reviewed in the admin — a five-hour pack at five times the hourly rate is
a placeholder, not a pack price.

Nothing here touches a station type that is not priced per controller, and the
reverse drops the rates and the flag, leaving the old flat prices in place.
"""
from decimal import Decimal

from django.db import migrations

# The owner's one-hour rates: controllers -> price per controller.
HOURLY_RATES = {1: "200", 2: "150", 3: "125", 4: "100"}

MAX_CONTROLLERS = 4


def apply_rates(apps, schema_editor):
    StationType = apps.get_model("catalog", "StationType")
    ControllerRate = apps.get_model("catalog", "ControllerRate")

    ps5 = StationType.objects.filter(name__icontains="PS5").first()
    if ps5 is None:
        return

    ps5.prices_per_controller = True
    # Four controllers means four players on the one screen.
    ps5.max_players_per_station = MAX_CONTROLLERS
    ps5.save(update_fields=["prices_per_controller", "max_players_per_station"])

    for plan in ps5.pricing_plans.all():
        hours = Decimal(plan.duration_minutes) / Decimal("60")
        for controllers, hourly in HOURLY_RATES.items():
            ControllerRate.objects.update_or_create(
                plan=plan,
                controllers=controllers,
                defaults={
                    "price_per_controller": (Decimal(hourly) * hours).quantize(Decimal("0.01"))
                },
            )


def drop_rates(apps, schema_editor):
    StationType = apps.get_model("catalog", "StationType")
    ControllerRate = apps.get_model("catalog", "ControllerRate")

    ps5 = StationType.objects.filter(name__icontains="PS5").first()
    if ps5 is None:
        return
    ControllerRate.objects.filter(plan__station_type=ps5).delete()
    ps5.prices_per_controller = False
    ps5.save(update_fields=["prices_per_controller"])


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0004_stationtype_prices_per_controller_and_more"),
    ]

    operations = [
        migrations.RunPython(apply_rates, drop_rates),
    ]
