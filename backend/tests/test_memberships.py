"""Monthly memberships: plans the owner edits, terms sold against them."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.memberships.models import Membership, MembershipPlan

pytestmark = pytest.mark.django_db


@pytest.fixture
def monthly(db):
    return MembershipPlan.objects.create(
        name="Monthly Gold",
        price="1500",
        duration_days=30,
        discount_percent="15",
        included_hours="20",
        perks="Priority seating\nFree locker",
    )


@pytest.fixture
def member(db):
    return Customer.objects.create(full_name="Regular Raj", phone="9800001234")


def _sell(plan, customer, **kwargs):
    return Membership.objects.create(customer=customer, plan=plan, **kwargs)


# ---------- the model ----------

def test_term_ends_a_month_after_it_starts(monthly, member):
    today = timezone.localdate()
    m = _sell(monthly, member, starts_on=today)
    assert m.ends_on == today + timedelta(days=29)
    assert m.days_remaining == 30


def test_selling_snapshots_the_plan(monthly, member):
    m = _sell(monthly, member)
    monthly.price = "2500"
    monthly.discount_percent = "5"
    monthly.save()
    m.refresh_from_db()

    assert m.price == Decimal("1500.00")
    assert m.discount_percent == Decimal("15.00")
    assert m.plan_name == "Monthly Gold"


def test_an_unpaid_term_is_not_live_yet(monthly, member):
    m = _sell(monthly, member)
    assert m.state == "unpaid"
    assert m.is_current is False
    assert Membership.current_for(member) is None

    m.record_payment("cash")
    assert m.state == "active"
    assert m.amount_paid == Decimal("1500.00")
    assert Membership.current_for(member) == m


def test_a_lapsed_term_reads_as_expired(monthly, member):
    today = timezone.localdate()
    m = _sell(monthly, member, starts_on=today - timedelta(days=60))
    m.record_payment("upi")
    assert m.state == "expired"
    assert m.days_remaining == 0
    assert Membership.current_for(member) is None


def test_waiving_a_fee_still_makes_the_term_live(monthly, member):
    m = _sell(monthly, member)
    m.waive("Owner's cousin")
    assert m.is_current is True
    assert m.amount_paid == Decimal("0.00")
    assert "Owner's cousin" in m.notes


def test_cancelling_ends_the_term(monthly, member):
    m = _sell(monthly, member)
    m.record_payment("cash")
    m.cancel("Moved city")
    assert m.state == "cancelled"
    assert m.is_current is False


def test_renewal_picks_up_where_the_term_ends(monthly, member):
    today = timezone.localdate()
    m = _sell(monthly, member, starts_on=today)
    m.record_payment("cash")

    monthly.price = "1800"
    monthly.save()
    nxt = m.renew()

    assert nxt.starts_on == m.ends_on + timedelta(days=1)
    # Renewal is priced at today's rate, not the rate the first term was sold at.
    assert nxt.price == Decimal("1800.00")
    assert nxt.payment_status == "unpaid"


def test_hours_remaining_only_applies_to_a_scheme_that_includes_hours(monthly, member):
    m = _sell(monthly, member)
    m.hours_used = Decimal("5.0")
    m.save()
    assert m.hours_remaining == Decimal("15.0")

    discount_only = MembershipPlan.objects.create(
        name="Discount Only", price="500", included_hours="0"
    )
    other = Membership.objects.create(customer=member, plan=discount_only)
    assert other.hours_remaining is None


# ---------- the admin API ----------

def test_staff_can_edit_the_scheme(staff_api, monthly):
    res = staff_api.patch(
        f"/api/admin/membership-plans/{monthly.id}/",
        {"price": "1999", "duration_days": 45, "discount_percent": "20"},
        format="json",
    )
    assert res.status_code == 200
    monthly.refresh_from_db()
    assert monthly.price == Decimal("1999.00")
    assert monthly.duration_days == 45


def test_plans_need_a_staff_token(api, monthly):
    assert api.get("/api/admin/membership-plans/").status_code in (401, 403)
    assert api.get("/api/admin/memberships/").status_code in (401, 403)


def test_selling_by_phone_finds_or_creates_the_customer(staff_api, monthly):
    res = staff_api.post(
        "/api/admin/memberships/",
        {"plan": monthly.id, "phone": "9800009999", "full_name": "New Member"},
        format="json",
    )
    assert res.status_code == 201, res.data
    assert res.data["customer_phone"] == "9800009999"
    assert res.data["state"] == "unpaid"
    assert Customer.objects.filter(phone="9800009999").exists()


def test_selling_without_a_phone_is_rejected(staff_api, monthly):
    res = staff_api.post("/api/admin/memberships/", {"plan": monthly.id}, format="json")
    assert res.status_code == 400
    assert "phone" in res.data


def test_taking_the_fee_needs_a_method(staff_api, monthly, member):
    m = _sell(monthly, member)
    bad = staff_api.post(f"/api/admin/memberships/{m.id}/record_payment/", {}, format="json")
    assert bad.status_code == 400

    ok = staff_api.post(
        f"/api/admin/memberships/{m.id}/record_payment/",
        {"payment_method": "upi"}, format="json",
    )
    assert ok.status_code == 200
    assert ok.data["state"] == "active"
    assert Decimal(ok.data["amount_paid"]) == Decimal("1500.00")


def test_waiving_requires_a_reason(staff_api, monthly, member):
    m = _sell(monthly, member)
    assert staff_api.post(
        f"/api/admin/memberships/{m.id}/waive/", {}, format="json"
    ).status_code == 400
    assert staff_api.post(
        f"/api/admin/memberships/{m.id}/waive/", {"reason": "Launch offer"}, format="json"
    ).status_code == 200


def test_renew_endpoint_creates_the_next_term(staff_api, monthly, member):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash")
    res = staff_api.post(f"/api/admin/memberships/{m.id}/renew/", {}, format="json")
    assert res.status_code == 201
    assert res.data["starts_on"] == str(m.ends_on + timedelta(days=1))
    assert member.memberships.count() == 2


def test_state_filter_separates_live_from_lapsed(staff_api, monthly, member):
    today = timezone.localdate()
    live = _sell(monthly, member, starts_on=today)
    live.record_payment("cash")
    other = Customer.objects.create(full_name="Lapsed Lata", phone="9800004321")
    lapsed = _sell(monthly, other, starts_on=today - timedelta(days=90))
    lapsed.record_payment("cash")

    active = staff_api.get("/api/admin/memberships/?state=active").data
    codes = [row["code"] for row in (active.get("results", active))]
    assert live.code in codes and lapsed.code not in codes

    expired = staff_api.get("/api/admin/memberships/?state=expired").data
    assert lapsed.code in [row["code"] for row in (expired.get("results", expired))]


def test_summary_counts_what_the_owner_asks_about(staff_api, monthly, member):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash", "1500")
    res = staff_api.get("/api/admin/memberships/summary/")
    assert res.status_code == 200
    assert res.data["active"] == 1
    assert res.data["expiring_soon"] == 0
    assert res.data["revenue_this_month"] == 1500.0


def test_a_customer_row_shows_the_live_membership(staff_api, monthly, member):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash")
    res = staff_api.get(f"/api/admin/customers/{member.id}/")
    assert res.data["membership"]["plan"] == "Monthly Gold"
    assert res.data["membership"]["days_remaining"] == 30


# ---------- reporting and the public site ----------

def test_membership_fees_land_in_the_sales_report(staff_api, monthly, member):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash", "1500")

    res = staff_api.get("/api/admin/sales/?preset=today")
    totals = res.data["totals"]
    assert totals["memberships_revenue"] == 1500.0
    assert totals["memberships_sold"] == 1
    assert totals["cash"] == 1500.0
    assert totals["revenue"] == 1500.0

    tx = staff_api.get("/api/admin/sales/transactions/?preset=today").data
    membership_rows = [r for r in tx["transactions"] if r["kind"] == "membership"]
    assert len(membership_rows) == 1
    assert membership_rows[0]["reference"] == m.code


def test_selling_a_membership_leaves_bookings_alone(staff_api, monthly, member, make_booking):
    """The whole point: memberships sit beside the booking flow, not inside it."""
    booking = make_booking(phone=member.phone, full_name=member.full_name)
    m = _sell(monthly, member)
    m.record_payment("cash")

    booking.refresh_from_db()
    assert booking.amount_due == Decimal("70.00")
    assert booking.discount_amount == Decimal("0.00")
    assert booking.payment_status == "unpaid"


def test_public_site_sees_only_public_plans(api, monthly, site):
    MembershipPlan.objects.create(name="Staff Rate", price="0", is_public=False)
    res = api.get("/api/public/bootstrap/")
    names = [p["name"] for p in res.data["membership_plans"]]
    assert names == ["Monthly Gold"]
    assert res.data["membership_plans"][0]["perks"] == ["Priority seating", "Free locker"]


# ---------- usage tracking ----------

def test_a_completed_session_draws_from_the_allowance(staff_api, monthly, member, make_booking):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash")
    booking = make_booking(phone=member.phone, full_name=member.full_name, duration_minutes=120)

    res = staff_api.post(
        f"/api/admin/bookings/{booking.id}/complete/",
        {"payment_status": "paid", "payment_method": "cash"}, format="json",
    )
    assert res.status_code == 200
    draw = res.data["membership_draw"]
    assert draw["hours_drawn"] == 2.0
    assert draw["hours_billable"] == 0.0
    assert draw["hours_remaining"] == 18.0

    m.refresh_from_db()
    assert m.hours_used == Decimal("2.0")
    assert m.usage.count() == 1


def test_seats_multiply_the_hours_drawn(monthly, member, make_booking):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash")
    booking = make_booking(phone=member.phone, duration_minutes=60, seats=3)

    entry, billable = m.draw_for_booking(booking)
    assert entry.hours == Decimal("3.0")
    assert billable == Decimal("0.0")


def test_hours_beyond_the_allowance_come_back_as_billable(monthly, member, make_booking):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash")
    m.log_usage("18", kind="adjustment", note="Earlier sessions")

    booking = make_booking(phone=member.phone, duration_minutes=300)  # 5 hours
    entry, billable = m.draw_for_booking(booking)

    assert entry.hours == Decimal("2.0")   # only what was left
    assert billable == Decimal("3.0")      # staff charge for the rest
    m.refresh_from_db()
    assert m.hours_remaining == Decimal("0.0")


def test_a_booking_draws_only_once(monthly, member, make_booking):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash")
    booking = make_booking(phone=member.phone, duration_minutes=60)

    m.draw_for_booking(booking)
    entry, billable = m.draw_for_booking(booking)

    assert entry is None
    m.refresh_from_db()
    assert m.hours_used == Decimal("1.0")


def test_cancelling_a_session_hands_the_hours_back(staff_api, monthly, member, make_booking):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash")
    booking = make_booking(phone=member.phone, duration_minutes=120)
    m.draw_for_booking(booking)

    staff_api.post(f"/api/admin/bookings/{booking.id}/cancel/", {}, format="json")

    m.refresh_from_db()
    assert m.hours_used == Decimal("0.0")
    assert m.usage.count() == 0


def test_a_no_show_hands_the_hours_back_too(staff_api, monthly, member, make_booking):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash")
    booking = make_booking(phone=member.phone, duration_minutes=60)
    m.draw_for_booking(booking)

    staff_api.post(f"/api/admin/bookings/{booking.id}/no_show/", {}, format="json")
    m.refresh_from_db()
    assert m.hours_used == Decimal("0.0")


def test_an_unpaid_or_lapsed_term_draws_nothing(monthly, member, make_booking):
    unpaid = _sell(monthly, member, starts_on=timezone.localdate())
    booking = make_booking(phone=member.phone, duration_minutes=60)
    entry, billable = unpaid.draw_for_booking(booking)
    assert entry is None and billable == Decimal("0.0")

    lapsed = _sell(monthly, member, starts_on=timezone.localdate() - timedelta(days=90))
    lapsed.record_payment("cash")
    entry, billable = lapsed.draw_for_booking(booking)
    assert entry is None and billable == Decimal("0.0")

    member.refresh_from_db()
    assert unpaid.hours_used == Decimal("0.0")
    assert lapsed.hours_used == Decimal("0.0")


def test_a_discount_only_scheme_never_draws(member, make_booking):
    plan = MembershipPlan.objects.create(name="Discount Only", price="500", included_hours="0")
    m = Membership.objects.create(customer=member, plan=plan)
    m.record_payment("cash")
    booking = make_booking(phone=member.phone, duration_minutes=60)

    entry, billable = m.draw_for_booking(booking)
    assert entry is None
    assert m.hours_remaining is None


def test_completing_a_non_members_session_changes_nothing(staff_api, make_booking):
    """The booking flow must behave exactly as it did before memberships."""
    booking = make_booking(phone="9700000007", full_name="Not A Member")
    res = staff_api.post(
        f"/api/admin/bookings/{booking.id}/complete/",
        {"payment_status": "paid", "payment_method": "cash"}, format="json",
    )
    assert res.status_code == 200
    assert "membership_draw" not in res.data
    assert Decimal(res.data["amount_collected"]) == Decimal("70.00")


def test_the_ledger_is_the_truth_for_hours_used(monthly, member):
    m = _sell(monthly, member)
    m.log_usage("3", kind="adjustment", note="Walk-in session")
    m.log_usage("2.5", kind="adjustment", note="Second visit")
    m.log_usage("-1.5", kind="credit", note="Machine crashed")

    m.refresh_from_db()
    assert m.hours_used == Decimal("4.0")
    assert m.hours_remaining == Decimal("16.0")
    assert m.usage.count() == 3


def test_staff_can_read_and_write_the_ledger(staff_api, monthly, member):
    m = _sell(monthly, member)

    res = staff_api.post(
        f"/api/admin/memberships/{m.id}/usage/",
        {"hours": "2.5", "note": "Walk-in on PC-02"}, format="json",
    )
    assert res.status_code == 201
    assert Decimal(res.data["hours_used"]) == Decimal("2.5")

    ledger = staff_api.get(f"/api/admin/memberships/{m.id}/usage/").data
    assert len(ledger["entries"]) == 1
    assert ledger["entries"][0]["note"] == "Walk-in on PC-02"
    assert Decimal(ledger["hours_remaining"]) == Decimal("17.5")


def test_logging_usage_needs_a_note(staff_api, monthly, member):
    m = _sell(monthly, member)
    res = staff_api.post(
        f"/api/admin/memberships/{m.id}/usage/", {"hours": "2"}, format="json"
    )
    assert res.status_code == 400
    assert "note" in res.data


def test_usage_cannot_be_logged_against_a_discount_only_scheme(staff_api, member):
    plan = MembershipPlan.objects.create(name="Discount Only", price="500", included_hours="0")
    m = Membership.objects.create(customer=member, plan=plan)
    res = staff_api.post(
        f"/api/admin/memberships/{m.id}/usage/",
        {"hours": "2", "note": "nope"}, format="json",
    )
    assert res.status_code == 400


# ---------- subscription management ----------

def test_pausing_freezes_the_clock_and_resuming_gives_the_days_back(monthly, member):
    start = timezone.localdate() - timedelta(days=10)
    m = _sell(monthly, member, starts_on=start)
    m.record_payment("cash")
    original_end = m.ends_on

    m.pause("Travelling")
    assert m.state == "paused"
    assert m.is_current is False

    # Pretend the freeze went on for 4 days before anyone came back.
    m.paused_on = timezone.localdate() - timedelta(days=4)
    m.save(update_fields=["paused_on"])
    frozen_days = m.days_remaining
    m.resume()

    assert m.ends_on == original_end + timedelta(days=4)
    assert m.paused_days == 4
    assert m.state == "active"
    assert m.days_remaining == frozen_days


def test_a_paused_term_does_not_draw_hours(monthly, member, make_booking):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash")
    m.pause("Travelling")

    booking = make_booking(phone=member.phone, duration_minutes=60)
    entry, _ = m.draw_for_booking(booking)
    assert entry is None
    assert Membership.current_for(member) is None


def test_only_a_running_term_can_be_paused(staff_api, monthly, member):
    m = _sell(monthly, member)
    m.record_payment("cash")
    assert staff_api.post(f"/api/admin/memberships/{m.id}/pause/", {}, format="json").status_code == 200
    assert staff_api.post(f"/api/admin/memberships/{m.id}/pause/", {}, format="json").status_code == 400
    assert staff_api.post(f"/api/admin/memberships/{m.id}/resume/", {}, format="json").status_code == 200
    assert staff_api.post(f"/api/admin/memberships/{m.id}/resume/", {}, format="json").status_code == 400


def test_auto_renew_is_carried_into_the_next_term(staff_api, monthly, member):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash")

    res = staff_api.post(
        f"/api/admin/memberships/{m.id}/set_auto_renew/", {"auto_renew": True}, format="json"
    )
    assert res.status_code == 200 and res.data["auto_renew"] is True

    m.refresh_from_db()
    nxt = m.renew()
    assert nxt.auto_renew is True
    assert nxt.renewed_from_id == m.id
    assert nxt.hours_used == Decimal("0.0")   # a fresh term is a fresh allowance


def test_only_lapsed_auto_renewers_are_due_to_roll(monthly, member):
    lapsed = _sell(monthly, member, starts_on=timezone.localdate() - timedelta(days=60))
    lapsed.record_payment("cash")
    lapsed.auto_renew = True
    lapsed.save()

    other = Customer.objects.create(full_name="Still Running", phone="9800005555")
    running = _sell(monthly, other, starts_on=timezone.localdate())
    running.record_payment("cash")
    running.auto_renew = True
    running.save()

    due = list(Membership.due_to_renew())
    assert [m.id for m in due] == [lapsed.id]

    # Once it has rolled it is no longer due, so re-running never double-rolls.
    lapsed.renew()
    assert list(Membership.due_to_renew()) == []


def test_the_roll_command_creates_the_next_term(monthly, member, capsys):
    from django.core.management import call_command

    m = _sell(monthly, member, starts_on=timezone.localdate() - timedelta(days=40))
    m.record_payment("cash")
    m.auto_renew = True
    m.save()

    call_command("memberships")
    assert member.memberships.count() == 1, "a report-only run must change nothing"

    call_command("memberships", "--roll")
    assert member.memberships.count() == 2
    nxt = member.memberships.exclude(pk=m.pk).get()
    assert nxt.payment_status == "unpaid"
    assert nxt.renewed_from_id == m.id


def test_summary_reports_usage_and_lifecycle(staff_api, monthly, member):
    m = _sell(monthly, member, starts_on=timezone.localdate())
    m.record_payment("cash")
    m.log_usage("4", kind="session", note="Evening session")
    m.auto_renew = True
    m.save()

    data = staff_api.get("/api/admin/memberships/summary/").data
    assert data["active"] == 1
    assert data["auto_renewing"] == 1
    assert data["paused"] == 0
    assert data["hours_drawn_this_month"] == 4.0
    gold = next(p for p in data["by_plan"] if p["plan"] == "Monthly Gold")
    assert gold["hours_used"] == 4.0
