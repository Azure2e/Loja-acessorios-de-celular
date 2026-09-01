from django.contrib import admin
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from painel import views

admin.site.site_header = "Painel Acessórios de celular"
admin.site.site_title = "Admin da loja"
admin.site.index_title = "Produtos, promoções, fotos e suporte"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("suporte/", views.suporte, name="suporte"),
    path("api/catalog", views.catalogo_api),
    path("api/catalog/", views.catalogo_api),
    path("api/stripe/checkout", views.stripe_checkout),
    path("api/stripe/webhook", views.stripe_webhook),
]
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
