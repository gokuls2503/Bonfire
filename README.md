# Bonfire Gaming Hub

Public site + staff console for the gaming cafe.

| Surface | Local | Production |
|---|---|---|
| Public site | http://localhost:5173 | `bonfiregaminghub.com` |
| Admin console | http://localhost:5174 | `admin.bonfiregaminghub.com` |
| API | http://localhost:8000 | `api.bonfiregaminghub.com` |
| Django admin (fallback) | http://localhost:8000/django-admin/ | `api.bonfiregaminghub.com/django-admin/` |

Stack: **Django 5.2 + DRF + PostgreSQL** behind **gunicorn/nginx**, with two
**React (Vite)** single-page apps as separate static bundles.

---

## Run it locally

```bash
./dev.sh            # starts API + both front-ends
```

First time only:

```bash
createdb bonfire
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # edit POSTGRES_USER to your local role
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed        # loads the real 5 PC / 2 PS5 setup
.venv/bin/python manage.py createsuperuser

cd ../public-web && npm install
cd ../admin-web && npm install
```

`manage.py seed --demo` also creates sample bookings and teams, useful for
looking at a populated dashboard. It never overwrites rows that already exist,
so it is safe to re-run.

---

## What's in it

### Public site (`public-web/`)
- Hero, station showcase with live per-seat status, rates, game library
- **Booking flow** — pick platform → plan → date → time slot → details.
  Availability is computed from real capacity and existing bookings, in 30-minute
  steps, respecting opening hours, closures, minimum notice and the booking horizon.
- **Tournaments** — list, detail page with rules and prize breakdown, and team
  or solo registration
- **Find my booking** — every phone gets a permanent customer code; enter it to
  see all your bookings, or a full booking code for just one. Cancel any of
  them with a matching phone number.
- Gallery, testimonials, FAQ, opening hours, map and contact form
- All copy, images, hours, rates and contact details come from the API, so the
  owner changes them in the admin, not in code

### Admin console (`admin-web/`)
- **Dashboard** — today's bookings, who's playing, revenue, 7-day trend, live
  floor map, "needs attention" queue, next tournament
- **Bookings** — filter by date/status/search, create walk-ins, and the full
  lifecycle: confirm → check in → close out (which frees the station and records
  how the money was taken), plus cancel and no-show
- **Checkout** — take a bill as cash, UPI, or **split across both**, and apply a
  manual **discount** (₹ or %) that requires a reason. Change-due helper for
  cash. A split must balance the bill exactly before it can be taken.
- **Sales** — daily takings split into **cash and online**, over today,
  yesterday, 7/30 days, this or last month, or any custom range. Stacked daily
  chart, payment mix, revenue per platform, tournament entry fees counted
  separately, outstanding balances you can settle in place, a full transaction
  list for reconciling the till, and CSV export.
- **Floor** — one tap per station to flip it between available and maintenance;
  close out a session or check someone in without leaving the screen
- **Stations** — add platforms (Gaming PC, PS5, and whatever comes next) and
  individual stations. New hardware immediately increases public booking capacity.
- **Shop items** — create snacks, drinks and rentable kit (extra controllers,
  racing and flight sim rigs, VR headsets), set prices and stock, and adjust
  stock with a reason so every count can be explained. Low-stock warnings, and a
  live count of what is out on the floor right now.
- **Bill** — put shop items on a session. Hourly add-ons scale with the session
  length; the close-out screen bills station time plus items as one total.
- **Counter sale** — ring up a walk-in who only wants a drink. Lands in the
  sales report next to sessions.
- **Pricing** — per-platform plans with badges, happy-hour windows and struck-through prices
- **Tournaments & registrations** — create events, approve teams, mark entry fees
  paid, and clone a weekly event forward one week at a time
- **Customers** — auto-created from bookings, with tier (walk-in / member / VIP /
  banned) and per-customer booking history
- **Hours & closures** — weekly opening hours and one-off holiday closures
- **Site content** — brand, hero copy, about text, announcement banner, contact
  details, socials, booking rules, SEO and social share image
- **Messages** — the contact-form inbox

---

## Growing the business

The data model was built for the "5 PCs today, more later" path.

**Adding stations.** Admin → Stations → *Add station*. Availability, capacity
checks, the public station list and the floor map all read from the same table,
so nothing else needs changing.

**Adding a whole new platform** (racing rigs, VR, a console you don't have yet):
Admin → Stations → *Add platform*, then add its stations and at least one
pricing plan. It appears on the public site as its own bookable category.

**Adding snacks, drinks or kit.** Admin -> Shop items -> *Add item*. Pick
**Consumable** for anything that gets eaten or drunk, **Rental** for kit that
comes back. Rentals can be charged flat or per hour of the session. Everything
you add appears immediately on the bill screen and the counter-sale screen.

**Weekly tournaments.** Mark an event *Runs every week*, then use *Clone +1 week*
to create next week's edition as a draft. Fill in the prize pool, flip it to
*Registration open*, and it goes live.

**When you take online payments.** `Booking.payment_status` and
`TournamentRegistration.payment_status` already exist and are driven through the
admin. Adding Razorpay means adding an order/webhook layer that flips those
fields — no schema migration needed for the happy path.

---

## Deploying to the VPS

```bash
# On the VPS, once:
sudo bash deploy/provision.sh          # packages, postgres, nginx, systemd, ufw
# copy the repo to /srv/bonfire, then:
cp deploy/backend.env.production.example /srv/bonfire/backend/.env
chmod 600 /srv/bonfire/backend/.env    # fill in SECRET_KEY + DB password

bash deploy/deploy.sh                  # build, migrate, collectstatic, restart

sudo certbot --nginx \
  -d bonfiregaminghub.com -d www.bonfiregaminghub.com \
  -d admin.bonfiregaminghub.com -d api.bonfiregaminghub.com
```

DNS records are in [`deploy/DNS.md`](deploy/DNS.md). Point `@`, `www`, `admin`
and `api` at the VPS IP **before** running certbot.

Every later release is just `git pull && bash deploy/deploy.sh`.

Nightly backups: `sudo crontab -e` → `15 3 * * * /srv/bonfire/deploy/backup.sh`

### Before going live
- [ ] Set a real `DJANGO_SECRET_KEY` (the dev default is committed and insecure)
- [ ] `DJANGO_DEBUG=False`
- [ ] Change the superuser password from anything used in development
- [ ] Fill in address, phone, WhatsApp, map embed and socials in Admin → Site content
- [ ] Upload gallery photos and a social share image
- [ ] Check the rates in Admin → Pricing match what you actually charge
- [ ] Set your real opening hours in Admin → Hours

---

## API shape

Public (no auth, rate-limited on writes):

```
GET  /api/public/bootstrap/                 everything the site needs, one call
GET  /api/public/availability/?date=&duration=&station_type=
POST /api/public/bookings/                  create a booking
GET  /api/public/bookings/<code>/           customer code -> all their bookings
                                            full code    -> just that one
POST /api/public/bookings/<code>/cancel/    cancel one, with a matching phone
GET  /api/public/tournaments/?scope=upcoming|past|all
GET  /api/public/tournaments/<slug>/
POST /api/public/registrations/
POST /api/public/contact/
```

Admin (staff JWT via `POST /api/auth/token/`):

```
GET   /api/admin/dashboard/
GET   /api/admin/sales/                  ?preset=today|yesterday|7d|30d|month|
                                          last_month  — or ?from=&to=
GET   /api/admin/sales/transactions/     same range params, plus ?method=
CRUD  /api/admin/{bookings,stations,station-types,pricing-plans,games,customers,
                  tournaments,registrations,gallery,testimonials,faqs,
                  business-hours,closures,messages,
                  products,product-categories,bill-items,counter-sales}/
GET   /api/admin/site-settings/     PATCH to edit (multipart for images)
POST  /api/admin/bookings/<id>/{confirm,check_in,complete,cancel,no_show}/
POST  /api/admin/bookings/<id>/record_payment/    settle an unpaid balance

  Both accept either `payment_method` for a single tender, or
  `payments: [{method, amount}, ...]` for a split that must sum to the bill.
  Both accept `discount_amount` (or `discount_percent`) with a
  `discount_reason`, which is required whenever a discount is applied.
GET   /api/admin/shop/summary/                   menu + low stock + kit out now
POST  /api/admin/shop/quick-sale/                ring up a walk-in in one call
POST  /api/admin/products/<id>/adjust_stock/     restock / correct / write off
GET   /api/admin/products/<id>/movements/        stock history
POST  /api/admin/bill-items/<id>/mark_returned/  hand a rental back early
POST  /api/admin/stations/<id>/set_status/
POST  /api/admin/tournaments/<id>/duplicate/
POST  /api/admin/registrations/<id>/set_status/
```

Access tokens last 8 hours and refresh automatically in the admin app.

**`complete` requires a payment method.** `POST /api/admin/bookings/<id>/complete/`
returns 400 unless the body carries `payment_method` (`cash`, `upi`, `card` or
`other`), or sets `payment_status` to `waived` or `unpaid`. Without it the
cash/online split would silently drift, so it is enforced rather than defaulted.
Anything scripting this endpoint needs updating.

---

## Notes for whoever works on this next

- **Capacity is enforced in `Booking.clean()`**, not in the serializer, so
  staff-created bookings and website bookings obey the same rule. Overlap is
  computed in Python because `end_at` is derived (`start_at + duration_minutes`)
  rather than stored.
- **`SiteSettings` is a singleton** — `save()` pins `pk=1`. Read it with
  `SiteSettings.load()`, never `objects.create()`.
- **Customers are deduplicated by phone** and created automatically on booking or
  tournament registration. The name/phone/email are also denormalised onto each
  booking so the record survives customer deletion.
- **Booking codes are `<customer code>-<sequence>`** — six hex characters
  identifying the phone number, then a 3-digit visit number, e.g. `A3F92C-001`.
  The customer half never changes, so a regular has one code to quote forever.
  The sequence comes from `Customer.booking_sequence`, a monotonic counter
  bumped with an atomic `UPDATE` — deliberately **not** `bookings.count()`,
  because deleting a booking must never let a later one reuse a retired number.
- **Code lookups are normalised** by `normalise_code()` in
  `apps/customers/models.py`: case, hyphens and spaces are stripped, so
  `a3f92c001` and `A3F92C-001` both resolve. `GET /api/public/bookings/<code>/`
  takes either half and always returns a **list** shape
  (`{customer_code, full_name, bookings: [...]}`) — a bare customer code lists
  everything they have booked. Cancelling still needs a full booking code; a
  customer code is refused rather than guessing which booking was meant.
- **Consumables and rentals track stock differently** (`apps/shop/models.py`).
  A consumable decrements `stock_quantity` on sale and never comes back. A
  rental leaves `stock_quantity` alone — it is the number owned — and
  availability is `stock_quantity` minus the units on open bill lines
  (`returned_at is None`). Closing, cancelling or no-showing a booking calls
  `Booking.release_rentals()`, so kit returns to the pool without anyone
  remembering to do it.
- **Bill lines snapshot the name and price** at the time of sale, so changing a
  product's price later does not rewrite old bills.
- **Payments are rows, not a field.** `shop.Payment` holds one line per tender,
  which is how a split booking puts its cash half in cash and its UPI half in
  online. `amount_collected` and `payment_method` remain on the bill as
  denormalised summaries, but only `record_payments()` writes them, together
  with the rows, so they cannot drift. `payment_method` reads `split` when
  there is more than one tender — that is a summary label and must never be
  stored on a `Payment`.
- **The sales report falls back when a bill has no payment rows**
  (`_tender_rows` in `apps/api/sales.py`). That happens for anything marked paid
  through `/django-admin/`, and for split bills whose detail a down-migration
  destroyed. An unknown method is counted as unrecorded rather than crashing the
  report, and surfaces in the "taken without a recorded method" flag.
- **Every gap between the bill and what was tendered is either a recorded
  discount or a recorded debt.** Under-typing the amount to collect less is not
  possible: use a discount (which needs a reason) or leave the session unpaid.
- **`Booking.amount_due` is still only the station charge.** The bill total is
  `total_due` (`amount_due + items_total − discount_amount`, floored at zero);
  the close-out screen defaults to that. Anything reading `amount_due` alone will undercount a session with
  items on it.
- `apps/bookings/models.py` still defines `make_booking_code()`. It is dead
  code kept only because migration `0001` references it by name — deleting it
  breaks the migration graph.
- **A closing time earlier than the opening time means past midnight.** `10:00 →
  00:00` is "open till midnight", and both `_is_open_now()` and the availability
  endpoint handle the wrap.
- **Sales revenue is recognised on `completed_at`**, falling back to `start_at`
  for rows completed before that field existed (`apps/api/sales.py`). Money is
  counted when it changed hands, not when the slot was booked, so a sales figure
  will not match a naive `SUM(amount_collected)` grouped by `start_at`.
- **The counter offers Cash and UPI only** — two buttons is faster during a rush.
  `card` and `other` remain valid in `Booking.PaymentMethod` and in
  `ONLINE_METHODS`, so a card machine is one line in
  `admin-web/src/components/PaymentModal.jsx` with no migration; existing rows
  and the report already handle them.
- **Nothing fake is ever seeded.** `manage.py seed` creates the cafe's real
  configuration but no takings, so the Sales page starts genuinely empty and
  every number on it is money you actually took.
- The supplied logo ships on a solid black plate; both front-ends drop it out with
  `mix-blend-mode: lighten` rather than requiring a re-cut PNG.
