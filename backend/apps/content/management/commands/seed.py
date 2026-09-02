"""Seed the database with Bonfire Gaming Hub's launch setup.

    python manage.py seed            # fill in anything missing, keep existing rows
    python manage.py seed --demo     # also create sample bookings/registrations
"""
from datetime import time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.bookings.models import Booking, BusinessHours
from apps.catalog.models import Game, PricingPlan, Station, StationType
from apps.content.models import FAQ, SiteSettings, Testimonial
from apps.tournaments.models import Tournament, TournamentRegistration

PC_SPECS = (
    "Ryzen 7 / RTX 4060 Ti 8GB / 32GB DDR5 / 1TB NVMe / 27\" 180Hz IPS"
)
PS5_SPECS = "PS5 Slim 1TB / 55\" 4K 120Hz TV / 2 DualSense controllers"


class Command(BaseCommand):
    help = "Seed Bonfire Gaming Hub with its launch configuration."

    def add_arguments(self, parser):
        parser.add_argument("--demo", action="store_true", help="Add sample bookings and teams.")

    @transaction.atomic
    def handle(self, *args, **options):
        site = self._site_settings()
        pc, ps5 = self._station_types()
        self._stations(pc, ps5)
        self._pricing(pc, ps5)
        self._hours()
        self._games(pc, ps5)
        self._faqs()
        self._testimonials()
        self._tournaments(pc, ps5)
        if options["demo"]:
            self._demo_data(pc, ps5)
        self.stdout.write(self.style.SUCCESS("Bonfire seed complete."))

    def _site_settings(self):
        site = SiteSettings.load()
        if not site.about_body:
            site.about_body = (
                "Bonfire started the way every good session does — a few friends, "
                "one screen, and nobody wanting to go home. We built the room we always "
                "wanted to play in: proper hardware, cold drinks, fast internet, and a "
                "tournament every week so there is always something to sharpen up for.\n\n"
                "Five high-spec battlestations, two PS5s, and a couch that has seen things."
            )
        site.tagline = site.tagline or "Where the game never dies out."
        site.hero_headline = "Fuel the fire."
        site.hero_subline = (
            "High-spec gaming PCs and PS5s, weekly tournaments, and a room built for squads."
        )
        site.booking_note = (
            "Pay at the counter when you arrive. Your seat is held for 15 minutes "
            "after the slot starts."
        )
        site.seo_title = site.seo_title or (
            "Bonfire Gaming Hub | Gaming cafe in Sundarapuram, Coimbatore"
        )
        site.seo_description = site.seo_description or (
            "Book high-spec gaming PCs and PS5 stations in Sundarapuram, Coimbatore. "
            "Weekly tournaments, squad-friendly seating, pay at the counter."
        )

        # Real contact details, so a fresh install is immediately correct.
        site.phone = site.phone or "+91 85319 19028"
        site.whatsapp = site.whatsapp or "918531919028"
        site.email = site.email or "bonfiregaminghub@gmail.com"
        site.instagram_url = site.instagram_url or "https://instagram.com/bonfiregaminghub"
        site.address_line1 = site.address_line1 or "Sundarapuram"
        site.city = site.city or "Coimbatore"
        site.state = site.state or "Tamil Nadu"
        site.postal_code = site.postal_code or "641024"
        if not site.map_embed_url:
            site.map_embed_url = (
                "https://www.google.com/maps?q="
                "Sundarapuram%2C%20Coimbatore%2C%20Tamil%20Nadu%20641024&output=embed"
            )
        if not site.directions_url:
            site.directions_url = (
                "https://www.google.com/maps/search/?api=1&query="
                "Sundarapuram%2C+Coimbatore%2C+Tamil+Nadu+641024"
            )
        site.save()
        self.stdout.write("  site settings ok")
        return site

    def _station_types(self):
        pc, _ = StationType.objects.get_or_create(
            name="Gaming PC",
            defaults={
                "short_description": "RTX battlestations on 180Hz panels.",
                "description": (
                    "Five identical high-spec rigs so nobody argues over who got the good "
                    "seat. Mechanical keyboards, wired mice, and a headset at every station."
                ),
                "icon": "monitor",
                "sort_order": 1,
            },
        )
        ps5, _ = StationType.objects.get_or_create(
            name="PS5 Console",
            defaults={
                "short_description": "Couch co-op on a 55\" 4K screen.",
                "description": (
                    "Two PS5 setups with big-screen TVs and four controllers between them. "
                    "Perfect for FIFA nights, fighting games and split-screen chaos."
                ),
                "icon": "gamepad",
                "max_players_per_station": 2,
                "sort_order": 2,
            },
        )
        return pc, ps5

    def _stations(self, pc, ps5):
        for i in range(1, 6):
            Station.objects.get_or_create(
                name=f"PC-{i:02d}",
                defaults={"station_type": pc, "specs": PC_SPECS,
                          "peripherals": "Mechanical KB / 8K-poll mouse / HyperX headset",
                          "sort_order": i},
            )
        for i in range(1, 3):
            Station.objects.get_or_create(
                name=f"PS5-{i:02d}",
                defaults={"station_type": ps5, "specs": PS5_SPECS,
                          "peripherals": "2 DualSense controllers", "sort_order": i},
            )
        self.stdout.write(f"  stations: {Station.objects.count()}")

    def _pricing(self, pc, ps5):
        plans = [
            (pc, "30 Minutes", 30, "40", "", 1, ""),
            (pc, "1 Hour", 60, "70", "Popular", 2, "The standard session."),
            (pc, "2 Hours", 120, "130", "", 3, "Save Rs 10."),
            (pc, "Happy Hour", 60, "50", "Weekday deal", 4, "Mon-Fri, 11am to 3pm."),
            (pc, "5-Hour Pack", 300, "300", "Best value", 5, "Use it in one sitting."),
            (ps5, "30 Minutes", 30, "50", "", 1, ""),
            (ps5, "1 Hour", 60, "90", "Popular", 2, "Up to 2 players."),
            (ps5, "2 Hours", 120, "170", "", 3, "Save Rs 10."),
            (ps5, "5-Hour Pack", 300, "400", "Best value", 4, "Bring the squad."),
        ]
        for st, name, mins, price, badge, order, desc in plans:
            plan, created = PricingPlan.objects.get_or_create(
                station_type=st, name=name,
                defaults={"duration_minutes": mins, "price": Decimal(price), "badge": badge,
                          "sort_order": order, "description": desc},
            )
            if created and name == "Happy Hour":
                plan.available_from = time(11, 0)
                plan.available_to = time(15, 0)
                plan.save()
        self.stdout.write(f"  pricing plans: {PricingPlan.objects.count()}")

    def _hours(self):
        for weekday in range(7):
            opens = time(11, 0) if weekday < 5 else time(10, 0)
            closes = time(23, 0) if weekday < 5 else time(0, 0)
            BusinessHours.objects.get_or_create(
                weekday=weekday, defaults={"opens_at": opens, "closes_at": closes},
            )
        self.stdout.write("  business hours ok")

    def _games(self, pc, ps5):
        catalogue = [
            ("Valorant", "FPS", [pc], True),
            ("Counter-Strike 2", "FPS", [pc], True),
            ("Apex Legends", "Battle royale", [pc], False),
            ("GTA V", "Open world", [pc, ps5], True),
            ("Fortnite", "Battle royale", [pc, ps5], False),
            ("Rocket League", "Sports", [pc, ps5], False),
            ("Forza Horizon 5", "Racing", [pc], False),
            ("Minecraft", "Sandbox", [pc], False),
            ("EA FC 26", "Sports", [ps5], True),
            ("Tekken 8", "Fighting", [ps5], True),
            ("Call of Duty: Warzone", "FPS", [pc, ps5], False),
            ("God of War Ragnarok", "Action", [ps5], False),
            ("Spider-Man 2", "Action", [ps5], False),
            ("Mortal Kombat 1", "Fighting", [ps5], False),
        ]
        for order, (title, genre, platforms, featured) in enumerate(catalogue, start=1):
            game, created = Game.objects.get_or_create(
                title=title,
                defaults={"genre": genre, "is_featured": featured, "sort_order": order},
            )
            if created:
                game.platforms.set(platforms)
        self.stdout.write(f"  games: {Game.objects.count()}")

    def _faqs(self):
        faqs = [
            ("Do I need to book ahead?",
             "Walk-ins are always welcome, but we only have 5 PCs and 2 PS5s — evenings "
             "and weekends fill up fast. Booking online holds your seat."),
            ("How do I pay?",
             "At the counter when you arrive. Cash and UPI both work. Nothing is charged online."),
            ("What happens if I'm late?",
             "We hold your station for 15 minutes past the slot start. After that it goes "
             "back into the pool."),
            ("Can I bring my own peripherals?",
             "Absolutely. Plug in your own mouse, keyboard or controller — just take it "
             "home with you."),
            ("Is there an age limit?",
             "Under-16s are welcome until 8pm. After that it's 16+ unless a parent is with you."),
            ("How do the weekly tournaments work?",
             "One event every week, entry is a small fee, and the prize pool is announced with "
             "each tournament. Register on the tournaments page — slots are limited."),
            ("Can I book the whole place for a party?",
             "Yes. Message us through the contact form with your date and headcount and we'll "
             "put a private session together."),
        ]
        for order, (q, a) in enumerate(faqs, start=1):
            FAQ.objects.get_or_create(question=q, defaults={"answer": a, "sort_order": order})
        self.stdout.write(f"  faqs: {FAQ.objects.count()}")

    def _testimonials(self):
        quotes = [
            ("Arjun R.", "@arjun.aims", 5,
             "Finally a cafe where the PCs actually hold 200fps. No stutter, no thermal "
             "throttle, no excuses. My Valorant rank thanks them."),
            ("Meera K.", "", 5,
             "Came for one hour with two friends, stayed four. The PS5 corner with the big "
             "screen is dangerously comfortable."),
            ("Sanjay P.", "@sanjayplays", 5,
             "The weekly tournament is the best thing about this place. Actual brackets, "
             "actual prizes, actual competition."),
        ]
        for order, (name, handle, rating, quote) in enumerate(quotes, start=1):
            Testimonial.objects.get_or_create(
                name=name,
                defaults={"handle": handle, "rating": rating, "quote": quote, "sort_order": order},
            )
        self.stdout.write(f"  testimonials: {Testimonial.objects.count()}")

    def _tournaments(self, pc, ps5):
        now = timezone.localtime()
        # Next Saturday, 6pm.
        days_ahead = (5 - now.weekday()) % 7 or 7
        saturday = (now + timedelta(days=days_ahead)).replace(
            hour=18, minute=0, second=0, microsecond=0
        )
        events = [
            {
                "title": "Bonfire Friday Night Valorant 5v5",
                "game": "Valorant",
                "platform": pc,
                "tagline": "Five rigs, five players, one bracket. Winner takes the pot.",
                "format": Tournament.Format.SINGLE_ELIM,
                "team_size": 5,
                "max_teams": 8,
                "starts_at": saturday - timedelta(days=1),
                "entry_fee": Decimal("500"),
                "prize_pool": Decimal("3000"),
                "prize_breakdown": "1st - Rs 2000\n2nd - Rs 1000\nMVP - 2 free hours",
                "is_recurring_weekly": True,
                "is_featured": True,
                "rules": (
                    "Standard competitive map pool. Best of one until the final, "
                    "best of three for the final. No coaching between rounds. "
                    "Peripherals allowed. Be at the venue 20 minutes before start."
                ),
            },
            {
                "title": "EA FC 26 Saturday Showdown",
                "game": "EA FC 26",
                "platform": ps5,
                "tagline": "Solo knockout on the PS5s. Bragging rights and a cash prize.",
                "format": Tournament.Format.SINGLE_ELIM,
                "team_size": 1,
                "max_teams": 16,
                "starts_at": saturday,
                "entry_fee": Decimal("150"),
                "prize_pool": Decimal("1500"),
                "prize_breakdown": "1st - Rs 1000\n2nd - Rs 500",
                "is_recurring_weekly": True,
                "is_featured": True,
                "rules": (
                    "6-minute halves, legendary difficulty off, custom teams disabled. "
                    "Golden goal in extra time. Controller provided, bring your own if you prefer."
                ),
            },
            {
                "title": "Tekken 8 Sunday Ladder",
                "game": "Tekken 8",
                "platform": ps5,
                "tagline": "First to 3. Losers bracket runs all evening.",
                "format": Tournament.Format.DOUBLE_ELIM,
                "team_size": 1,
                "max_teams": 12,
                "starts_at": saturday + timedelta(days=1, hours=-1),
                "entry_fee": Decimal("100"),
                "prize_pool": Decimal("1000"),
                "prize_breakdown": "1st - Rs 700\n2nd - Rs 300",
                "is_recurring_weekly": True,
                "rules": "First to 3 rounds, double elimination. All characters legal.",
            },
        ]
        for data in events:
            Tournament.objects.get_or_create(
                title=data["title"],
                defaults={
                    **data,
                    "status": Tournament.Status.OPEN,
                    "registration_closes_at": data["starts_at"] - timedelta(hours=4),
                    "venue_note": "At the hub. Arrive 20 minutes early for check-in.",
                },
            )
        self.stdout.write(f"  tournaments: {Tournament.objects.count()}")

    def _demo_data(self, pc, ps5):
        if Booking.objects.exists():
            self.stdout.write("  demo bookings skipped (bookings already exist)")
            return
        now = timezone.localtime().replace(minute=0, second=0, microsecond=0)
        samples = [
            ("Rahul Menon", "9876543210", pc, 2, 1, "confirmed"),
            ("Divya S", "9876500011", ps5, 3, 1, "pending"),
            ("Karthik & squad", "9812345678", pc, 5, 3, "confirmed"),
            ("Nikhil V", "9900112233", ps5, 26, 1, "pending"),
        ]
        for name, phone, st, hours_ahead, seats, st_status in samples:
            plan = st.pricing_plans.filter(name="1 Hour").first()
            Booking.objects.create(
                full_name=name, phone=phone, station_type=st, pricing_plan=plan,
                start_at=now + timedelta(hours=hours_ahead), duration_minutes=60,
                seats=seats, status=st_status,
                amount_due=(plan.price * seats) if plan else 0,
            )
        first = Tournament.objects.filter(status="open").first()
        if first:
            teams = [
                ("Ember Five", "Aditya N", "9871112222"),
                ("Null Pointer", "Sneha R", "9873334444"),
                ("Late Rotate", "Vishal K", "9875556666"),
            ]
            for team, captain, phone in teams:
                TournamentRegistration.objects.get_or_create(
                    tournament=first, phone=phone,
                    defaults={"team_name": team, "captain_name": captain, "status": "confirmed"},
                )
        self.stdout.write("  demo bookings and registrations created")
