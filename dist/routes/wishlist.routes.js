"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/wishlist.routes.ts
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const idSchema = zod_1.z.object({
    productId: zod_1.z.string().min(1),
});
// ✅ GET /api/wishlist  (list my wishlist)
router.get("/", auth_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ success: false, message: "Unauthenticated" });
        }
        const items = await prisma_1.prisma.wishlistItem.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: "desc" },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        shortDesc: true,
                        description: true,
                        benefits: true,
                        priceKobo: true,
                        currency: true,
                        category: true,
                        imageUrl: true,
                        isAvailable: true,
                        createdAt: true,
                        vendor: { select: { businessName: true } },
                    },
                },
            },
        });
        return res.json({
            success: true,
            items: items.map((i) => ({
                id: i.id,
                createdAt: i.createdAt,
                product: i.product,
            })),
        });
    }
    catch (e) {
        console.error("Wishlist list error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
// ✅ GET /api/wishlist/ids  (fast: just product IDs)
router.get("/ids", auth_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ success: false, message: "Unauthenticated" });
        }
        const rows = await prisma_1.prisma.wishlistItem.findMany({
            where: { userId: req.userId },
            select: { productId: true },
        });
        return res.json({ success: true, productIds: rows.map((r) => r.productId) });
    }
    catch (e) {
        console.error("Wishlist ids error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
// ✅ POST /api/wishlist  { productId }  (add)
router.post("/", auth_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ success: false, message: "Unauthenticated" });
        }
        const parsed = idSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid input",
                errors: parsed.error.flatten(),
            });
        }
        const { productId } = parsed.data;
        // ensure product exists & public
        const product = await prisma_1.prisma.product.findFirst({
            where: { id: productId, isDeleted: false, isAvailable: true },
            select: { id: true },
        });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        // idempotent add
        const item = await prisma_1.prisma.wishlistItem.upsert({
            where: {
                userId_productId: {
                    userId: req.userId,
                    productId,
                },
            },
            update: {},
            create: {
                userId: req.userId,
                productId,
            },
        });
        return res.status(201).json({ success: true, message: "Added to wishlist", item });
    }
    catch (e) {
        console.error("Wishlist add error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
// ✅ DELETE /api/wishlist/:productId  (remove)
router.delete("/:productId", auth_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ success: false, message: "Unauthenticated" });
        }
        const productId = String(req.params.productId || "").trim();
        if (!productId) {
            return res.status(400).json({ success: false, message: "Missing productId" });
        }
        await prisma_1.prisma.wishlistItem.deleteMany({
            where: { userId: req.userId, productId },
        });
        return res.json({ success: true, message: "Removed from wishlist" });
    }
    catch (e) {
        console.error("Wishlist remove error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
exports.default = router;
