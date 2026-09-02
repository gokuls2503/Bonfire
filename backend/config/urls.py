from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

admin.site.site_header = "Bonfire Gaming Hub"
admin.site.site_title = "Bonfire admin"
admin.site.index_title = "Cafe operations"


def health(_request):
    return JsonResponse({"status": "ok", "service": "bonfire-api"})


urlpatterns = [
    path("healthz/", health),
    path("django-admin/", admin.site.urls),
    path("api/", include("apps.api.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
