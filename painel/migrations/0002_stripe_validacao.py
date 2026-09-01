from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("painel", "0001_initial")]
    operations = [
        migrations.AddField(
            model_name="lojaconfig",
            name="stripe_modo",
            field=models.CharField(choices=[("test", "Teste"), ("live", "Produção")], default="test", max_length=10),
        ),
        migrations.CreateModel(
            name="PedidoStripe",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("codigo", models.CharField(max_length=20, unique=True)),
                ("email", models.EmailField(max_length=254)),
                ("total", models.DecimalField(decimal_places=2, max_digits=10)),
                ("stripe_session_id", models.CharField(blank=True, max_length=200)),
                ("stripe_payment_intent", models.CharField(blank=True, max_length=200)),
                ("status", models.CharField(choices=[("pendente", "Pendente"), ("pago", "Pago"), ("falhou", "Falhou"), ("reembolsado", "Reembolsado")], default="pendente", max_length=20)),
                ("itens", models.JSONField(blank=True, default=list)),
                ("criado_em", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-criado_em"], "verbose_name": "Pedido Stripe", "verbose_name_plural": "Pedidos Stripe"},
        ),
    ]
