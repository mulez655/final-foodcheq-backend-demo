"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/admin-products.routes.ts
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
function requireAdmin(req, res, next) {
    if (req.userRole !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Admin access required" });
    }
    next();
}
const ProductStatusEnum = zod_1.z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
const listQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    vendorId: zod_1.z.string().optional(),
    status: ProductStatusEnum.optional(),
    isAvailable: zod_1.z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true"))
        .pipe(zod_1.z.boolean().optional()),
    includeDeleted: zod_1.z
        .string()
        .optional()
        .transform((v) => (v === undefined ? false : v === "true"))
        .pipe(zod_1.z.boolean().default(false)),
    page: zod_1.z
        .string()
        .optional()
        .transform((v) => (v ? parseInt(v, 10) : 1))
        .pipe(zod_1.z.number().int().min(1).default(1)),
    pageSize: zod_1.z
        .string()
        .optional()
        .transform((v) => (v ? parseInt(v, 10) : 20))
        .pipe(zod_1.z.number().int().min(1).max(100).default(20)),
});
const patchSchema = zod_1.z.object({
    status: ProductStatusEnum.optional(),
    isAvailable: zod_1.z.boolean().optional(),
    isDeleted: zod_1.z.boolean().optional(),
});
// GET /api/admin/products
router.get("/", auth_1.requireAuth, requireAdmin, async (req, res) => {
    try {
        const parsed = listQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid query parameters",
                errors: parsed.error.flatten(),
            });
        }
        const { search, vendorId, status, isAvailable, includeDeleted, page, pageSize } = parsed.data;
        const skip = (page - 1) * pageSize;
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { category: { contains: search, mode: "insensitive" } },
                { vendor: { businessName: { contains: search, mode: "insensitive" } } },
                { vendor: { email: { contains: search, mode: "insensitive" } } },
            ];
        }
        if (vendorId)
            where.vendorId = vendorId;
        if (status)
            where.status = status;
        if (typeof isAvailable === "boolean")
            where.isAvailable = isAvailable;
        if (!includeDeleted)
            where.isDeleted = false;
        const [total, products] = await Promise.all([
            prisma_1.prisma.product.count({ where }),
            prisma_1.prisma.product.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    vendorId: true,
                    name: true,
                    category: true,
                    imageUrl: true,
                    status: true,
                    isAvailable: true,
                    isDeleted: true,
                    priceUsdCents: true,
                    createdAt: true,
                    updatedAt: true,
                    vendor: {
                        select: {
                            id: true,
                            businessName: true,
                            email: true,
                            status: true,
                            isActive: true,
                        },
                    },
                },
            }),
        ]);
        return res.json({
            success: true,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
            products,
        });
    }
    catch (e) {
        console.error("Admin list products error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
// GET /api/admin/products/:id (details)
router.get("/:id", auth_1.requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const product = await prisma_1.prisma.product.findUnique({
            where: { id },
            select: {
                id: true,
                vendorId: true,
                name: true,
                description: true,
                shortDesc: true,
                benefits: true,
                relatedIds: true,
                priceUsdCents: true,
                category: true,
                imageUrl: true,
                isAvailable: true,
                isDeleted: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                vendor: {
                    select: {
                        id: true,
                        businessName: true,
                        email: true,
                        contactName: true,
                        phone: true,
                        status: true,
                        isActive: true,
                        createdAt: true,
                    },
                },
            },
        });
        if (!product)
            return res.status(404).json({ success: false, message: "Product not found" });
        return res.json({ success: true, product });
    }
    catch (e) {
        console.error("Admin get product error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
// PATCH /api/admin/products/:id
router.patch("/:id", auth_1.requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const parsed = patchSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid input",
                errors: parsed.error.flatten(),
            });
        }
        const data = {};
        if (parsed.data.status)
            data.status = parsed.data.status;
        if (typeof parsed.data.isAvailable === "boolean")
            data.isAvailable = parsed.data.isAvailable;
        if (typeof parsed.data.isDeleted === "boolean")
            data.isDeleted = parsed.data.isDeleted;
        const product = await prisma_1.prisma.product.update({
            where: { id },
            data,
            select: {
                id: true,
                vendorId: true,
                name: true,
                category: true,
                imageUrl: true,
                status: true,
                isAvailable: true,
                isDeleted: true,
                priceUsdCents: true,
                updatedAt: true,
            },
        });
        return res.json({ success: true, message: "Product updated", product });
    }
    catch (e) {
        console.error("Admin patch product error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
exports.default = router;
