const CART_KEY = "pedalpeak_cart_v1";

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  const el = document.getElementById("cartCount");
  if (!el) return;
  const cart = loadCart();
  const count = cart.reduce((s, x) => s + (Number(x.qty) || 0), 0);
  el.textContent = String(count);
}

function addToCart(productId, qty = 1) {
  const cart = loadCart();
  const existing = cart.find(x => x.id === productId);
  if (existing) existing.qty += qty;
  else cart.push({ id: productId, qty });
  saveCart(cart);
  alert("Added to cart ✅");
}

function removeFromCart(productId) {
  const cart = loadCart().filter(x => x.id !== productId);
  saveCart(cart);
}

function setQty(productId, qty) {
  const q = Number(qty);
  const cart = loadCart();
  const item = cart.find(x => x.id === productId);
  if (!item) return;

  if (!Number.isFinite(q) || q < 1) {
    // remove if invalid/0
    saveCart(cart.filter(x => x.id !== productId));
    return;
  }
  item.qty = Math.floor(q);
  saveCart(cart);
}

function clearCart() {
  saveCart([]);
}

async function fetchProducts() {
  const res = await fetch("/api/products");
  if (!res.ok) throw new Error("Failed to load products");
  return await res.json();
}

async function fetchProduct(id) {
  const res = await fetch(`/api/products/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Failed to load product");
  return await res.json();
}

function money(n) {
  return "$" + Number(n).toFixed(2);
}

document.addEventListener("DOMContentLoaded", updateCartCount);