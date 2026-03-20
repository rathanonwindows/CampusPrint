const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const cors = require("cors");

const app = express();

/* ================= MIDDLEWARE ================= */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= STATIC ================= */

app.use(express.static(path.join(__dirname)));
app.use("/pages", express.static(path.join(__dirname, "pages")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

/* ================= UPLOAD SETUP ================= */

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadDir),
    filename: (_, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage });

/* ================= HELPERS ================= */

const loadOrders = () => {
    try {
        return JSON.parse(fs.readFileSync("orders.json", "utf-8"));
    } catch {
        return [];
    }
};

const saveOrders = orders => {
    fs.writeFileSync("orders.json", JSON.stringify(orders, null, 2));
};

const updateQueue = orders => {
    let queue = 1;
    orders.forEach(o => {
        if (o.status === "Pending") {
            o.queuePosition = queue;
            o.estimatedTime = queue * 2;
            queue++;
        }
    });
};

const generateOrderId = () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const prefix = [...Array(4)]
        .map(() => letters[Math.floor(Math.random() * letters.length)])
        .join("");
    const numbers = Math.floor(100000 + Math.random() * 900000);
    return prefix + numbers;
};

const calculatePrice = (color, copies) =>
    color === "Color" ? copies * 15 : copies * 5;

/* ================= ROUTES ================= */

app.post("/place-order", upload.single("file"), (req, res) => {

    if (!req.file) {
        return res.status(400).json({ error: "File upload failed" });
    }

    const orders = loadOrders();
    const { regno, phone, name, copies, color, payment } = req.body;

    const existing = orders.find(o =>
        o.regNo === regno && o.status === "Pending"
    );

    if (existing) {
        return res.json({ error: "You already have a pending order" });
    }

    const order = {
        orderId: generateOrderId(),
        name,
        regNo: regno,
        phone,
        copies: +copies,
        color,
        payment,
        price: calculatePrice(color, +copies),
        file: req.file.filename,
        status: "Pending",
        time: new Date().toLocaleTimeString(),
        date: new Date().toISOString().split("T")[0]
    };

    orders.push(order);
    updateQueue(orders);
    saveOrders(orders);

    res.json(order);
});

/* last order */
app.get("/last-order/:regno", (req, res) => {
    const orders = loadOrders().filter(o => o.regNo === req.params.regno);
    if (!orders.length) return res.json({ message: "No previous orders" });
    res.json(orders.at(-1));
});

/* track */
app.get("/track/:id", (req, res) => {
    const order = loadOrders().find(o => o.orderId === req.params.id);
    if (!order) return res.json({ error: "Order not found" });
    res.json(order);
});

/* all orders */
app.get("/orders", (_, res) => {
    res.json(loadOrders());
});

/* mark ready */
app.post("/order-ready/:id", (req, res) => {

    const orders = loadOrders();
    const order = orders.find(o => o.orderId === req.params.id);

    if (!order) return res.json({ error: "Order not found" });

    order.status = "Ready for Pickup";
    order.readyTime = new Date().toLocaleTimeString();

    delete order.queuePosition;
    delete order.estimatedTime;

    updateQueue(orders);
    saveOrders(orders);

    const message = encodeURIComponent(
        `Hello ${order.name}, your order (${order.orderId}) is ready for pickup.`
    );

    const whatsappLink = `https://wa.me/91${order.phone}?text=${message}`;

    res.json({ success: true, whatsappLink });
});

/* orders by register */
app.get("/orders-by-register/:regno", (req, res) => {
    const filtered = loadOrders().filter(o => o.regNo === req.params.regno);
    res.json(filtered);
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
