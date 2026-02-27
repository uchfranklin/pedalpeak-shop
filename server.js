const path = require("path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = 3000;

// ---------- Product catalog (server source of truth) ----------
const PRODUCTS = [
  {
    id: "bike1",
    name: "Urban Glide 3",
    price: 399,
    blurb: "3-speed city bike • upright comfort • fenders included",
    image: "/images/bike1.jpg",
    features: [
      "3-speed internal hub (low maintenance)",
      "City tires for smooth pavement grip",
      "Full fenders + chain guard",
      "Rear rack-ready mounts"
    ]
  },
  {
    id: "bike2",
    name: "TrailSpark 29",
    price: 799,
    blurb: "Hardtail MTB • 1x drivetrain • hydraulic disc brakes",
    image: "/images/bike2.jpg",
    features: [
      '29" wheels for stability',
      "1x drivetrain (easy shifting)",
      "Hydraulic disc brakes",
      "Front suspension fork"
    ]
  },
  {
    id: "bike3",
    name: "RoadLite Pro",
    price: 999,
    blurb: "Road bike • carbon fork • fast commuter geometry",
    image: "/images/bike3.jpg",
    features: [
      "Light alloy frame + carbon fork",
      "Road gearing for speed",
      "Dual-pivot caliper brakes",
      "Mounts for lights + bottle cages"
    ]
  },
  {
    id: "bike4",
    name: "GravelRidge GX",
    price: 1299,
    blurb: "Gravel/adventure • tubeless-ready • mounts for bags",
    image: "/images/bike4.jpg",
    features: [
      "Adventure geometry for comfort",
      "Tubeless-ready wheels",
      "Mechanical disc brakes",
      "Extra mounts for racks + bags"
    ]
  },
  {
    id: "bike5",
    name: "CoastCruiser Step-Thru",
    price: 549,
    blurb: "Comfort cruiser • step-through frame • wide tires",
    image: "/images/bike5.jpg",
    features: [
      "Step-through frame for easy mounting",
      "Wide tires for stability",
      "Comfort saddle + swept-back bars",
      "Simple, dependable drivetrain"
    ]
  }
];

// ---------- App middleware ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- SQLite DB ----------
const dbPath = path.join(__dirname, "shop.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      shipping_method TEXT NOT NULL,
      shipping_cost REAL NOT NULL,
      subtotal REAL NOT NULL,
      total REAL NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      line_total REAL NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    )
  `);
});

// ---------- API ----------
app.get("/api/products", (req, res) => {
  res.json(PRODUCTS);
});

app.get("/api/products/:id", (req, res) => {
  const p = PRODUCTS.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Product not found" });
  res.json(p);
});

app.post("/api/orders", (req, res) => {
  const { customer, shipping, cart } = req.body || {};

  if (!customer?.name || !customer?.email || !customer?.address) {
    return res.status(400).json({ error: "Missing customer fields" });
  }
  if (!shipping?.method || typeof shipping?.cost !== "number") {
    return res.status(400).json({ error: "Missing shipping info" });
  }
  if (!Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  // Validate cart against server product list
  const enriched = [];
  for (const item of cart) {
    const prod = PRODUCTS.find(p => p.id === item.id);
    const qty = Number(item.qty);
    if (!prod || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: "Invalid cart items" });
    }
    enriched.push({
      product_id: prod.id,
      product_name: prod.name,
      unit_price: prod.price,
      quantity: qty,
      line_total: prod.price * qty
    });
  }

  const subtotal = enriched.reduce((s, x) => s + x.line_total, 0);
  const total = subtotal + shipping.cost;
  const createdAt = new Date().toISOString();

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(
      `
      INSERT INTO orders
        (created_at, customer_name, email, address, shipping_method, shipping_cost, subtotal, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        createdAt,
        customer.name,
        customer.email,
        customer.address,
        shipping.method,
        shipping.cost,
        subtotal,
        total
      ],
      function (err) {
        if (err) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: "DB insert failed" });
        }

        const orderId = this.lastID;

        const stmt = db.prepare(`
          INSERT INTO order_items
            (order_id, product_id, product_name, unit_price, quantity, line_total)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const it of enriched) {
          stmt.run([orderId, it.product_id, it.product_name, it.unit_price, it.quantity, it.line_total]);
        }
        stmt.finalize((err2) => {
          if (err2) {
            db.run("ROLLBACK");
            return res.status(500).json({ error: "DB insert items failed" });
          }
          db.run("COMMIT");
          res.json({ orderId });
        });
      }
    );
  });
});

app.get("/api/orders/:id", (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: "Bad order id" });

  db.get(`SELECT * FROM orders WHERE id = ?`, [orderId], (err, order) => {
    if (err) return res.status(500).json({ error: "DB read failed" });
    if (!order) return res.status(404).json({ error: "Order not found" });

    db.all(`SELECT * FROM order_items WHERE order_id = ?`, [orderId], (err2, items) => {
      if (err2) return res.status(500).json({ error: "DB read items failed" });
      res.json({ order, items });
    });
  });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`✅ PedalPeak shop running at http://localhost:${PORT}`);
});