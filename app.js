const CONFIG = {
  storeName: "DriftStore",
  discord: "https://discord.com/",
  currency: "$"
};

let products = [];
let cart = [];

const $ = (s) => document.querySelector(s);

async function loadProducts() {
  try {
    const res = await fetch("products.json", {cache: "no-store"});
    products = await res.json();
  } catch (e) {
    console.error("Could not load products.json", e);
    products = [];
  }
  renderFilters();
  renderProducts("All");
  renderCart();
}

function renderFilters() {
  const categories = ["All", ...new Set(products.map(p => p.category))];
  $("#filters").innerHTML = categories.map((c,i) =>
    `<button class="filter ${i===0?"active":""}" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join("");
  document.querySelectorAll(".filter").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderProducts(btn.dataset.category);
  }));
}

function renderProducts(category) {
  const list = category === "All" ? products : products.filter(p => p.category === category);
  $("#productGrid").innerHTML = list.map(p => `
    <article class="product">
      <div class="product-art">${escapeHtml(p.icon || "◆")}</div>
      <span class="tag">${escapeHtml(p.category)}</span>
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.description)}</p>
      <div class="product-bottom">
        <span class="price">${CONFIG.currency}${Number(p.price).toFixed(2)}</span>
        <button class="buy" onclick="addToCart('${p.id}')">Add to cart</button>
      </div>
    </article>
  `).join("");
}

function addToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  cart.push(p);
  renderCart();
  openCart();
}

function removeFromCart(index) {
  cart.splice(index,1);
  renderCart();
}

function renderCart() {
  $("#cartCount").textContent = cart.length;
  if (!cart.length) {
    $("#cartItems").innerHTML = `<p class="tiny">Your cart is empty.</p>`;
  } else {
    $("#cartItems").innerHTML = cart.map((p,i) => `
      <div class="cart-item">
        <div>${escapeHtml(p.icon || "◆")}</div>
        <div><strong>${escapeHtml(p.name)}</strong><br><small>${CONFIG.currency}${Number(p.price).toFixed(2)}</small></div>
        <button class="remove" onclick="removeFromCart(${i})">Remove</button>
      </div>
    `).join("");
  }
  const total = cart.reduce((sum,p) => sum + Number(p.price), 0);
  $("#cartTotal").textContent = CONFIG.currency + total.toFixed(2);
}

function openCart() {
  $("#cartPanel").classList.add("open");
  $("#overlay").classList.add("open");
  $("#cartPanel").setAttribute("aria-hidden","false");
}
function closeCart() {
  $("#cartPanel").classList.remove("open");
  $("#overlay").classList.remove("open");
  $("#cartPanel").setAttribute("aria-hidden","true");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

$("#storeName").textContent = CONFIG.storeName;
document.title = CONFIG.storeName + " — Minecraft Store";
$("#discordLink").href = CONFIG.discord;
$("#cartButton").addEventListener("click", openCart);
$("#closeCart").addEventListener("click", closeCart);
$("#overlay").addEventListener("click", closeCart);
$("#checkoutButton").addEventListener("click", () => {
  alert("Demo checkout. Connect your payment provider before accepting real orders.");
});

loadProducts();
