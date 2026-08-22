const cart = [];

const count = document.getElementById("cartCount");
const panel = document.getElementById("cartPanel");
const items = document.getElementById("cartItems");
const total = document.getElementById("cartTotal");

function renderCart() {
  count.textContent = cart.length;

  if (!cart.length) {
    items.textContent = "Your cart is empty.";
    total.textContent = "$0.00";
    return;
  }

  items.innerHTML = cart.map((item, i) =>
    `<div class="cart-row">
      <span>${item.name}</span>
      <span>$${item.price.toFixed(2)} <button type="button" data-remove="${i}" style="margin-left:8px;background:none;border:0;color:#16b9ff;cursor:pointer">Remove</button></span>
    </div>`
  ).join("");

  const sum = cart.reduce((n, item) => n + item.price, 0);
  total.textContent = `$${sum.toFixed(2)}`;

  items.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      cart.splice(Number(btn.dataset.remove), 1);
      renderCart();
    });
  });
}

document.querySelectorAll(".add").forEach(button => {
  button.addEventListener("click", () => {
    cart.push({
      name: button.dataset.rank,
      price: Number(button.dataset.price)
    });
    renderCart();
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
  });
});

document.getElementById("cartButton").addEventListener("click", () => {
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
});

document.getElementById("closeCart").addEventListener("click", () => {
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
});

panel.addEventListener("click", event => {
  if (event.target === panel) {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
  }
});

document.getElementById("checkout").addEventListener("click", () => {
  alert("Connect this button to your payment provider when you're ready.");
});

document.getElementById("year").textContent = new Date().getFullYear();
renderCart();
