require("dotenv").config({ quiet: true });

const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const mongoose = require("mongoose");
const { ZodError } = require("zod");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const authRoutes = require("./src/routes/auth");
const eventRoutes = require("./src/routes/events");
const organizerRoutes = require("./src/routes/organizer");
const accountRoutes = require("./src/routes/account");
const adminRoutes = require("./src/routes/admin");
const checkoutRoutes = require("./src/routes/checkout");
const razorpayWebhook = require("./src/routes/razorpay-webhook");
const Event = require("./src/models/Event");
const expirePendingOrders = require("./src/lib/expire-orders");
const { isTicketSigningConfigured } = require("./src/lib/tickets");
const { isRazorpayConfigured } = require("./src/lib/razorpay");

const app = express();
const rootDir = __dirname;
const appUrl = process.env.APP_URL || "http://localhost:3000";

app.set("trust proxy", process.env.TRUST_PROXY === "true");
app.use(helmet({
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      formAction: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
      frameSrc: ["'self'", "https://*.razorpay.com", "https://www.openstreetmap.org"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "https://checkout.razorpay.com", "https://cdn.razorpay.com"],
      connectSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com", "https://lumberjack.razorpay.com", "https://nominatim.openstreetmap.org"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      upgradeInsecureRequests: null
    }
  }
}));

app.post("/api/razorpay/webhook", express.raw({ type: "application/json", limit: "1mb" }), razorpayWebhook);
app.use(express.json({ limit: "100kb" }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });

app.get("/api/maintenance/expire-orders", async (request, response) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return response.status(503).json({ error: "Scheduled maintenance is not configured" });

  const authorization = Buffer.from(request.get("authorization") || "");
  const expectedAuthorization = Buffer.from(`Bearer ${secret}`);
  if (authorization.length !== expectedAuthorization.length
    || !crypto.timingSafeEqual(authorization, expectedAuthorization)) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  const expired = await expirePendingOrders();
  response.json({ expired });
});

app.get("/api/health", (request, response) => {
  response.json({
    status: "ok",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    checkoutConfigured: isRazorpayConfigured(),
    ticketQrConfigured: isTicketSigningConfigured()
  });
});
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/organizer", organizerRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/checkout", checkoutLimiter, checkoutRoutes);

app.get("/", (request, response) => response.sendFile(path.join(rootDir, "index.html")));
app.get("/dashboard", (request, response) => response.sendFile(path.join(rootDir, "dashboard.html")));
app.get("/styles.css", (request, response) => response.sendFile(path.join(rootDir, "styles.css")));
app.get("/app.js", (request, response) => response.sendFile(path.join(rootDir, "app.js")));
app.get("/dashboard.js", (request, response) => response.sendFile(path.join(rootDir, "dashboard.js")));
app.get("/organizer-dashboard.js", (request, response) => response.sendFile(path.join(rootDir, "organizer-dashboard.js")));
app.get("/address-search.js", (request, response) => response.sendFile(path.join(rootDir, "address-search.js")));
app.get("/event-placeholder.svg", (request, response) => response.sendFile(path.join(rootDir, "event-placeholder.svg")));

app.use("/api", (request, response) => response.status(404).json({ error: "API route not found" }));
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  if (error instanceof ZodError) {
    return response.status(400).json({ error: "Request validation failed", fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
  }
  if (error.code === 11000) return response.status(409).json({ error: "A record with that value already exists" });
  if (error.name === "CastError") return response.status(400).json({ error: "Invalid identifier" });
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  response.status(status).json({ error: status >= 500 && status !== 503 ? "Something went wrong" : error.message });
});

let databaseConnection;

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (!databaseConnection) {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error("MONGODB_URI is required. Configure it in the deployment environment.");
    databaseConnection = (async () => {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
      await Event.updateMany({ currency: { $ne: "inr" } }, { $set: { currency: "inr" } });
    })();
  }
  try {
    await databaseConnection;
  } finally {
    databaseConnection = null;
  }
}

async function start() {
  await connectDatabase();
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, () => console.log(`Gather is running at ${appUrl}`));

  const expiryTimer = setInterval(() => expirePendingOrders().catch(console.error), 60 * 1000);
  expiryTimer.unref();

  const shutdown = async () => {
    clearInterval(expiryTimer);
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

app.connectDatabase = connectDatabase;
app.start = start;

module.exports = app;