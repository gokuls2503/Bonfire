"""Day-to-day subscription upkeep.

    python manage.py memberships              # report only, changes nothing
    python manage.py memberships --roll       # create the next term for auto-renewers
    python manage.py memberships --days 5     # widen the "expiring soon" window

Nothing here expires anybody: a term's state is derived from its dates, so a
membership lapses on its own the moment the calendar passes `ends_on`. The only
thing that needs doing on a schedule is rolling auto-renewals forward, and even
that stops at creating the next term — the fee is still collected at the
counter, by a human, like every other rupee in this system.
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.memberships.models import Membership


class Command(BaseCommand):
    help = "Report on memberships and roll auto-renewing terms forward."

    def add_arguments(self, parser):
        parser.add_argument(
            "--roll", action="store_true",
            help="Actually create the next term for auto-renewing memberships.",
        )
        parser.add_argument(
            "--days", type=int, default=7,
            help="How many days ahead counts as 'expiring soon'. Default 7.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        today = timezone.localdate()
        horizon = today + timezone.timedelta(days=options["days"])

        expiring = list(Membership.expiring_between(today, horizon))
        self.stdout.write(f"Expiring in the next {options['days']} days: {len(expiring)}")
        for m in expiring:
            hours = (
                f", {m.hours_remaining} of {m.included_hours} hrs left"
                if m.has_hour_allowance else ""
            )
            self.stdout.write(
                f"  {m.ends_on}  {m.customer.full_name} ({m.customer.phone})"
                f" — {m.plan_name}{hours}"
                f"{'  [auto-renews]' if m.auto_renew else ''}"
            )

        due = list(Membership.due_to_renew(today))
        self.stdout.write(f"\nAuto-renewals due: {len(due)}")
        for m in due:
            self.stdout.write(f"  {m.customer.full_name} — {m.plan_name} ended {m.ends_on}")

        if not options["roll"]:
            if due:
                self.stdout.write(
                    self.style.WARNING("\nNothing was changed. Re-run with --roll to create them.")
                )
            return

        rolled = 0
        for m in due:
            # Renewals are priced at the plan's rate today, not the old term's.
            nxt = m.renew(starts_on=max(m.ends_on + timezone.timedelta(days=1), today))
            rolled += 1
            self.stdout.write(
                f"  rolled {m.customer.full_name} -> {nxt.code} "
                f"({nxt.starts_on} to {nxt.ends_on}, {nxt.price} unpaid)"
            )

        self.stdout.write(self.style.SUCCESS(f"\n{rolled} term(s) rolled forward, fees unpaid."))
