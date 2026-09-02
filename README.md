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
- **Find my booking** — look up by code, cancel with a matching phone number
- Gallery, testimonials, FAQ, opening hours, map and contact form
- All copy, images, hours, rates and contact details come from the API, so the
  owner changes them in the admin, not in code

### Admin console (`admin-web/`)
- **Dashboard** — today's bookings, who's playing, revenue, 7-day trend, live
  floor map, "needs attention" queue, next tournament
- **Bookings** — filter by date/status/search, create walk-ins, and the full
  lifecycle: confirm → check in → complete (which frees the station and records
  payment), plus cancel and no-show
- **Floor** — one tap per station to flip it between available and maintenance;
  complete a session or check someone in without leaving the screen
- **Stations** — add platforms (Gaming PC, PS5, and whatever comes next) and
  individual stations. New hardware immediately increases public booking capacity.
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
GET  /api/public/bookings/<code>/           look one up
POST /api/public/bookings/<code>/cancel/    cancel with a matching phone
GET  /api/public/tournaments/?scope=upcoming|past|all
GET  /api/public/tournaments/<slug>/
POST /api/public/registrations/
POST /api/public/contact/
```

Admin (staff JWT via `POST /api/auth/token/`):

```
GET   /api/admin/dashboard/
CRUD  /api/admin/{bookings,stations,station-types,pricing-plans,games,customers,
                  tournaments,registrations,gallery,testimonials,faqs,
                  business-hours,closures,messages}/
GET   /api/admin/site-settings/     PATCH to edit (multipart for images)
POST  /api/admin/bookings/<id>/{confirm,check_in,complete,cancel,no_show}/
POST  /api/admin/stations/<id>/set_status/
POST  /api/admin/tournaments/<id>/duplicate/
POST  /api/admin/registrations/<id>/set_status/
```

Access tokens last 8 hours and refresh automatically in the admin app.

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
- **A closing time earlier than the opening time means past midnight.** `10:00 →
  00:00` is "open till midnight", and both `_is_open_now()` and the availability
  endpoint handle the wrap.
- The supplied logo ships on a solid black plate; both front-ends drop it out with
  `mix-blend-mode: lighten` rather than requiring a re-cut PNG.
