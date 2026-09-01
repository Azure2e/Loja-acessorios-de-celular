(() => {
  const CATEGORIES = [
    { id: "todas", name: "Todos", icon: "✨" },
    { id: "capas", name: "Capinhas", icon: "📱" },
    { id: "peliculas", name: "Películas", icon: "🛡️" },
    { id: "audio", name: "Áudio", icon: "🎧" },
    { id: "energia", name: "Energia", icon: "⚡" },
    { id: "suportes", name: "Suportes", icon: "🚗" }
  ];

  const PRODUCTS = [
    { id: "p1", name: "Capa silicone premium", category: "capas", price: 89.9, old: 119.9, stock: 18, compat: "iPhone 16 Pro Max", rating: 4.8, image: "images/capa-silicone.jpg", desc: "Toque macio, proteção nas bordas e recorte preciso para câmeras. Acabamento fosco que não marca digitais." },
    { id: "p2", name: "Capinha art collection", category: "capas", price: 59.9, old: 79.9, stock: 24, compat: "iPhone / Galaxy", rating: 4.6, image: "images/capas-estampadas.jpg", desc: "Estampas exclusivas com impressão de alta definição. Protege contra riscos e pequenos impactos do dia a dia." },
    { id: "p3", name: "Película vidro 9H", category: "peliculas", price: 29.9, old: 49.9, stock: 40, compat: "iPhone 16 Pro", rating: 4.7, image: "images/pelicula.jpg", desc: "Vidro temperado com bandeja de alinhamento. Resistente a riscos e fácil de aplicar sem bolhas." },
    { id: "p4", name: "Película cerâmica flexível", category: "peliculas", price: 39.9, old: null, stock: 22, compat: "Universal / Galaxy", rating: 4.5, image: "images/pelicula2.jpg", desc: "Cobertura flexível que acompanha a curvatura da tela. Boa opção para quem quebra película de vidro com frequência." },
    { id: "p5", name: "Fones TWS com display", category: "audio", price: 149.9, old: 199.9, stock: 14, compat: "Bluetooth 5.3", rating: 4.4, image: "images/fones.jpg", desc: "Case com porcentagem de bateria, graves reforçados e até 24h de autonomia com o estojo." },
    { id: "p6", name: "Power bank 20.000 mAh", category: "energia", price: 179.9, old: 229.9, stock: 11, compat: "USB-C + USB-A", rating: 4.7, image: "images/powerbank.jpg", desc: "Display digital, três portas e carga rápida. Ideal para viagens e jornada longa fora da tomada." },
    { id: "p7", name: "Carregador GaN 65W", category: "energia", price: 119.9, old: 159.9, stock: 16, compat: "USB-C dual", rating: 4.8, image: "images/carregador.jpg", desc: "Compacto e potente. Carrega celular e notebook leve ao mesmo tempo com tecnologia GaN." },
    { id: "p8", name: "Cabo USB-C trançado 2 m", category: "energia", price: 49.9, old: 69.9, stock: 35, compat: "USB-C / 60W", rating: 4.6, image: "images/cabo.jpg", desc: "Malha reforçada, pontas metálicas e comprimento extra para usar no sofá ou no escritório." },
    { id: "p9", name: "Base 3 em 1 MagSafe", category: "energia", price: 249.9, old: 319.9, stock: 7, compat: "iPhone + Watch + Fones", rating: 4.9, image: "images/base-3em1.jpg", desc: "Uma base para celular, relógio e fones. Visual clean para a mesa de trabalho ou criado-mudo." },
    { id: "p10", name: "Estação Qi2 dobrável", category: "energia", price: 329.9, old: 399.9, stock: 5, compat: "MagSafe / Qi2", rating: 4.8, image: "images/base-anker.jpg", desc: "Carregamento magnético rápido e formato dobrável para levar na mala. Inclui fonte USB-C." },
    { id: "p11", name: "Suporte veicular ventosa", category: "suportes", price: 69.9, old: 89.9, stock: 19, compat: "Universal", rating: 4.5, image: "images/suporte-carro.jpg", desc: "Braço articulado e ventosa firme no painel. Segura o celular na vertical ou horizontal para o GPS." },
    { id: "p12", name: "Kit proteção capa + película", category: "capas", price: 99.9, old: 139.9, stock: 13, compat: "iPhone 16", rating: 4.7, image: "images/capa-silicone.jpg", desc: "Combo mais vendido: capa premium + película 9H com 15% de economia em relação à compra separada." }
  ];

  const BY_ID = Object.create(null);
  PRODUCTS.forEach(p => { BY_ID[p.id] = p; });
  const CAT_NAME = Object.fromEntries(CATEGORIES.map(c => [c.id, c.name]));

  const state = {
    category: "todas",
    search: "",
    sort: "destaque",
    cart: load("nexo_cart", []),
    stock: load("nexo_stock", Object.fromEntries(PRODUCTS.map(p => [p.id, p.stock]))),
    orders: load("nexo_orders", [])
  };

  const $ = id => document.getElementById(id);
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function money(n) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function stockOf(id) { return state.stock[id] ?? 0; }
  function webp(src) { return src.replace(/\.jpe?g$/i, ".webp"); }

  function picture(src, alt, extra = "") {
    return `<picture><source type="image/webp" srcset="${webp(src)}"><img src="${src}" alt="${alt}" width="800" height="600" decoding="async" ${extra}></picture>`;
  }

  let toastT;
  function toast(msg) {
    const box = $("toasts");
    box.replaceChildren();
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    box.appendChild(el);
    clearTimeout(toastT);
    toastT = setTimeout(() => el.remove(), 2400);
  }

  function filteredProducts() {
    const q = state.search.trim().toLowerCase();
    let list = PRODUCTS.filter(p => {
      if (state.category !== "todas" && p.category !== state.category) return false;
      if (!q) return true;
      return (p.name + " " + p.compat + " " + p.desc + " " + p.category).toLowerCase().includes(q);
    });
    if (state.sort === "menor") list.sort((a, b) => a.price - b.price);
    else if (state.sort === "maior") list.sort((a, b) => b.price - a.price);
    else if (state.sort === "nome") list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return list;
  }

  function renderCategories() {
    const counts = {};
    PRODUCTS.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
    $("categoryRow").innerHTML = CATEGORIES.filter(c => c.id !== "todas").map(c =>
      `<button class="cat" data-cat="${c.id}"><div class="ico">${c.icon}</div><b>${c.name}</b><small>${counts[c.id] || 0} itens</small></button>`
    ).join("");
    $("filterChips").innerHTML = CATEGORIES.map(c =>
      `<button class="chip${state.category === c.id ? " on" : ""}" data-cat="${c.id}">${c.name}</button>`
    ).join("");
  }

  function productCard(p, i) {
    const st = stockOf(p.id);
    return `<article class="card" style="--delay:${Math.min(i, 11) * 40}ms">
      <button class="thumb" data-open="${p.id}" aria-label="${p.name}">
        ${picture(p.image, p.name, 'loading="lazy"')}
      </button>
      <div class="body">
        <p class="meta">${CAT_NAME[p.category]} · ${p.compat}</p>
        <h3>${p.name}</h3>
        <p class="rate">★ ${p.rating.toFixed(1)}</p>
        <div class="price-row">
          <div>
            <p class="price">${money(p.price)}</p>
            ${p.old ? `<p class="old">${money(p.old)}</p>` : ""}
          </div>
          <button class="add" data-add="${p.id}" ${st < 1 ? "disabled" : ""}>${st < 1 ? "Esgotado" : "Adicionar"}</button>
        </div>
      </div>
    </article>`;
  }

  function renderProducts() {
    const list = filteredProducts();
    $("resultCount").textContent = `${list.length} produto${list.length === 1 ? "" : "s"} encontrado${list.length === 1 ? "" : "s"}`;
    $("productGrid").innerHTML = list.length
      ? list.map(productCard).join("")
      : `<p class="sub">Nenhum produto com esse filtro. Tente outra busca.</p>`;
  }

  function setCategory(id) {
    state.category = id;
    renderCategories();
    renderProducts();
  }

  function openProduct(id) {
    const p = BY_ID[id];
    const st = stockOf(id);
    $("productModalBody").innerHTML = `
      <div class="prod-img">${picture(p.image, p.name, 'loading="eager"')}</div>
      <div class="prod-info">
        <p class="meta">${CAT_NAME[p.category]}</p>
        <h3>${p.name}</h3>
        <p class="sub">${p.compat} · ★ ${p.rating.toFixed(1)}</p>
        <p>${p.desc}</p>
        <p class="price" style="font-size:1.75rem">${money(p.price)}</p>
        ${p.old ? `<p class="old">${money(p.old)}</p>` : ""}
        <p class="${st < 5 ? "low" : "warn"}">${st} em estoque</p>
        <button class="btn btn-accent full" data-add="${p.id}" data-close-after ${st < 1 ? "disabled" : ""}>${st < 1 ? "Produto esgotado" : "Adicionar ao carrinho"}</button>
      </div>`;
    showModal("productModal");
  }

  function cartCount() { return state.cart.reduce((s, i) => s + i.qty, 0); }
  function cartSum() { return state.cart.reduce((s, i) => s + (BY_ID[i.id] ? BY_ID[i.id].price * i.qty : 0), 0); }

  function addToCart(id) {
    const available = stockOf(id);
    const item = state.cart.find(i => i.id === id);
    if ((item ? item.qty + 1 : 1) > available) { toast("Estoque insuficiente"); return; }
    if (item) item.qty += 1; else state.cart.push({ id, qty: 1 });
    persistCart();
    toast("Adicionado ao carrinho");
    const badge = $("cartBadge");
    badge.classList.remove("pop");
    void badge.offsetWidth;
    badge.classList.add("pop");
  }

  function changeQty(id, delta) {
    const item = state.cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty < 1) state.cart = state.cart.filter(i => i.id !== id);
    if (item.qty > stockOf(id)) item.qty = stockOf(id);
    persistCart();
  }

  function persistCart() {
    save("nexo_cart", state.cart);
    renderCart();
  }

  function renderCart() {
    const n = cartCount();
    const badge = $("cartBadge");
    badge.textContent = n;
    badge.classList.toggle("hidden", n === 0);
    const wrap = $("cartItems");
    if (!state.cart.length) {
      wrap.innerHTML = `<p class="sub">Seu carrinho está vazio.</p>`;
    } else {
      wrap.innerHTML = state.cart.map(item => {
        const p = BY_ID[item.id];
        return `<div class="line">
          ${picture(p.image, "", 'loading="lazy"')}
          <div class="grow">
            <p><b>${p.name}</b></p>
            <p class="sub">${money(p.price)}</p>
            <div class="qty">
              <button data-qty="${p.id}" data-delta="-1">−</button>
              <span>${item.qty}</span>
              <button data-qty="${p.id}" data-delta="1">+</button>
            </div>
          </div>
          <p><b>${money(p.price * item.qty)}</b></p>
        </div>`;
      }).join("");
    }
    const sum = cartSum();
    $("cartSubtotal").textContent = money(sum);
    $("cartTotal").textContent = money(sum);
    $("btnCheckout").disabled = !state.cart.length;
  }

  function openCart(open) {
    const overlay = $("cartOverlay");
    const drawer = $("cartDrawer");
    if (open) {
      overlay.classList.remove("hidden");
      requestAnimationFrame(() => overlay.classList.add("is-on"));
      drawer.classList.add("open");
    } else {
      overlay.classList.remove("is-on");
      drawer.classList.remove("open");
      setTimeout(() => overlay.classList.add("hidden"), 280);
    }
  }

  function showModal(id) {
    const el = $(id);
    el.classList.remove("hidden");
    requestAnimationFrame(() => el.classList.add("is-on"));
  }
  function hideModal(id) {
    const el = $(id);
    el.classList.remove("is-on");
    setTimeout(() => el.classList.add("hidden"), 280);
  }

  function placeOrder(data) {
    for (const item of state.cart) {
      if (item.qty > stockOf(item.id)) { toast("Alguns itens ficaram sem estoque"); return; }
    }
    const order = {
      id: "NX" + Date.now().toString().slice(-6),
      date: new Date().toLocaleString("pt-BR"),
      customer: data,
      items: state.cart.map(i => ({ id: i.id, name: BY_ID[i.id].name, qty: i.qty, price: BY_ID[i.id].price })),
      total: cartSum(),
      status: "Pago"
    };
    order.items.forEach(i => { state.stock[i.id] -= i.qty; });
    state.orders.unshift(order);
    state.cart = [];
    save("nexo_stock", state.stock);
    save("nexo_orders", state.orders);
    persistCart();
    renderProducts();
    hideModal("checkoutModal");
    toast("Pedido " + order.id + " confirmado!");
  }

  function renderAdmin() {
    $("dashRevenue").textContent = money(state.orders.reduce((s, o) => s + o.total, 0));
    $("dashOrders").textContent = state.orders.length;
    $("dashLow").textContent = PRODUCTS.filter(p => stockOf(p.id) <= 5).length;
    $("adminStock").innerHTML = PRODUCTS.map(p => `
      <div class="stock-row">
        ${picture(p.image, "", 'loading="lazy"')}
        <div class="grow"><p><b>${p.name}</b></p><p class="sub">${money(p.price)}</p></div>
        <input type="number" min="0" value="${stockOf(p.id)}" data-stock="${p.id}">
      </div>`).join("");
    $("adminOrders").innerHTML = state.orders.length ? state.orders.map(o => `
      <div class="order">
        <div class="row total"><span>${o.id}</span><span>${money(o.total)}</span></div>
        <p class="sub">${o.date} · ${o.customer.nome} · ${o.customer.pagamento}</p>
        <p class="sub">${o.items.map(i => i.qty + "× " + i.name).join(", ")}</p>
      </div>`).join("") : `<p class="sub">Nenhum pedido ainda. Finalize uma compra no checkout para ver aqui.</p>`;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  $("btnMenu").onclick = () => $("mobileNav").classList.toggle("hidden");
  $("btnCart").onclick = () => openCart(true);
  $("closeCart").onclick = () => openCart(false);
  $("cartOverlay").onclick = () => openCart(false);
  $("btnCheckout").onclick = () => {
    if (!state.cart.length) return;
    openCart(false);
    showModal("checkoutModal");
  };
  document.querySelectorAll("[data-close-modal]").forEach(el => el.onclick = () => hideModal("productModal"));
  document.querySelectorAll("[data-close-checkout]").forEach(el => el.onclick = () => hideModal("checkoutModal"));
  document.querySelectorAll("[data-close-admin]").forEach(el => el.onclick = () => hideModal("adminModal"));
  document.querySelectorAll("[data-open-admin]").forEach(el => el.onclick = () => { renderAdmin(); showModal("adminModal"); });
  $("sortSelect").onchange = e => { state.sort = e.target.value; renderProducts(); };

  const onSearch = debounce(e => { state.search = e.target.value; renderProducts(); }, 160);
  $("searchInput").addEventListener("input", onSearch);
  $("searchInputMobile").addEventListener("input", onSearch);

  document.addEventListener("click", e => {
    const cat = e.target.closest("[data-cat]");
    if (cat) {
      setCategory(cat.dataset.cat);
      if (cat.closest("#filterChips") || cat.closest("#categoryRow")) $("catalogo").scrollIntoView({ behavior: "smooth" });
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) { openProduct(open.dataset.open); return; }
    const add = e.target.closest("[data-add]");
    if (add && !add.disabled) {
      addToCart(add.dataset.add);
      if (add.hasAttribute("data-close-after")) hideModal("productModal");
      return;
    }
    const qty = e.target.closest("[data-qty]");
    if (qty) changeQty(qty.dataset.qty, Number(qty.dataset.delta));
  });

  $("adminStock").addEventListener("change", e => {
    const input = e.target.closest("[data-stock]");
    if (!input) return;
    state.stock[input.dataset.stock] = Math.max(0, parseInt(input.value, 10) || 0);
    save("nexo_stock", state.stock);
    renderAdmin();
    renderProducts();
  });

  $("checkoutForm").onsubmit = e => {
    e.preventDefault();
    placeOrder(Object.fromEntries(new FormData(e.target).entries()));
    e.target.reset();
  };


  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("nexo_theme", theme); } catch (e) {}
    const icon = $("themeIcon");
    if (icon) icon.textContent = theme === "dark" ? "☀" : "☾";
    const btn = $("btnTheme");
    if (btn) btn.setAttribute("aria-label", theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro");
  }
  applyTheme(currentTheme() || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const themeBtn = $("btnTheme");
  if (themeBtn) themeBtn.onclick = () => applyTheme(currentTheme() === "dark" ? "light" : "dark");

  renderCategories();
  renderProducts();
  renderCart();
})();
