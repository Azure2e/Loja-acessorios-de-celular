import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { CATEGORIES, CAT_NAME, PRODUCTS, PIX, buildPixCode, load, money, save, webp } from "./data.js";

const ease = [0.22, 1, 0.36, 1];
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease } }
};
const stagger = { show: { transition: { staggerChildren: 0.06 } } };

function Pic({ src, alt, className, eager }) {
  return (
    <picture>
      <source type="image/webp" srcSet={webp(src)} />
      <img
        src={src}
        alt={alt || ""}
        className={className}
        width="800"
        height="600"
        decoding="async"
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "low"}
      />
    </picture>
  );
}

function initialTheme() {
  try {
    const saved = localStorage.getItem("nexo_theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function App() {
  const [theme, setTheme] = useState(initialTheme);
  const [category, setCategory] = useState("todas");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("destaque");
  const [catalog, setCatalog] = useState(PRODUCTS);
  const [cart, setCart] = useState(() => load("nexo_cart", []));
  const [stock, setStock] = useState(() => load("nexo_stock", Object.fromEntries(catalog.map((p) => [p.id, p.stock]))));
  const [orders, setOrders] = useState(() => load("nexo_orders", []));
  const [cartOpen, setCartOpen] = useState(false);
  const [product, setProduct] = useState(null);
  const [checkout, setCheckout] = useState(false);
  const [payStep, setPayStep] = useState("form");
  const [pending, setPending] = useState(null);
  const [pixCode, setPixCode] = useState("");
  const [pixQr, setPixQr] = useState("");
  const [pixId, setPixId] = useState("");
  const [pixStatus, setPixStatus] = useState("");
  const [pixSource, setPixSource] = useState("local");
  const [pixLeft, setPixLeft] = useState(15 * 60);
  const [paying, setPaying] = useState(false);
  const [mpKey, setMpKey] = useState("");
  const [cardMsg, setCardMsg] = useState("");
  const [admin, setAdmin] = useState(false);
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);
  const [installEvt, setInstallEvt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("nexo_theme", theme); } catch {}
  }, [theme]);
  useEffect(() => {
    fetch("/api/catalog").then((r) => r.json()).then((d) => {
      if (d.products && d.products.length) {
        setCatalog(d.products);
        setStock(Object.fromEntries(d.products.map((p) => [p.id, Number(p.stock) || 0])));
      }
    }).catch(() => {});
  }, []);
  useEffect(() => save("nexo_cart", cart), [cart]);
  useEffect(() => save("nexo_stock", stock), [stock]);
  useEffect(() => save("nexo_orders", orders), [orders]);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (standalone) setInstalled(true);
    const onPrompt = (e) => { e.preventDefault(); setInstallEvt(e); };
    const onInstalled = () => { setInstalled(true); setInstallEvt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (payStep !== "card" || !pending) return;
    let formCtl = null;
    let dead = false;
    (async () => {
      try {
        if (!window.MercadoPago) {
          await new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://sdk.mercadopago.com/js/v2";
            s.onload = resolve;
            s.onerror = reject;
            document.body.appendChild(s);
          });
        }
        const status = await fetch("/api/mp/status").then((r) => r.json());
        const key = status.public_key || mpKey;
        if (!key) {
          setCardMsg("Falta a public_key do Mercado Pago no mp-config.json");
          return;
        }
        const mp = new window.MercadoPago(key, { locale: "pt-BR" });
        formCtl = mp.cardForm({
          amount: String(pending.total.toFixed(2)),
          iframe: true,
          form: {
            id: "form-card",
            cardNumber: { id: "form-checkout__cardNumber", placeholder: "Número do cartão" },
            expirationDate: { id: "form-checkout__expirationDate", placeholder: "MM/AA" },
            securityCode: { id: "form-checkout__securityCode", placeholder: "CVV" },
            cardholderName: { id: "form-checkout__cardholderName", placeholder: "Nome no cartão" },
            issuer: { id: "form-checkout__issuer", placeholder: "Banco emissor" },
            installments: { id: "form-checkout__installments", placeholder: "Parcelas" },
            identificationType: { id: "form-checkout__identificationType" },
            identificationNumber: { id: "form-checkout__identificationNumber", placeholder: "CPF" }
          },
          callbacks: {
            onFormMounted: (err) => { if (err) setCardMsg("Não foi possível carregar o formulário"); },
            onSubmit: async (event) => {
              event.preventDefault();
              if (dead) return;
              setPaying(true);
              setCardMsg("");
              try {
                const card = formCtl.getCardFormData();
                const pay = await api("/api/mp/card", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    token: card.token,
                    payment_method_id: card.paymentMethodId,
                    issuer_id: card.issuerId,
                    installments: Number(card.installments || 1),
                    identification_type: card.identificationType,
                    identification_number: card.identificationNumber,
                    email: pending.customer.email,
                    nome: pending.customer.nome,
                    amount: pending.total,
                    order_id: pending.id,
                    description: "Pedido " + pending.id
                  })
                });
                if (pay.status === "approved") {
                  finishOrder({ ...pending, status: "Pago no cartão", mpId: pay.id });
                } else if (pay.status === "in_process" || pay.status === "pending") {
                  setCardMsg("Pagamento em análise: " + (pay.status_detail || pay.status));
                  setPaying(false);
                } else {
                  setCardMsg("Recusado: " + (pay.status_detail || pay.status || "verifique os dados"));
                  setPaying(false);
                }
              } catch (err) {
                setCardMsg(err.message);
                setPaying(false);
              }
            }
          }
        });
      } catch (err) {
        setCardMsg("SDK do Mercado Pago não carregou. " + err.message);
      }
    })();
    return () => { dead = true; try { formCtl && formCtl.unmount && formCtl.unmount(); } catch {} };
  }, [payStep]);

  useEffect(() => {
    if (payStep !== "pix" || !pixId || pixSource !== "mercadopago") return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/mp/payment/" + pixId);
        const data = await res.json();
        if (stop) return;
        if (data.status) setPixStatus(data.status);
        if (data.status === "approved" && pending) {
          finishOrder({ ...pending, status: "Pago via Mercado Pago", mpId: pixId });
        }
      } catch {}
    };
    tick();
    const n = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(n); };
  }, [payStep, pixId, pixSource]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = catalog.filter((p) => {
      if (category !== "todas" && p.category !== category) return false;
      if (!q) return true;
      return (p.name + " " + p.compat + " " + p.desc + " " + p.category).toLowerCase().includes(q);
    });
    if (sort === "menor") out = [...out].sort((a, b) => a.price - b.price);
    if (sort === "maior") out = [...out].sort((a, b) => b.price - a.price);
    if (sort === "nome") out = [...out].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return out;
  }, [category, search, sort, catalog]);

  const byId = useMemo(() => Object.fromEntries(catalog.map((p) => [p.id, p])), [catalog]);
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const sum = cart.reduce((s, i) => s + (byId[i.id] ? byId[i.id].price * i.qty : 0), 0);

  function add(id) {
    const available = stock[id] ?? 0;
    const item = cart.find((i) => i.id === id);
    if ((item ? item.qty + 1 : 1) > available) return setToast("Estoque insuficiente");
    setCart(item ? cart.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i)) : [...cart, { id, qty: 1 }]);
    setToast("Adicionado ao carrinho");
  }
  function changeQty(id, delta) {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
        .map((i) => ({ ...i, qty: Math.min(i.qty, stock[i.id] ?? 0) }))
    );
  }
  useEffect(() => {
    if (payStep !== "pix") return;
    setPixLeft(15 * 60);
    const t = setInterval(() => {
      setPixLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [payStep, pixCode]);

  function closeCheckout() {
    setCheckout(false);
    setPayStep("form");
    setPending(null);
    setPixCode("");
    setPixQr("");
    setPixId("");
    setPixStatus("");
    setPaying(false);
  }

  async function api(path, options) {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || data.error || data.cause?.[0]?.description || "Falha na API";
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return data;
  }

  async function startCheckout(data) {
    for (const item of cart) {
      if (item.qty > (stock[item.id] ?? 0)) return setToast("Estoque insuficiente");
    }
    const id = "NX" + Date.now().toString().slice(-6);
    const items = cart.map((i) => ({
      id: i.id,
      title: byId[i.id].name,
      quantity: i.qty,
      unit_price: Number(byId[i.id].price.toFixed(2)),
      currency_id: "BRL"
    }));
    const draft = {
      id,
      date: new Date().toLocaleString("pt-BR"),
      customer: data,
      items: cart.map((i) => ({ id: i.id, name: byId[i.id].name, qty: i.qty, price: byId[i.id].price })),
      total: sum,
      status: data.pagamento === "Pix" ? "Aguardando Pix" : "Aguardando pagamento"
    };
    if (data.pagamento === "Cartão") {
      setPending(draft);
      setCardMsg("");
      try {
        const st = await api("/api/mp/status");
        setMpKey(st.public_key || "");
        if (!st.configured) throw new Error("Configure access_token e public_key em mp-config.json");
      } catch (err) {
        setToast("Cartão precisa do Mercado Pago. " + err.message);
        return;
      }
      setPayStep("card");
      return;
    }
    if (data.pagamento === "Pix") {
      setPending(draft);
      setPayStep("pix");
      setPaying(true);
      try {
        const pay = await api("/api/mp/pix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: sum,
            email: data.email,
            nome: data.nome,
            order_id: id,
            description: "Pedido " + id
          })
        });
        setPixSource("mercadopago");
        setPixId(String(pay.id || ""));
        setPixCode(pay.qr_code || buildPixCode(sum, id));
        setPixQr(pay.qr_base64 || "");
        setPixStatus(pay.status || "pending");
        setToast("Pix gerado pelo Mercado Pago");
      } catch (err) {
        setPixSource("local");
        setPixCode(buildPixCode(sum, id));
        setPixQr("");
        setPixStatus("pending");
        setToast("Mercado Pago offline. Pix local: " + err.message);
      }
      setPaying(false);
      return;
    }
    finishOrder({ ...draft, status: "Pago" });
  }

  function finishOrder(order) {
    const next = { ...stock };
    order.items.forEach((i) => { next[i.id] -= i.qty; });
    setStock(next);
    setOrders((o) => [order, ...o]);
    setCart([]);
    closeCheckout();
    fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order) }).catch(() => {});
    setToast(order.status === "Pago" ? "Pedido " + order.id + " confirmado!" : "Pedido " + order.id + " registrado.");
  }

  function confirmPix() {
    if (!pending) return;
    finishOrder({ ...pending, status: "Pago via Pix", paidAt: new Date().toLocaleString("pt-BR") });
  }

  function copyPix() {
    const done = () => setToast("Código Pix copiado");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pixCode).then(done).catch(() => fallbackCopy());
    } else fallbackCopy();
    function fallbackCopy() {
      const el = document.createElement("textarea");
      el.value = pixCode;
      document.body.appendChild(el);
      el.select();
      try { document.execCommand("copy"); } catch {}
      el.remove();
      done();
    }
  }

  function clock(s) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }

  return (
    <LayoutGroup>
      <div className="topbar">
        <div className="wrap">
          <p>Parcelamento em até 6x sem juros</p>
          <p className="muted hide-sm">Atendimento: Seg–Sáb, 9h às 18h</p>
        </div>
      </div>

      <header className="site">
        <div className="wrap">
          <button className="menu" aria-label="Menu" onClick={() => setMenu((v) => !v)}>☰</button>
          <a href="#inicio" className="logo">
            <span className="mark">NX</span>
            <span className="logo-name">Acessórios de celular</span>
          </a>
          <nav className="desk">
            <a href="#inicio">Início</a>
            <a href="#catalogo">Catálogo</a>
            <a href="#categorias">Categorias</a>
            <a href="#sobre">Sobre</a>
            <a href="#baixar-app">Baixar app</a>
            <button type="button" onClick={() => setAdmin(true)}>Painel</button>
          </nav>
          <div className="grow" />
          <div className="search">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar capa, fone, cabo..." />
          </div>
          <motion.button className="icon-btn" type="button" aria-label="Tema" whileTap={{ scale: 0.9 }} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <motion.span id="themeIcon" animate={{ rotate: theme === "dark" ? 180 : 0 }}>{theme === "dark" ? "☀" : "☾"}</motion.span>
          </motion.button>
          <motion.button className="icon-btn" type="button" aria-label="Carrinho" whileTap={{ scale: 0.9 }} onClick={() => setCartOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 3h2l.4 2M7 13h10l3-8H6.4M7 13L5.4 5M7 13l-2 6h14M10 21a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0z"/></svg>
            <AnimatePresence>
              {count > 0 && (
                <motion.span className="badge" key={count} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>{count}</motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
        <input className="search-m" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produtos..." />
      </header>

      <AnimatePresence>
        {menu && (
          <motion.div className="mobile-nav" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <a href="#inicio" onClick={() => setMenu(false)}>Início</a>
            <a href="#catalogo" onClick={() => setMenu(false)}>Catálogo</a>
            <a href="#categorias" onClick={() => setMenu(false)}>Categorias</a>
            <a href="#sobre" onClick={() => setMenu(false)}>Sobre</a>
            <a href="#baixar-app" onClick={() => setMenu(false)}>Baixar app</a>
            <button type="button" onClick={() => { setAdmin(true); setMenu(false); }}>Painel da loja</button>
          </motion.div>
        )}
      </AnimatePresence>

      <main>
        <section id="inicio" className="hero wrap">
          <motion.div className="hero-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease }}>
            <div>
              <p className="kicker">Loja de acessórios</p>
              <h1>Proteja, carregue e personalize o seu celular.</h1>
              <p className="lead">Capinhas, películas, fones, carregadores e power banks para iPhone, Samsung, Xiaomi e outros.</p>
              <div className="actions">
                <motion.a className="btn btn-accent" href="#catalogo" whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>Ver produtos</motion.a>
                <motion.a className="btn btn-ghost" href="#categorias" whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>Explorar categorias</motion.a>
              </div>
            </div>
            <div className="hero-art">
              <motion.div className="a" style={{ position: "absolute", right: "1rem", top: ".5rem", width: "10rem" }} initial={{ opacity: 0, rotate: 0, y: 20 }} animate={{ opacity: 1, rotate: 6, y: 0 }} transition={{ delay: 0.15 }}>
                <Pic src="images/capa-silicone.jpg" alt="Capa premium" eager />
              </motion.div>
              <motion.div className="b" style={{ position: "absolute", left: "2rem", bottom: ".5rem", width: "11rem" }} initial={{ opacity: 0, rotate: 0, y: 20 }} animate={{ opacity: 1, rotate: -3, y: 0 }} transition={{ delay: 0.28 }}>
                <Pic src="images/fones.jpg" alt="Fones" />
              </motion.div>
            </div>
          </motion.div>
        </section>

        <section id="categorias" className="section wrap">
          <h2>Categorias</h2>
          <p className="sub">Encontre o acessório certo em poucos cliques</p>
          <motion.div className="cats" variants={stagger} initial="hidden" animate="show">
            {CATEGORIES.filter((c) => c.id !== "todas").map((c) => (
              <motion.button key={c.id} className="cat" variants={fadeUp} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }} onClick={() => { setCategory(c.id); document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" }); }}>
                <div className="ico">{c.icon}</div>
                <b>{c.name}</b>
                <small>{catalog.filter((p) => p.category === c.id).length} itens</small>
              </motion.button>
            ))}
          </motion.div>
        </section>

        <section id="catalogo" className="section wrap">
          <div className="toolbar">
            <div>
              <h2>Catálogo</h2>
              <p className="sub">{list.length} produto{list.length === 1 ? "" : "s"} encontrado{list.length === 1 ? "" : "s"}</p>
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
              <option value="destaque">Mais relevantes</option>
              <option value="menor">Menor preço</option>
              <option value="maior">Maior preço</option>
              <option value="nome">A–Z</option>
            </select>
          </div>
          <div className="chips">
            {CATEGORIES.map((c) => (
              <motion.button key={c.id} className={"chip" + (category === c.id ? " on" : "")} whileTap={{ scale: 0.96 }} onClick={() => setCategory(c.id)}>{c.name}</motion.button>
            ))}
          </div>
          <motion.div className="grid-products" layout>
            <AnimatePresence mode="popLayout">
              {list.map((p) => {
                const st = stock[p.id] ?? 0;
                return (
                  <motion.article
                    layout
                    key={p.id}
                    className="card"
                    variants={fadeUp}
                    initial="hidden"
                    animate="show"
                    exit={{ opacity: 0, scale: 0.96 }}
                    whileHover={{ y: -4 }}
                  >
                    <button className="thumb" onClick={() => setProduct(p)}>
                      <motion.div whileHover={{ scale: 1.04 }}>
                        <Pic src={p.image} alt={p.name} />
                      </motion.div>
                    </button>
                    <div className="body">
                      <p className="meta">{CAT_NAME[p.category]} · {p.compat}</p>
                      <h3>{p.name}</h3>
                      <p className="rate">★ {p.rating.toFixed(1)}</p>
                      <div className="price-row">
                        <div>
                          <p className="price">{money(p.price)}</p>
                          {p.old ? <p className="old">{money(p.old)}</p> : null}
                        </div>
                        <motion.button className="add" disabled={st < 1} whileTap={{ scale: 0.96 }} onClick={() => add(p.id)}>
                          {st < 1 ? "Esgotado" : "Adicionar"}
                        </motion.button>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </section>

        <section id="baixar-app" className="section wrap">
          <div className="download-app">
            <div>
              <p className="kicker" style={{ color: "var(--accent)" }}>Aplicativo</p>
              <h2>Baixar o app no celular</h2>
              <p className="sub">Instale na tela inicial. Funciona sem loja da Apple/Google. Use o site pelo http://192.168.2.213:8080</p>
              <div className="actions" style={{ marginTop: "1rem" }}>
                <motion.button
                  type="button"
                  className="btn btn-accent"
                  whileTap={{ scale: 0.97 }}
                  onClick={async () => {
                    if (installed) return setToast("App já instalado");
                    if (installEvt) {
                      installEvt.prompt();
                      const choice = await installEvt.userChoice;
                      if (choice.outcome === "accepted") setInstalled(true);
                      setInstallEvt(null);
                      return;
                    }
                    const ua = navigator.userAgent || "";
                    if (/iPhone|iPad|iPod/i.test(ua)) {
                      setToast("No iPhone: Compartilhar → Adicionar à Tela de Início");
                    } else {
                      setToast("No Chrome: menu ⋮ → Instalar app");
                    }
                  }}
                >
                  {installed ? "App instalado" : "Baixar / instalar app"}
                </motion.button>
                <a className="btn btn-dark" href="baixar-app.html">Ver passo a passo</a>
              </div>
            </div>
            <ol className="sub" style={{ lineHeight: 1.6 }}>
              <li>Android: toque em <b>Baixar / instalar app</b> ou no menu do Chrome.</li>
              <li>iPhone: Safari → Compartilhar → Adicionar à Tela de Início.</li>
              <li>Depois o ícone NX abre a loja em tela cheia.</li>
            </ol>
          </div>
        </section>

        <section id="sobre" className="about">
          <div className="wrap">
            <div><h3>Envio rápido</h3><p>Pedidos confirmados até 14h saem no mesmo dia útil para todo o Brasil.</p></div>
            <div><h3>Compatibilidade certa</h3><p>Filtros por modelo e categoria para você não errar na capa ou na película.</p></div>
            <div><h3>Troca fácil</h3><p>7 dias para arrependimento. Produto com defeito? Trocamos sem burocracia.</p></div>
          </div>
        </section>
      </main>

      <footer className="site">
        <div className="wrap">
          <div>
            <p className="brand">Acessórios de celular</p>
            <p>Loja com carrinho, pedidos, tema claro/escuro e animações Framer Motion.</p>
          </div>
          <div>
            <p><b style={{ color: "var(--hero-text)" }}>Loja</b></p>
            <a href="#catalogo">Catálogo</a>
            <a href="#categorias">Categorias</a>
            <button type="button" onClick={() => setAdmin(true)}>Painel administrativo</button>
          </div>
          <div>
            <p><b style={{ color: "var(--hero-text)" }}>Atendimento</b></p>
            <p>WhatsApp: (11) 99999-0000</p>
            <p>contato@nexo.store</p>
          </div>
          <div>
            <p><b style={{ color: "var(--hero-text)" }}>Pagamento</b></p>
            <p>Pix, cartão e boleto (simulado neste demo).</p>
          </div>
        </div>
        <div className="copy">© 2026 Acessórios de celular · Demo com Framer Motion</div>
      </footer>

      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div className="overlay is-on" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCartOpen(false)} />
            <motion.aside className="drawer open" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 320, damping: 34 }}>
              <div className="drawer-h">
                <h3>Seu carrinho</h3>
                <button className="icon-btn" onClick={() => setCartOpen(false)}>✕</button>
              </div>
              <div className="cart-items">
                {cart.length === 0 && <p className="sub">Seu carrinho está vazio.</p>}
                <AnimatePresence>
                  {cart.map((item) => {
                    const p = byId[item.id];
                    return (
                      <motion.div layout key={item.id} className="line" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
                        <Pic src={p.image} alt="" />
                        <div className="grow">
                          <p><b>{p.name}</b></p>
                          <p className="sub">{money(p.price)}</p>
                          <div className="qty">
                            <button onClick={() => changeQty(p.id, -1)}>−</button>
                            <span>{item.qty}</span>
                            <button onClick={() => changeQty(p.id, 1)}>+</button>
                          </div>
                        </div>
                        <p><b>{money(p.price * item.qty)}</b></p>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
              <div className="drawer-f">
                <div className="row"><span>Subtotal</span><span>{money(sum)}</span></div>
                <div className="row total"><span>Total</span><span>{money(sum)}</span></div>
                <motion.button className="btn btn-dark full" disabled={!cart.length} whileTap={{ scale: 0.98 }} onClick={() => { setCartOpen(false); setCheckout(true); }}>Finalizar compra</motion.button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {product && (
          <motion.div className="modal is-on" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="modal-bg" onClick={() => setProduct(null)} />
            <motion.div className="sheet sheet-prod" initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.32, ease }}>
              <button className="close" onClick={() => setProduct(null)}>✕</button>
              <div className="prod">
                <div className="prod-img"><Pic src={product.image} alt={product.name} /></div>
                <div className="prod-info">
                  <p className="meta">{CAT_NAME[product.category]}</p>
                  <h3>{product.name}</h3>
                  <p className="sub">{product.compat} · ★ {product.rating.toFixed(1)}</p>
                  <p>{product.desc}</p>
                  <p className="price" style={{ fontSize: "1.75rem" }}>{money(product.price)}</p>
                  {product.old ? <p className="old">{money(product.old)}</p> : null}
                  <p className={(stock[product.id] ?? 0) < 5 ? "low" : "warn"}>{stock[product.id] ?? 0} em estoque</p>
                  <motion.button className="btn btn-accent full" disabled={(stock[product.id] ?? 0) < 1} whileTap={{ scale: 0.98 }} onClick={() => { add(product.id); setProduct(null); }}>
                    {(stock[product.id] ?? 0) < 1 ? "Produto esgotado" : "Adicionar ao carrinho"}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {checkout && (
          <motion.div className="modal is-on" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="modal-bg" onClick={closeCheckout} />
            <motion.div className="sheet sheet-check" initial={{ y: 24 }} animate={{ y: 0 }} exit={{ y: 16, opacity: 0 }}>
              <button className="close" onClick={closeCheckout}>✕</button>
              {payStep === "form" && (
                <>
                  <h3>Checkout</h3>
                  <p className="sub">Total {money(sum)} · escolha o pagamento</p>
                  <form className="form" onSubmit={(e) => {
                    e.preventDefault();
                    startCheckout(Object.fromEntries(new FormData(e.target).entries()));
                  }}>
                    <input required name="nome" placeholder="Nome completo" />
                    <input required name="email" type="email" placeholder="E-mail" />
                    <input required name="telefone" placeholder="WhatsApp" />
                    <input required name="cep" placeholder="CEP" />
                    <input required name="endereco" placeholder="Endereço e número" />
                    <select name="pagamento" defaultValue="Pix">
                      <option value="Pix">Pix</option>
                      <option value="Cartão">Cartão</option>
                      <option value="Boleto">Boleto</option>
                    </select>
                    <motion.button className="btn btn-accent full" disabled={paying} whileTap={{ scale: 0.98 }}>{paying ? "Conectando ao Mercado Pago..." : "Ir para o pagamento"}</motion.button>
                  </form>
                </>
              )}
              {payStep === "pix" && pending && (
                <div className="pix">
                  <p className="kicker" style={{ color: "var(--accent2)" }}>Pagamento Pix</p>
                  <h3>Pedido {pending.id}</h3>
                  <p className="price" style={{ fontSize: "1.75rem" }}>{money(pending.total)}</p>
                  <p className="sub">
                    {pixSource === "mercadopago"
                      ? "QR oficial do Mercado Pago. O pedido confirma sozinho após o pagamento."
                      : "Escaneie o QR ou use o copia e cola. Token do Mercado Pago não configurado."}
                  </p>
                  <div className="pix-qr">
                    {paying && !pixCode ? <p className="sub">Gerando Pix...</p> : (
                      <img
                        alt="QR Code Pix"
                        width="220"
                        height="220"
                        src={pixQr
                          ? "data:image/png;base64," + pixQr
                          : "https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=" + encodeURIComponent(pixCode)}
                      />
                    )}
                  </div>
                  <p className={"pix-timer" + (pixLeft === 0 ? " low" : "")}>
                    {pixStatus === "approved" ? "Pagamento aprovado" :
                      pixLeft === 0 ? "QR expirado. Gere o pedido de novo." :
                      (pixSource === "mercadopago" ? "Aguardando Mercado Pago · " : "Expira em ") + clock(pixLeft)}
                  </p>
                  <p className="sub">{pixSource === "mercadopago" ? ("Pagamento " + (pixId || "") + " · " + (pixStatus || "pending")) : ("Chave local: " + PIX.key)}</p>
                  <textarea className="pix-code" readOnly value={pixCode} rows={4} />
                  <motion.button type="button" className="btn btn-dark full" whileTap={{ scale: 0.98 }} onClick={copyPix}>Copiar código Pix</motion.button>
                  <motion.button type="button" className="btn btn-accent full" disabled={pixLeft === 0} whileTap={{ scale: 0.98 }} onClick={confirmPix}>Já paguei o Pix</motion.button>
                  <button type="button" className="sub" style={{ background: "none", border: 0, padding: ".5rem 0" }} onClick={() => setPayStep("form")}>Voltar</button>
                </div>
              )}
              {payStep === "card" && pending && (
                <div className="pix">
                  <p className="kicker" style={{ color: "var(--accent2)" }}>Cartão de crédito</p>
                  <h3>Pedido {pending.id}</h3>
                  <p className="price" style={{ fontSize: "1.75rem" }}>{money(pending.total)}</p>
                  <p className="sub">Os dados do cartão vão direto ao Mercado Pago. A loja só recebe o token.</p>
                  <form id="form-card" className="form card-form">
                    <div id="form-checkout__cardNumber" className="mp-field"></div>
                    <div className="card-row">
                      <div id="form-checkout__expirationDate" className="mp-field"></div>
                      <div id="form-checkout__securityCode" className="mp-field"></div>
                    </div>
                    <input type="text" id="form-checkout__cardholderName" placeholder="Nome no cartão" />
                    <select id="form-checkout__issuer"></select>
                    <select id="form-checkout__installments"></select>
                    <div className="card-row">
                      <select id="form-checkout__identificationType"></select>
                      <input type="text" id="form-checkout__identificationNumber" placeholder="CPF do titular" />
                    </div>
                    {cardMsg ? <p className="low">{cardMsg}</p> : null}
                    <motion.button type="submit" className="btn btn-accent full" disabled={paying} whileTap={{ scale: 0.98 }}>
                      {paying ? "Processando..." : "Pagar " + money(pending.total)}
                    </motion.button>
                  </form>
                  <button type="button" className="sub" style={{ background: "none", border: 0, padding: ".5rem 0" }} onClick={() => setPayStep("form")}>Voltar</button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {admin && (
          <motion.div className="modal is-on" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="modal-bg" onClick={() => setAdmin(false)} />
            <motion.div className="sheet sheet-admin" initial={{ y: 30 }} animate={{ y: 0 }} exit={{ y: 20, opacity: 0 }}>
              <div className="drawer-h">
                <div>
                  <h3>Painel da loja</h3>
                  <p className="sub">Estoque e pedidos salvos neste navegador</p>
                </div>
                <button className="icon-btn" onClick={() => setAdmin(false)}>✕</button>
              </div>
              <div className="dash">
                <div className="stat"><span>Faturamento</span><b>{money(orders.reduce((s, o) => s + o.total, 0))}</b></div>
                <div className="stat"><span>Pedidos</span><b>{orders.length}</b></div>
                <div className="stat"><span>Estoque baixo</span><b>{catalog.filter((p) => (stock[p.id] ?? 0) <= 5).length}</b></div>
              </div>
              <div className="admin-body">
                <div>
                  <h4>Estoque</h4>
                  {catalog.map((p) => (
                    <div className="stock-row" key={p.id}>
                      <Pic src={p.image} alt="" />
                      <div className="grow"><p><b>{p.name}</b></p><p className="sub">{money(p.price)}</p></div>
                      <input type="number" min="0" value={stock[p.id] ?? 0} onChange={(e) => setStock({ ...stock, [p.id]: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                    </div>
                  ))}
                </div>
                <div>
                  <h4>Pedidos recentes</h4>
                  {orders.length === 0 && <p className="sub">Nenhum pedido ainda.</p>}
                  {orders.map((o) => (
                    <div className="order" key={o.id}>
                      <div className="row total"><span>{o.id}</span><span>{money(o.total)}</span></div>
                      <p className="sub">{o.date} · {o.customer.nome} · {o.customer.pagamento}</p>
                      <p className="sub">{o.items.map((i) => i.qty + "× " + i.name).join(", ")}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div id="toasts">
        <AnimatePresence>
          {toast && (
            <motion.div className="toast" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}>{toast}</motion.div>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
