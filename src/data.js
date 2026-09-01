export const CATEGORIES = [
  { id: "todas", name: "Todos", icon: "✨" },
  { id: "capas", name: "Capinhas", icon: "📱" },
  { id: "peliculas", name: "Películas", icon: "🛡️" },
  { id: "audio", name: "Áudio", icon: "🎧" },
  { id: "energia", name: "Energia", icon: "⚡" },
  { id: "suportes", name: "Suportes", icon: "🚗" }
];

export const PRODUCTS = [
  { id: "p1", name: "Capa silicone premium", category: "capas", price: 89.9, old: 119.9, stock: 18, compat: "iPhone 16 Pro Max", rating: 4.8, image: "images/capa-silicone.jpg", desc: "Toque macio, proteção nas bordas e recorte preciso para câmeras." },
  { id: "p2", name: "Capinha art collection", category: "capas", price: 59.9, old: 79.9, stock: 24, compat: "iPhone / Galaxy", rating: 4.6, image: "images/capas-estampadas.jpg", desc: "Estampas exclusivas com impressão de alta definição." },
  { id: "p3", name: "Película vidro 9H", category: "peliculas", price: 29.9, old: 49.9, stock: 40, compat: "iPhone 16 Pro", rating: 4.7, image: "images/pelicula.jpg", desc: "Vidro temperado com bandeja de alinhamento, sem bolhas." },
  { id: "p4", name: "Película cerâmica flexível", category: "peliculas", price: 39.9, old: null, stock: 22, compat: "Universal / Galaxy", rating: 4.5, image: "images/pelicula2.jpg", desc: "Cobertura flexível que acompanha a curvatura da tela." },
  { id: "p5", name: "Fones TWS com display", category: "audio", price: 149.9, old: 199.9, stock: 14, compat: "Bluetooth 5.3", rating: 4.4, image: "images/fones.jpg", desc: "Case com porcentagem de bateria e graves reforçados." },
  { id: "p6", name: "Power bank 20.000 mAh", category: "energia", price: 179.9, old: 229.9, stock: 11, compat: "USB-C + USB-A", rating: 4.7, image: "images/powerbank.jpg", desc: "Display digital, três portas e carga rápida." },
  { id: "p7", name: "Carregador GaN 65W", category: "energia", price: 119.9, old: 159.9, stock: 16, compat: "USB-C dual", rating: 4.8, image: "images/carregador.jpg", desc: "Compacto e potente para celular e notebook leve." },
  { id: "p8", name: "Cabo USB-C trançado 2 m", category: "energia", price: 49.9, old: 69.9, stock: 35, compat: "USB-C / 60W", rating: 4.6, image: "images/cabo.jpg", desc: "Malha reforçada e comprimento extra." },
  { id: "p9", name: "Base 3 em 1 MagSafe", category: "energia", price: 249.9, old: 319.9, stock: 7, compat: "iPhone + Watch + Fones", rating: 4.9, image: "images/base-3em1.jpg", desc: "Uma base para celular, relógio e fones." },
  { id: "p10", name: "Estação Qi2 dobrável", category: "energia", price: 329.9, old: 399.9, stock: 5, compat: "MagSafe / Qi2", rating: 4.8, image: "images/base-anker.jpg", desc: "Carregamento magnético rápido e formato dobrável." },
  { id: "p11", name: "Suporte veicular ventosa", category: "suportes", price: 69.9, old: 89.9, stock: 19, compat: "Universal", rating: 4.5, image: "images/suporte-carro.jpg", desc: "Braço articulado e ventosa firme no painel." },
  { id: "p12", name: "Kit proteção capa + película", category: "capas", price: 99.9, old: 139.9, stock: 13, compat: "iPhone 16", rating: 4.7, image: "images/capa-silicone.jpg", desc: "Combo capa premium + película 9H." }
];

export const CAT_NAME = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));

export function money(n) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function webp(src) {
  return src.replace(/\.jpe?g$/i, ".webp");
}

export function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* Troque a chave Pix pela sua (e-mail, CPF/CNPJ, telefone ou chave aleatória). */
export const PIX = {
  key: "contato@nexo.store",
  name: "ACESSORIOS DE CELULAR",
  city: "SAO PAULO"
};

function emv(id, value) {
  const v = String(value);
  return id + String(v.length).padStart(2, "0") + v;
}

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPixCode(amount, txid) {
  const valor = Number(amount).toFixed(2);
  const merchant = PIX.name.slice(0, 25);
  const city = PIX.city.slice(0, 15);
  const id = String(txid || "NEXO").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "NEXO";
  const gui = emv("00", "br.gov.bcb.pix") + emv("01", PIX.key);
  const additional = emv("05", id);
  const payload =
    emv("00", "01") +
    emv("26", gui) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", valor) +
    emv("58", "BR") +
    emv("59", merchant) +
    emv("60", city) +
    emv("62", additional) +
    "6304";
  return payload + crc16(payload);
}
