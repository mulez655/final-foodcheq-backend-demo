import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";

// ---------- Route Imports ----------
import authRoutes from "./routes/auth.routes";

import vendorAuthRoutes from "./routes/vendor-auth.routes";
import vendorProductsRoutes from "./routes/vendor-products.routes";
import vendorOrdersRoutes from "./routes/vendor-orders.routes";
import vendorBarterRoutes from "./routes/vendor-barter.routes";

import ordersRoutes from "./routes/orders.routes";

import paymentsRoutes, { paystackWebhookHandler } from "./routes/payments.routes";
import productsRoutes from "./routes/products.routes";

import adminUsersRoutes from "./routes/admin-users.routes";
import adminVendorsRoutes from "./routes/admin-vendors.routes";
import adminOrdersRoutes from "./routes/admin-orders.routes";
import adminPartnershipsRoutes from "./routes/admin-partnerships.routes";
import adminInvestmentsRoutes from "./routes/admin-investments.routes";
import adminBarterRoutes from "./routes/admin-barter.routes";
import adminPartnerContentRoutes from "./routes/admin-partner-content.routes";

import logisticsRoutes from "./routes/logistics.routes";
import path from "path";
import wishlistRoutes from "./routes/wishlist.routes";
import fxRoutes from "./routes/fx.routes";
import adminFxRoutes from "./routes/admin-fx.routes";
import adminProductsRoutes from "./routes/admin-products.routes";

import partnershipRoutes from "./routes/partnership.routes";





const app = express();

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ======================================================
// 🔵 Core Middleware
// ======================================================

// Security headers
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  env.FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5501",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, file://, etc.)
      if (!origin) return callback(null, true);

      // In development, allow all localhost origins
      if (env.NODE_ENV === "development") {
        if (!origin || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
          return callback(null, true);
        }
      }

      // Check against whitelist
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(morgan("dev"));

// ======================================================
// 🔵 Paystack Webhook (RAW BODY) — MUST COME BEFORE express.json()
// ======================================================
app.post(
  "/api/payments/paystack/webhook",
  express.raw({ type: "application/json" }),
  paystackWebhookHandler
);

// ======================================================
// 🔵 JSON Body Parsers for normal endpoints
// ======================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================================================
// 🔵 PUBLIC USER ROUTES
// ======================================================
app.use("/api/auth", authRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/payments", paymentsRoutes);

app.use("/api/products", productsRoutes);

// ======================================================
// 🔵 VENDOR ROUTES
// ======================================================
app.use("/api/vendor/auth", vendorAuthRoutes);
app.use("/api/vendor/products", vendorProductsRoutes);
app.use("/api/vendor/orders", vendorOrdersRoutes);
app.use("/api/vendor/barter", vendorBarterRoutes);

// ======================================================
// 🔵 ADMIN ROUTES (split into separate files)
// ======================================================
app.use("/api/admin/users", adminUsersRoutes);
app.use("/api/admin/vendors", adminVendorsRoutes);
app.use("/api/admin/orders", adminOrdersRoutes);
app.use("/api/admin/partnerships", adminPartnershipsRoutes);
app.use("/api/admin/investments", adminInvestmentsRoutes);
app.use("/api/admin/barter", adminBarterRoutes);
app.use("/api/admin/partner-content", adminPartnerContentRoutes);

// ======================================================
// 🔵 LOGISTICS ROUTES (Vendor + User + Admin deliveries)
// ======================================================
app.use("/api", logisticsRoutes);



app.use("/api/wishlist", wishlistRoutes);

app.use("/api/partnership", partnershipRoutes);

app.use("/api/fx", fxRoutes);

app.use("/api/admin/fx", adminFxRoutes);

app.use("/api/admin/products", adminProductsRoutes);


// ======================================================
// 🔵 Health Check
// ======================================================
app.get("/healthz", (req, res) => {
  res.json({ ok: true, env: env.NODE_ENV || "development" });
});

// ======================================================
// 🔴 404 Handler
// ======================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

// ======================================================
// 🔴 Global Error Handler
// ======================================================
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error middleware:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
);

export default app;
