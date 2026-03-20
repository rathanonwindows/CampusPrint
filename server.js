const fs = require("fs");
const express = require("express");
const multer = require("multer");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

/* ================= FILE UPLOAD ================= */

const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, "uploads/"),
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

/* place order */
app.post("/place-order", upload.single("file"), (req, res) => {

    const orders = loadOrders();
    const { regno, phone, name, copies, color, payment } = req.body;

    // prevent duplicate pending
    const existing = orders.find(o =>
        o.regNo === regno && o.status === "Pending"
    );

    if (existing) {
        return res.json({
            error: "You already have a pending order"
        });
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

    if (!orders.length) {
        return res.json({ message: "No previous orders" });
    }

    res.json(orders.at(-1));
});

/* track */
app.get("/track/:id", (req, res) => {
    const order = loadOrders().find(o => o.orderId === req.params.id);

    if (!order) {
        return res.json({ error: "Order not found" });
    }

    res.json(order);
});

/* all orders */
app.get("/orders", (req, res) => {
    res.json(loadOrders());
});

/* mark ready */
app.post("/order-ready/:id", (req, res) => {

    const orders = loadOrders();
    const order = orders.find(o => o.orderId === req.params.id);

    if (!order) {
        return res.json({ error: "Order not found" });
    }

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

    res.json({
        success: true,
        whatsappLink
    });
});

/* orders by register */
app.get("/orders-by-register/:regno", (req, res) => {
    const filtered = loadOrders().filter(o => o.regNo === req.params.regno);
    res.json(filtered);
});

/* ================= START ================= */

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
