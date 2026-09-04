"""Same backfill for tournament entry fees, plus the amount actually collected."""
from django.db import migrations


def backfill(apps, schema_editor):
    Registration = apps.get_model("tournaments", "TournamentRegistration")
    for reg in Registration.objects.filter(payment_status="paid").select_related("tournament"):
        changed = False
        if not reg.payment_method:
            reg.payment_method = "cash"
            changed = True
        if not reg.amount_paid:
            reg.amount_paid = reg.tournament.entry_fee
            changed = True
        if not reg.paid_at:
            reg.paid_at = reg.updated_at
            changed = True
        if changed:
            reg.save(update_fields=["payment_method", "amount_paid", "paid_at"])


def unbackfill(apps, schema_editor):
    Registration = apps.get_model("tournaments", "TournamentRegistration")
    Registration.objects.update(payment_method="", amount_paid=0, paid_at=None)


class Migration(migrations.Migration):
    dependencies = [
        ("tournaments", "0002_tournamentregistration_amount_paid_and_more"),
    ]
    operations = [migrations.RunPython(backfill, unbackfill)]
