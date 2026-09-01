from django.contrib import admin
from django.utils.html import format_html
from .models import LojaConfig, PedidoStripe, Produto, TicketSuporte


@admin.register(LojaConfig)
class LojaConfigAdmin(admin.ModelAdmin):
    list_display = ("nome", "whatsapp", "pix_key", "suporte_horario")


@admin.register(Produto)
class ProdutoAdmin(admin.ModelAdmin):
    list_display = ("thumb", "nome", "categoria", "preco", "preco_promocional", "promocao_ativa", "estoque", "ativo")
    list_editable = ("preco", "preco_promocional", "promocao_ativa", "estoque", "ativo")
    list_filter = ("categoria", "promocao_ativa", "ativo")
    search_fields = ("nome", "codigo", "compat")
    fields = (
        "codigo", "nome", "categoria", "foto",
        "preco", "preco_antigo", "promocao_ativa", "preco_promocional", "selo_promo",
        "estoque", "compat", "descricao", "ativo",
    )

    def thumb(self, obj):
        if obj.foto:
            return format_html('<img src="{}" style="height:40px;width:40px;object-fit:cover;border-radius:8px">', obj.foto.url)
        return "—"
    thumb.short_description = "Foto"


@admin.register(TicketSuporte)
class TicketSuporteAdmin(admin.ModelAdmin):
    list_display = ("assunto", "nome", "email", "whatsapp", "status", "criado_em")
    list_editable = ("status",)
    list_filter = ("status",)
    search_fields = ("nome", "email", "assunto", "mensagem")


@admin.register(PedidoStripe)
class PedidoStripeAdmin(admin.ModelAdmin):
    list_display = ("codigo", "email", "total", "status", "stripe_session_id", "criado_em")
    list_filter = ("status",)
    search_fields = ("codigo", "email", "stripe_session_id")
    readonly_fields = ("stripe_session_id", "stripe_payment_intent", "criado_em")
