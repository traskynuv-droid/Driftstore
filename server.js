const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const Stripe = require("stripe");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PATH = (process.env.ADMIN_PATH || "driftstore-admin").replace(/^\/+|\/+$/g, "");
if (!ADMIN_PATH.toLowerCase().includes("driftstore")) {
  throw new Error("ADMIN_PATH must contain the word 'driftstore'.");
}

const productsFile = path.join(__dirname, "products.json");
const readProducts = () => JSON.parse(fs.readFileSync(productsFile, "utf8"));
const writeProducts = (items) => fs.writeFileSync(productsFile, JSON.stringify(items, null, 2));

const stripe = process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes("your_key")
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }
}));

app.get("/api/products", (req, res) => res.json(readProducts()));

app.post("/api/login", (req, res) => {
  if (!process.env.ADMIN_PASSWORD || req.body.password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }
  req.session.admin = true;
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

function adminOnly(req, res, next) {
  if (!req.session.admin) return res.status(401).json({ error: "Admin login required" });
  next();
}

app.get("/api/admin/status", (req, res) => res.json({ loggedIn: !!req.session.admin }));

app.put("/api/admin/products", adminOnly, (req, res) => {
  const items = Array.isArray(req.body) ? req.body : null;
  if (!items) return res.status(400).json({ error: "Expected an array of products." });
  for (const p of items) {
    if (!p.id || !p.name || typeof p.price !== "number" || p.price < 0) {
      return res.status(400).json({ error: "Each product needs id, name and a valid price." });
    }
  }
  writeProducts(items);
  res.json(items);
});

app.post("/api/stripe/checkout", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured yet." });
  const product = readProducts().find(p => p.id === req.body.productId);
  const username = String(req.body.minecraftUsername || "").trim();
  if (!product) return res.status(404).json({ error: "Product not found." });
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
    return res.status(400).json({ error: "Enter a valid Minecraft Java username (3-16 characters)." });
  }

  const ordersFile = path.join(__dirname, "orders.json");
  const orders = fs.existsSync(ordersFile) ? JSON.parse(fs.readFileSync(ordersFile, "utf8")) : [];
  const order = {
    id: "ds_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    productId: product.id, productName: product.name, username,
    amount: product.price, currency: product.currency, status: "pending",
    delivered: false, createdAt: new Date().toISOString()
  };
  orders.push(order);

  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: product.currency.toLowerCase(),
          product_data: { name: `DriftStore — ${product.name}` },
          unit_amount: Math.round(product.price * 100)
        },
        quantity: 1
      }],
      success_url: `${process.env.PUBLIC_URL || "http://localhost:"+PORT}/?paid=1`,
      cancel_url: `${process.env.PUBLIC_URL || "http://localhost:"+PORT}/?cancelled=1`,
      metadata: { driftstore_order_id: order.id, minecraft_username: username, product_id: product.id }
    });
    order.stripeSessionId = checkout.id;
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
    res.json({ url: checkout.url });
  } catch (e) {
    order.status = "checkout_error";
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send("Webhook not configured");
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const ordersFile = path.join(__dirname, "orders.json");
    const orders = fs.existsSync(ordersFile) ? JSON.parse(fs.readFileSync(ordersFile, "utf8")) : [];
    const o = orders.find(x => x.id === s.metadata?.driftstore_order_id);
    if (o) { o.status = "paid"; o.paidAt = new Date().toISOString(); }
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
  }
  res.json({ received: true });
});

function paperAuth(req, res, next) {
  if (!process.env.PAPER_API_KEY || req.headers.authorization !== `Bearer ${process.env.PAPER_API_KEY}`) {
    return res.status(401).json({ error: "Invalid Paper API key" });
  }
  next();
}

app.get("/api/paper/orders", paperAuth, (req, res) => {
  const f = path.join(__dirname, "orders.json");
  const orders = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
  res.json(orders.filter(o => o.status === "paid" && !o.delivered).slice(0, 25));
});

app.post("/api/paper/orders/:id/delivered", paperAuth, (req, res) => {
  const f = path.join(__dirname, "orders.json");
  const orders = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
  const o = orders.find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: "Order not found" });
  o.delivered = true; o.deliveredAt = new Date().toISOString();
  fs.writeFileSync(f, JSON.stringify(orders, null, 2));
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, "public")));
app.get(`/${ADMIN_PATH}`, (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`DriftStore running on http://localhost:${PORT}`));
