"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("./config/env");
// ---------- Route Imports ----------
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const vendor_auth_routes_1 = __importDefault(require("./routes/vendor-auth.routes"));
const vendor_products_routes_1 = __importDefault(require("./routes/vendor-products.routes"));
const vendor_orders_routes_1 = __importDefault(require("./routes/vendor-orders.routes")); // ✅ ADD THIS
const orders_routes_1 = __importDefault(require("./routes/orders.routes"));
const payments_routes_1 = __importStar(require("./routes/payments.routes"));
const products_routes_1 = __importDefault(require("./routes/products.routes"));
const admin_users_routes_1 = __importDefault(require("./routes/admin-users.routes"));
const admin_vendors_routes_1 = __importDefault(require("./routes/admin-vendors.routes"));
const admin_orders_routes_1 = __importDefault(require("./routes/admin-orders.routes"));
const logistics_routes_1 = __importDefault(require("./routes/logistics.routes"));
const path_1 = __importDefault(require("path"));
const wishlist_routes_1 = __importDefault(require("./routes/wishlist.routes"));
const fx_routes_1 = __importDefault(require("./routes/fx.routes"));
const admin_fx_routes_1 = __importDefault(require("./routes/admin-fx.routes"));
const admin_products_routes_1 = __importDefault(require("./routes/admin-products.routes"));
const app = (0, express_1.default)();
app.use("/uploads", express_1.default.static(path_1.default.join(process.cwd(), "uploads")));
// ======================================================
// 🔵 Core Middleware
// ======================================================
app.use((0, cors_1.default)({
    origin: "*", // can tighten later
}));
app.use((0, morgan_1.default)("dev"));
// ======================================================
// 🔵 Paystack Webhook (RAW BODY) — MUST COME BEFORE express.json()
// ======================================================
app.post("/api/payments/paystack/webhook", express_1.default.raw({ type: "application/json" }), payments_routes_1.paystackWebhookHandler);
// ======================================================
// 🔵 JSON Body Parsers for normal endpoints
// ======================================================
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// ======================================================
// 🔵 PUBLIC USER ROUTES
// ======================================================
app.use("/api/auth", auth_routes_1.default);
app.use("/api/orders", orders_routes_1.default);
app.use("/api/payments", payments_routes_1.default);
app.use("/api/products", products_routes_1.default);
// ======================================================
// 🔵 VENDOR ROUTES
// ======================================================
app.use("/api/vendor/auth", vendor_auth_routes_1.default);
app.use("/api/vendor/products", vendor_products_routes_1.default);
app.use("/api/vendor/orders", vendor_orders_routes_1.default); // ✅ ADD THIS
// ======================================================
// 🔵 ADMIN ROUTES (split into separate files)
// ======================================================
app.use("/api/admin/users", admin_users_routes_1.default);
app.use("/api/admin/vendors", admin_vendors_routes_1.default);
app.use("/api/admin/orders", admin_orders_routes_1.default);
// ======================================================
// 🔵 LOGISTICS ROUTES (Vendor + User + Admin deliveries)
// ======================================================
app.use("/api", logistics_routes_1.default);
app.use("/api/wishlist", wishlist_routes_1.default);
app.use("/api/fx", fx_routes_1.default);
app.use("/api/admin/fx", admin_fx_routes_1.default);
app.use("/api/admin/products", admin_products_routes_1.default);
// ======================================================
// 🔵 Health Check
// ======================================================
app.get("/healthz", (req, res) => {
    res.json({ ok: true, env: env_1.env.NODE_ENV || "development" });
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
app.use((err, req, res, _next) => {
    console.error("Unhandled error middleware:", err);
    res.status(500).json({
        success: false,
        message: "Internal server error",
    });
});
exports.default = app;
