from django.db import models
from .validators import image_extension, validate_image_dimensions, validate_image_size


class LojaConfig(models.Model):
    nome = models.CharField("Nome da loja", max_length=80, default="Acessórios de celular")
    whatsapp = models.CharField("WhatsApp (DDI+DDD+número)", max_length=20, default="5511999999999")
    pix_key = models.CharField("Chave Pix", max_length=120, blank=True)
    suporte_email = models.EmailField("E-mail de suporte", blank=True)
    suporte_horario = models.CharField("Horário de atendimento", max_length=80, default="Seg–Sáb, 9h às 18h")
    stripe_modo = models.CharField(max_length=10, choices=[("test", "Teste"), ("live", "Produção")], default="test")

    class Meta:
        verbose_name = "Configuração da loja"
        verbose_name_plural = "Configuração da loja"

    def __str__(self):
        return self.nome


class Produto(models.Model):
    CATEGORIAS = [
        ("capas", "Capinhas"),
        ("peliculas", "Películas"),
        ("audio", "Áudio"),
        ("energia", "Energia"),
        ("suportes", "Suportes"),
    ]
    codigo = models.CharField("Código", max_length=20, unique=True)
    nome = models.CharField(max_length=120)
    categoria = models.CharField(max_length=20, choices=CATEGORIAS, default="capas")
    preco = models.DecimalField("Preço", max_digits=10, decimal_places=2)
    preco_antigo = models.DecimalField("Preço antigo", max_digits=10, decimal_places=2, null=True, blank=True)
    promocao_ativa = models.BooleanField("Em promoção", default=False)
    preco_promocional = models.DecimalField("Preço promocional", max_digits=10, decimal_places=2, null=True, blank=True)
    selo_promo = models.CharField("Selo da promoção", max_length=40, blank=True)
    estoque = models.PositiveIntegerField(default=0)
    compat = models.CharField("Compatibilidade", max_length=80, blank=True)
    descricao = models.TextField(blank=True)
    foto = models.ImageField(
        "Foto do produto",
        upload_to="produtos/",
        blank=True,
        validators=[image_extension, validate_image_size, validate_image_dimensions],
        help_text="JPG, PNG ou WebP. Máx. 3 MB. Mínimo 200×200.",
    )
    ativo = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Produto"
        verbose_name_plural = "Produtos"
        ordering = ["nome"]

    def __str__(self):
        return self.nome

    def preco_final(self):
        if self.promocao_ativa and self.preco_promocional:
            return self.preco_promocional
        return self.preco


class TicketSuporte(models.Model):
    STATUS = [
        ("novo", "Novo"),
        ("andamento", "Em andamento"),
        ("resolvido", "Resolvido"),
    ]
    nome = models.CharField(max_length=80)
    email = models.EmailField()
    whatsapp = models.CharField(max_length=20, blank=True)
    assunto = models.CharField(max_length=120)
    mensagem = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS, default="novo")
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ticket de suporte"
        verbose_name_plural = "Tickets de suporte"
        ordering = ["-criado_em"]

    def __str__(self):
        return f"{self.assunto} — {self.nome}"


class PedidoStripe(models.Model):
    STATUS = [
        ("pendente", "Pendente"),
        ("pago", "Pago"),
        ("falhou", "Falhou"),
        ("reembolsado", "Reembolsado"),
    ]
    codigo = models.CharField(max_length=20, unique=True)
    email = models.EmailField()
    total = models.DecimalField(max_digits=10, decimal_places=2)
    stripe_session_id = models.CharField(max_length=200, blank=True)
    stripe_payment_intent = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default="pendente")
    itens = models.JSONField(default=list, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Pedido Stripe"
        verbose_name_plural = "Pedidos Stripe"
        ordering = ["-criado_em"]

    def __str__(self):
        return f"{self.codigo} · {self.status}"
