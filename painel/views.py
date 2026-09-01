from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.csrf import csrf_exempt
from .models import LojaConfig, Produto, TicketSuporte


def _cfg():
    obj = LojaConfig.objects.first()
    if not obj:
        obj = LojaConfig.objects.create()
    return obj


def suporte(request):
    cfg = _cfg()
    ok = False
    if request.method == "POST":
        TicketSuporte.objects.create(
            nome=request.POST.get("nome") or "Cliente",
            email=request.POST.get("email") or "cliente@email.com",
            whatsapp=request.POST.get("whatsapp") or "",
            assunto=request.POST.get("assunto") or "Atendimento",
            mensagem=request.POST.get("mensagem") or "",
        )
        ok = True
    return render(request, "painel/suporte.html", {"cfg": cfg, "ok": ok})


def catalogo_api(request):
    cfg = _cfg()
    produtos = []
    for p in Produto.objects.filter(ativo=True):
        produtos.append({
            "id": p.codigo,
            "name": p.nome,
            "category": p.categoria,
            "price": float(p.preco_promocional if p.promocao_ativa and p.preco_promocional else p.preco),
            "old": float(p.preco) if p.promocao_ativa and p.preco_promocional else (float(p.preco_antigo) if p.preco_antigo else None),
            "promo": p.promocao_ativa,
            "selo": p.selo_promo,
            "stock": p.estoque,
            "compat": p.compat,
            "desc": p.descricao,
            "image": p.foto.url if p.foto else "",
        })
    return JsonResponse({
        "settings": {"name": cfg.nome, "whatsapp": cfg.whatsapp, "pix_key": cfg.pix_key},
        "products": produtos,
    })


import json
import uuid
from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from .models import PedidoStripe, Produto


@csrf_exempt
def stripe_checkout(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)
    secret = getattr(settings, "STRIPE_SECRET_KEY", "") or ""
    if not secret:
        return JsonResponse({"error": "Configure STRIPE_SECRET_KEY no ambiente ou nexo/settings.py"}, status=400)
    try:
        import stripe
    except ImportError:
        return JsonResponse({"error": "Instale stripe: py -m pip install stripe"}, status=500)
    body = json.loads(request.body.decode() or "{}")
    items = body.get("items") or []
    email = body.get("email") or "cliente@email.com"
    line_items = []
    total = 0
    saved_items = []
    for item in items:
        codigo = item.get("id")
        qty = int(item.get("qty") or 1)
        prod = Produto.objects.filter(codigo=codigo, ativo=True).first()
        if not prod:
            continue
        price = prod.preco_final()
        total += float(price) * qty
        saved_items.append({"id": prod.codigo, "name": prod.nome, "qty": qty, "price": float(price)})
        line_items.append({
            "quantity": qty,
            "price_data": {
                "currency": "brl",
                "unit_amount": int(round(float(price) * 100)),
                "product_data": {"name": prod.nome},
            },
        })
    if not line_items:
        return JsonResponse({"error": "Carrinho vazio ou produto inválido"}, status=400)
    stripe.api_key = secret
    codigo = "ST" + uuid.uuid4().hex[:8].upper()
    session = stripe.checkout.Session.create(
        mode="payment",
        customer_email=email,
        line_items=line_items,
        success_url=body.get("success_url") or "http://127.0.0.1:8000/index.html?stripe=ok",
        cancel_url=body.get("cancel_url") or "http://127.0.0.1:8000/index.html?stripe=cancel",
        metadata={"codigo": codigo},
    )
    PedidoStripe.objects.create(
        codigo=codigo, email=email, total=total,
        stripe_session_id=session.id, status="pendente", itens=saved_items,
    )
    return JsonResponse({"id": session.id, "url": session.url, "codigo": codigo})


@csrf_exempt
def stripe_webhook(request):
    secret = getattr(settings, "STRIPE_WEBHOOK_SECRET", "") or ""
    payload = request.body
    sig = request.META.get("HTTP_STRIPE_SIGNATURE", "")
    try:
        import stripe
    except ImportError:
        return HttpResponse(status=500)
    stripe.api_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    try:
        if secret:
            event = stripe.Webhook.construct_event(payload, sig, secret)
        else:
            event = json.loads(payload.decode() or "{}")
    except Exception:
        return HttpResponse(status=400)
    etype = event.get("type") if isinstance(event, dict) else getattr(event, "type", "")
    data = event.get("data", {}).get("object", {}) if isinstance(event, dict) else event.data.object
    session_id = data.get("id") if isinstance(data, dict) else getattr(data, "id", "")
    if etype == "checkout.session.completed":
        PedidoStripe.objects.filter(stripe_session_id=session_id).update(status="pago")
    return HttpResponse(status=200)
