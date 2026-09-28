"""Take time-windowed rates out of the online booking flow.

A plan with an availability window (happy hour) is a deal that depends on when
the customer actually walks in. The booking flow picks a slot days ahead and
never checked the window, so the discounted rate was being sold for any time of
day. Flipping these to counter-only closes that and matches what the rates page
was already implying.

Only plans that carry a window are touched, and only on the way up — plans
without one keep booking exactly as before.
"""
from django.db import migrations


def windowed_plans_are_counter_only(apps, schema_editor):
    PricingPlan = apps.get_model("catalog", "PricingPlan")
    PricingPlan.objects.filter(available_from__isnull=False).update(is_bookable=False)


def restore(apps, schema_editor):
    PricingPlan = apps.get_model("catalog", "PricingPlan")
    PricingPlan.objects.filter(available_from__isnull=False).update(is_bookable=True)


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0002_pricingplan_is_bookable_alter_pricingplan_is_active"),
    ]

    operations = [
        migrations.RunPython(windowed_plans_are_counter_only, restore),
    ]
