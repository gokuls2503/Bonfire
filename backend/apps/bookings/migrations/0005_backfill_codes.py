"""Give every customer a code and recode their bookings as <code>-<sequence>.

Bookings are walked in `created_at` order so the numbering is deterministic and
this migration produces the same result on any database with the same rows.

Historical booking codes (the old random `BF…` form) are discarded. Nothing was
live when this shipped, so no customer was holding one.
"""
import secrets

from django.db import migrations


def _make_code(taken):
    for _ in range(50):
        candidate = secrets.token_hex(3).upper()
        if candidate not in taken:
            taken.add(candidate)
            return candidate
    raise RuntimeError("Could not allocate a unique customer code.")


def forwards(apps, schema_editor):
    Customer = apps.get_model("customers", "Customer")
    Booking = apps.get_model("bookings", "Booking")

    taken = set(
        Customer.objects.exclude(code=None).values_list("code", flat=True)
    )

    for customer in Customer.objects.order_by("pk"):
        if not customer.code:
            customer.code = _make_code(taken)

        bookings = list(
            Booking.objects.filter(customer=customer).order_by("created_at", "pk")
        )
        for index, booking in enumerate(bookings, start=1):
            booking.code = f"{customer.code}-{index:03d}"
            booking.save(update_fields=["code"])

        customer.booking_sequence = len(bookings)
        customer.save(update_fields=["code", "booking_sequence"])

    # Bookings orphaned by a deleted customer keep a standalone code so the
    # NOT NULL / unique constraints still hold.
    for booking in Booking.objects.filter(customer=None).order_by("pk"):
        booking.code = f"{_make_code(taken)}-000"
        booking.save(update_fields=["code"])


def backwards(apps, schema_editor):
    """Restore independent random codes; the customer link is not undone."""
    Booking = apps.get_model("bookings", "Booking")
    Customer = apps.get_model("customers", "Customer")

    for booking in Booking.objects.order_by("pk"):
        booking.code = "BF" + secrets.token_hex(3).upper()
        booking.save(update_fields=["code"])

    Customer.objects.update(code=None, booking_sequence=0)


class Migration(migrations.Migration):
    dependencies = [("bookings", "0004_booking_code_format")]
    operations = [migrations.RunPython(forwards, backwards)]
