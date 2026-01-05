"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Adjust to match your actual enum values if needed
const VendorStatusEnum = zod_1.z.enum(["PENDING", "APPROVED"]);
// ===== Zod Schemas =====
const listVendorsQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    status: VendorStatusEnum.optional(),
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
const updateVendorStatusSchema = zod_1.z.object({
    status: VendorStatusEnum,
    isActive: zod_1.z.boolean().optional(),
});
// ===== Middleware =====
function requireAdmin(req, res, next) {
    if (req.userRole !== "ADMIN") {
        return res.status(403).json({
            success: false,
            message: "Admin access required",
        });
    }
    next();
}
// ===== Routes =====
// GET /api/admin/vendors
router.get("/", auth_1.requireAuth, requireAdmin, async (req, res) => {
    try {
        const parsed = listVendorsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid query parameters",
                errors: parsed.error.flatten(),
            });
        }
        const { search, status, page, pageSize } = parsed.data;
        const skip = (page - 1) * pageSize;
        const where = {};
        if (search) {
            where.OR = [
                { email: { contains: search, mode: "insensitive" } },
                { businessName: { contains: search, mode: "insensitive" } },
                { contactName: { contains: search, mode: "insensitive" } },
            ];
        }
        if (status) {
            where.status = status;
        }
        const [total, vendors] = await Promise.all([
            prisma_1.prisma.vendor.count({ where }),
            prisma_1.prisma.vendor.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    email: true,
                    businessName: true,
                    contactName: true,
                    phone: true,
                    status: true,
                    isActive: true,
                    createdAt: true,
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
            vendors,
        });
    }
    catch (error) {
        console.error("Admin list vendors error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// PATCH /api/admin/vendors/:id/approve
router.patch("/:id/approve", auth_1.requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const vendor = await prisma_1.prisma.vendor.update({
            where: { id },
            data: {
                status: "APPROVED",
                isActive: true,
            },
            select: {
                id: true,
                email: true,
                businessName: true,
                contactName: true,
                phone: true,
                status: true,
                isActive: true,
                createdAt: true,
            },
        });
        return res.json({
            success: true,
            message: "Vendor approved",
            vendor,
        });
    }
    catch (error) {
        console.error("Admin approve vendor error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// PATCH /api/admin/vendors/:id/status
router.patch("/:id/status", auth_1.requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const parsed = updateVendorStatusSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid input",
                errors: parsed.error.flatten(),
            });
        }
        const { status, isActive } = parsed.data;
        const vendor = await prisma_1.prisma.vendor.update({
            where: { id },
            data: {
                status,
                ...(typeof isActive === "boolean" ? { isActive } : {}),
            },
            select: {
                id: true,
                email: true,
                businessName: true,
                contactName: true,
                phone: true,
                status: true,
                isActive: true,
                createdAt: true,
            },
        });
        return res.json({
            success: true,
            message: "Vendor status updated",
            vendor,
        });
    }
    catch (error) {
        console.error("Admin update vendor status error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
exports.default = router;
