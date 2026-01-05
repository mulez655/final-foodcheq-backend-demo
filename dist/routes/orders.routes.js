"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/orders.routes.ts
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// -----------------------------
// Helpers (server FX conversion)
// -----------------------------
function getUsdNgnRate() {
    // Prefer ENV, fallback to 1600
    const fromEnv = Number(process.env.USD_NGN_RATE || 0);
    return fromEnv > 0 ? fromEnv : 1600;
}
// USD cents -> NGN kobo
function usdCentsToKobo(usdCents, rate) {
    // kobo = usdCents * rate (because (cents/100)*rate*100)
    return Math.round(Number(usdCents || 0) * Number(rate || 0));
}
// -----------------------------
// Validation
// -----------------------------
const orderItemSchema = zod_1.z.object({
    productId: zod_1.z.string().min(1),
    quantity: zod_1.z.number().int().min(1).max(100),
});
const createOrderSchema = zod_1.z.object({
    items: zod_1.z.array(orderItemSchema).min(1),
});
async function getProductsForItems(items) {
    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = await prisma_1.prisma.product.findMany({
        where: {
            id: { in: productIds },
            isDeleted: false,
            isAvailable: true,
        },
        select: {
            id: true,
            vendorId: true,
            priceUsdCents: true,
            name: true,
        },
    });
    const map = new Map();
    for (const p of products)
        map.set(p.id, p);
    return { products, map };
}
// =====================================================
// ✅ GET /api/orders  (list "my orders")
// =====================================================
router.get("/", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthenticated" });
        }
        const orders = await prisma_1.prisma.order.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            include: {
                vendor: {
                    select: { id: true, businessName: true, email: true },
                },
                items: {
                    select: {
                        id: true,
                        productId: true,
                        quantity: true,
                        unitPriceKobo: true,
                        subtotalKobo: true,
                    },
                },
                payments: true,
                delivery: true,
            },
        });
        return res.json({ success: true, orders });
    }
    catch (e) {
        console.error("List my orders error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
// =====================================================
// ✅ GET /api/orders/:id  (single order details)
// =====================================================
router.get("/:id", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthenticated" });
        }
        const { id } = req.params;
        const order = await prisma_1.prisma.order.findFirst({
            where: { id, userId },
            include: {
                vendor: {
                    select: { id: true, businessName: true, email: true },
                },
                items: {
                    select: {
                        id: true,
                        productId: true,
                        quantity: true,
                        unitPriceKobo: true,
                        subtotalKobo: true,
                    },
                },
                payments: true,
                delivery: true,
            },
        });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        return res.json({ success: true, order });
    }
    catch (e) {
        console.error("Get my order error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
// -----------------------------
// POST /api/orders  (your existing create order)
// -----------------------------
router.post("/", auth_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ success: false, message: "Unauthenticated" });
        }
        const parsed = createOrderSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid input",
                errors: parsed.error.flatten(),
            });
        }
        const items = parsed.data.items;
        const { map } = await getProductsForItems(items);
        // Validate all products exist
        for (const i of items) {
            if (!map.get(i.productId)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid product: ${i.productId}`,
                });
            }
        }
        // Vendor rule: one order must belong to one vendor (based on your schema)
        const firstProduct = map.get(items[0].productId);
        const vendorId = firstProduct.vendorId;
        for (const i of items) {
            const p = map.get(i.productId);
            if (p.vendorId !== vendorId) {
                return res.status(400).json({
                    success: false,
                    message: "Cart contains products from different vendors. Please checkout per vendor.",
                });
            }
        }
        // Compute totals in NGN using server FX rate
        const rate = getUsdNgnRate();
        let totalAmountKobo = 0;
        const orderItemsData = items.map((i) => {
            const p = map.get(i.productId);
            const unitPriceKobo = usdCentsToKobo(Number(p.priceUsdCents || 0), rate);
            const subtotalKobo = unitPriceKobo * Number(i.quantity || 1);
            totalAmountKobo += subtotalKobo;
            return {
                productId: p.id,
                quantity: i.quantity,
                unitPriceKobo,
                subtotalKobo,
            };
        });
        const order = await prisma_1.prisma.order.create({
            data: {
                userId: req.userId,
                vendorId,
                currency: "NGN",
                totalAmountKobo,
                items: { create: orderItemsData },
            },
            include: {
                items: true,
            },
        });
        return res.status(201).json({
            success: true,
            order,
            fx: { usdNgnRate: rate },
        });
    }
    catch (e) {
        console.error("Create order error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
exports.default = router;
