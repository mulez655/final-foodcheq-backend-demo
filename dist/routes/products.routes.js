"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
// ✅ Public list of products (FULL fields needed for product pages)
router.get("/", async (_req, res) => {
    try {
        const products = await prisma_1.prisma.product.findMany({
            where: { isDeleted: false, isAvailable: true },
            select: {
                id: true,
                name: true,
                description: true,
                shortDesc: true,
                benefits: true,
                relatedIds: true,
                priceUsdCents: true,
                category: true,
                imageUrl: true,
                isAvailable: true,
                createdAt: true,
                vendor: { select: { businessName: true } }, // ✅ optional for cards
            },
            orderBy: { createdAt: "desc" },
            take: 500,
        });
        return res.json({ success: true, products });
    }
    catch (e) {
        console.error("Public products error:", e);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// ✅ Public product details by ID
router.get("/:id", async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!id) {
            return res
                .status(400)
                .json({ success: false, message: "Missing product id" });
        }
        const product = await prisma_1.prisma.product.findFirst({
            where: { id, isDeleted: false, isAvailable: true },
            select: {
                id: true,
                name: true,
                description: true,
                shortDesc: true,
                benefits: true,
                relatedIds: true,
                priceUsdCents: true,
                category: true,
                imageUrl: true,
                isAvailable: true,
                createdAt: true,
                vendor: { select: { businessName: true } },
            },
        });
        if (!product) {
            return res
                .status(404)
                .json({ success: false, message: "Product not found" });
        }
        return res.json({ success: true, product });
    }
    catch (e) {
        console.error("Public product details error:", e);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// Resolve product IDs by name for legacy/static frontends
const resolveSchema = zod_1.z.object({
    names: zod_1.z.array(zod_1.z.string().min(1)).min(1),
});
router.post("/resolve", async (req, res) => {
    try {
        const parsed = resolveSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid input",
                errors: parsed.error.flatten(),
            });
        }
        const names = [
            ...new Set(parsed.data.names.map((n) => n.trim()).filter(Boolean)),
        ];
        const products = await prisma_1.prisma.product.findMany({
            where: { name: { in: names }, isDeleted: false, isAvailable: true },
            select: { id: true, name: true },
        });
        const mapping = {};
        for (const p of products)
            mapping[p.name] = p.id;
        return res.json({ success: true, mapping });
    }
    catch (e) {
        console.error("Resolve products error:", e);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
exports.default = router;
