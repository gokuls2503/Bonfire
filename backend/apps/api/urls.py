from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenVerifyView

from . import sales as sales_views
from . import views_admin as adm
from . import views_memberships as memb
from . import views_public as pub
from . import views_shop as shop

router = DefaultRouter()
router.register("station-types", adm.StationTypeViewSet, basename="station-type")
router.register("stations", adm.StationViewSet, basename="station")
router.register("pricing-plans", adm.PricingPlanViewSet, basename="pricing-plan")
router.register("controller-rates", adm.ControllerRateViewSet, basename="controller-rate")
router.register("games", adm.GameViewSet, basename="game")
router.register("customers", adm.CustomerViewSet, basename="customer")
router.register("bookings", adm.BookingViewSet, basename="booking")
router.register("tournaments", adm.TournamentViewSet, basename="tournament")
router.register("registrations", adm.TournamentRegistrationViewSet, basename="registration")
router.register("gallery", adm.GalleryImageViewSet, basename="gallery")
router.register("testimonials", adm.TestimonialViewSet, basename="testimonial")
router.register("faqs", adm.FAQViewSet, basename="faq")
router.register("business-hours", adm.BusinessHoursViewSet, basename="business-hours")
router.register("closures", adm.ClosureViewSet, basename="closure")
router.register("messages", adm.ContactMessageViewSet, basename="message")
router.register("product-categories", shop.ProductCategoryViewSet, basename="product-category")
router.register("products", shop.ProductViewSet, basename="product")
router.register("bill-items", shop.BillItemViewSet, basename="bill-item")
router.register("counter-sales", shop.CounterSaleViewSet, basename="counter-sale")
router.register("membership-plans", memb.MembershipPlanViewSet, basename="membership-plan")
router.register("memberships", memb.MembershipViewSet, basename="membership")

public_patterns = [
    path("bootstrap/", pub.site_bootstrap, name="public-bootstrap"),
    path("availability/", pub.availability, name="public-availability"),
    path("bookings/", pub.PublicBookingCreate.as_view(), name="public-booking-create"),
    path("bookings/<str:code>/", pub.booking_lookup, name="public-booking-lookup"),
    path("bookings/<str:code>/cancel/", pub.cancel_booking, name="public-booking-cancel"),
    path("tournaments/", pub.PublicTournamentList.as_view(), name="public-tournaments"),
    path("tournaments/<slug:slug>/", pub.PublicTournamentDetail.as_view(), name="public-tournament"),
    path("registrations/", pub.PublicRegistrationCreate.as_view(), name="public-registration"),
    path("contact/", pub.PublicContactCreate.as_view(), name="public-contact"),
]

admin_patterns = [
    path("dashboard/", adm.dashboard, name="admin-dashboard"),
    path("sales/", sales_views.sales, name="admin-sales"),
    path("sales/transactions/", sales_views.sales_transactions, name="admin-sales-transactions"),
    path("shop/summary/", shop.shop_summary, name="admin-shop-summary"),
    path("shop/quick-sale/", shop.quick_sale, name="admin-shop-quick-sale"),
    path("memberships/summary/", memb.membership_summary, name="admin-membership-summary"),
    path("me/", adm.me, name="admin-me"),
    path("site-settings/", adm.SiteSettingsView.as_view(), name="admin-site-settings"),
    path("", include(router.urls)),
]

urlpatterns = [
    path("public/", include(public_patterns)),
    path("admin/", include(admin_patterns)),
    path("auth/token/", TokenObtainPairView.as_view(), name="token-obtain"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/token/verify/", TokenVerifyView.as_view(), name="token-verify"),
]
