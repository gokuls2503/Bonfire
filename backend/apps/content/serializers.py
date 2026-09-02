from rest_framework import serializers

from .models import ContactMessage, FAQ, GalleryImage, SiteSettings, Testimonial


class SiteSettingsSerializer(serializers.ModelSerializer):
    full_address = serializers.CharField(read_only=True)

    class Meta:
        model = SiteSettings
        exclude = ["created_at", "updated_at"]


class GalleryImageSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = GalleryImage
        fields = ["id", "image", "caption", "category", "category_display", "sort_order", "is_active"]


class TestimonialSerializer(serializers.ModelSerializer):
    class Meta:
        model = Testimonial
        fields = ["id", "name", "handle", "avatar", "rating", "quote", "sort_order", "is_active"]


class FAQSerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQ
        fields = ["id", "question", "answer", "sort_order", "is_active"]


class ContactMessageSerializer(serializers.ModelSerializer):
    topic_display = serializers.CharField(source="get_topic_display", read_only=True)

    class Meta:
        model = ContactMessage
        fields = [
            "id", "name", "phone", "email", "topic", "topic_display", "message",
            "is_read", "is_archived", "created_at",
        ]


class PublicContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ["id", "name", "phone", "email", "topic", "message"]

    def validate(self, attrs):
        if not attrs.get("phone") and not attrs.get("email"):
            raise serializers.ValidationError(
                "Give us a phone number or an email so we can reply."
            )
        return attrs
