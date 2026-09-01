# Acessórios de celular

Loja web de acessórios com carrinho, Pix, cartão (Mercado Pago), painel admin JWT, SQLite, PWA e pedido via WhatsApp.

## Instalação

1. Instale [Python 3.10+](https://www.python.org/downloads/).
2. Clone o repositório e entre na pasta:

```powershell
git clone https://github.com/SEU-USUARIO/nexo-loja.git
cd nexo-loja
```

3. Copie as configs (se ainda não existirem):

```powershell
copy admin-config.example.json admin-config.json
copy mp-config.example.json mp-config.json
```

4. Edite `admin-config.json` (senha, jwt_secret, WhatsApp) e, se for usar pagamento, `mp-config.json`.

5. Suba o servidor:

```powershell
py server.py
```

6. Abra:

- Loja: http://127.0.0.1:8080/index.html
- Admin: http://127.0.0.1:8080/admin.html
- WhatsApp: http://127.0.0.1:8080/whatsapp.html

Guia completo: `INSTALACAO.txt`.

## Aviso

Não publique no GitHub senha real, `jwt_secret` de produção nem Access Token do Mercado Pago.
