from rest_framework.permissions import BasePermission


class IsStaffUser(BasePermission):
    """Only cafe staff (Django staff flag) may touch the admin API."""

    message = "Staff access required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)
