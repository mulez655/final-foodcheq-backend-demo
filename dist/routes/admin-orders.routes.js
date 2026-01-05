"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Adjust to match your actual enum values if needed
const OrderStatusEnum = zod_1.z.enum(["PENDING", "ACCEPTED", "COMPLETED", "CANCELLED"]);
const PaymentStatusEnum = zod_1.z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]);
// ===== Schemas =====
const listOrdersQuerySchema = zod_1.z.object({
    status: OrderStatusEnum.optional(),
    paymentStatus: PaymentStatusEnum.optional(),
    userId: zod_1.z.string().optional(),
    vendorId: zod_1.z.string().optional(),
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
const updateOrderStatusSchema = zod_1.z.object({
    status: OrderStatusEnum,
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
// GET /api/admin/orders
router.get("/", auth_1.requireAuth, requireAdmin, async (req, res) => {
    try {
        const parsed = listOrdersQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid query parameters",
                errors: parsed.error.flatten(),
            });
        }
        const { status, paymentStatus, userId, vendorId, page, pageSize } = parsed.data;
        const skip = (page - 1) * pageSize;
        const where = {};
        if (status)
            where.status = status;
        if (paymentStatus)
            where.paymentStatus = paymentStatus;
        if (userId)
            where.userId = userId;
        if (vendorId)
            where.vendorId = vendorId;
        const [total, orders] = await Promise.all([
            prisma_1.prisma.order.count({ where }),
            prisma_1.prisma.order.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { createdAt: "desc" },
                include: {
                    user: {
                        select: { id: true, email: true, name: true },
                    },
                    vendor: {
                        select: { id: true, businessName: true, email: true },
                    },
                    items: {
                        select: {
                            id: true,
                            productId: true,
                            quantity: true,
                            unitPriceKobo: true,
                            subtotalKobo: true, // ✅ use subtotalKobo here
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
            orders,
        });
    }
    catch (error) {
        console.error("Admin list orders error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// GET /api/admin/orders/:id
router.get("/:id", auth_1.requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const order = await prisma_1.prisma.order.findUnique({
            where: { id },
            include: {
                user: {
                    select: { id: true, email: true, name: true },
                },
                vendor: {
                    select: { id: true, businessName: true, email: true },
                },
                items: {
                    select: {
                        id: true,
                        productId: true,
                        quantity: true,
                        unitPriceKobo: true,
                        subtotalKobo: true, // ✅ and here too
                    },
                },
                payments: true,
                delivery: true,
            },
        });
        if (!order) {
            return res
                .status(404)
                .json({ success: false, message: "Order not found" });
        }
        return res.json({
            success: true,
            order,
        });
    }
    catch (error) {
        console.error("Admin get order error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// PATCH /api/admin/orders/:id/status
router.patch("/:id/status", auth_1.requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const parsed = updateOrderStatusSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid input",
                errors: parsed.error.flatten(),
            });
        }
        const { status } = parsed.data;
        const order = await prisma_1.prisma.order.update({
            where: { id },
            data: { status },
        });
        return res.json({
            success: true,
            message: "Order status updated",
            order,
        });
    }
    catch (error) {
        console.error("Admin update order status error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
exports.default = router;
