"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/logistics.routes.ts
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const vendorAuth_1 = require("../middleware/vendorAuth");
const router = (0, express_1.Router)();
// ========= Zod Schemas =========
const createDeliverySchema = zod_1.z.object({
    orderId: zod_1.z.string().min(1),
    pickupLocation: zod_1.z.string().min(1),
    dropoffLocation: zod_1.z.string().min(1),
    riderName: zod_1.z.string().optional(),
    riderPhone: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
const updateStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(["PENDING", "ASSIGNED", "IN_TRANSIT", "COMPLETED", "CANCELLED"]),
    riderName: zod_1.z.string().optional(),
    riderPhone: zod_1.z.string().optional(),
});
// ========= Helpers =========
function genTrackingCode() {
    // FCQ-TRK-XXXXXX
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `FCQ-TRK-${rand}`;
}
function statusTitle(status) {
    const s = String(status || "").toUpperCase();
    const map = {
        PENDING: "Delivery created",
        ASSIGNED: "Rider assigned",
        IN_TRANSIT: "Shipment in transit",
        COMPLETED: "Delivered",
        CANCELLED: "Delivery cancelled",
    };
    return map[s] || `Status updated: ${s}`;
}
// =====================================================
// ✅ VENDOR: Create delivery for an order
// POST /api/vendor/deliveries
// =====================================================
router.post("/vendor/deliveries", vendorAuth_1.requireVendorAuth, async (req, res) => {
    try {
        if (!req.vendorId) {
            return res
                .status(401)
                .json({ success: false, message: "Unauthenticated vendor" });
        }
        let body = req.body;
        // If body comes in as a string, try to parse it
        if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            }
            catch (e) {
                console.error("Failed to parse string body as JSON:", e);
            }
        }
        const parsed = createDeliverySchema.safeParse(body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid input",
                errors: parsed.error.flatten(),
            });
        }
        const { orderId, pickupLocation, dropoffLocation, riderName, riderPhone, notes } = parsed.data;
        const order = await prisma_1.prisma.order.findFirst({
            where: { id: orderId, vendorId: req.vendorId },
            select: { id: true, userId: true, vendorId: true, paymentStatus: true },
        });
        if (!order) {
            return res
                .status(404)
                .json({ success: false, message: "Order not found for this vendor" });
        }
        if (order.paymentStatus !== "PAID") {
            return res.status(400).json({
                success: false,
                message: "Cannot create delivery for unpaid order",
            });
        }
        // Idempotent: return existing delivery for this order
        const existing = await prisma_1.prisma.delivery.findUnique({
            where: { orderId: order.id },
        });
        if (existing) {
            return res.status(200).json({
                success: true,
                message: "Delivery already exists for this order",
                delivery: existing,
            });
        }
        const delivery = await prisma_1.prisma.$transaction(async (tx) => {
            const created = await tx.delivery.create({
                data: {
                    orderId: order.id,
                    vendorId: order.vendorId,
                    userId: order.userId,
                    pickupLocation,
                    dropoffLocation,
                    riderName: riderName || null,
                    riderPhone: riderPhone || null,
                    notes: notes || null,
                    status: "PENDING",
                    trackingCode: genTrackingCode(),
                },
            });
            await tx.deliveryEvent.create({
                data: {
                    deliveryId: created.id,
                    status: "PENDING",
                    title: "Delivery created",
                },
            });
            return created;
        });
        return res.status(201).json({
            success: true,
            message: "Delivery task created",
            delivery,
        });
    }
    catch (error) {
        console.error("Vendor create delivery error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// =====================================================
// ✅ VENDOR: List their deliveries
// GET /api/vendor/deliveries
// =====================================================
router.get("/vendor/deliveries", vendorAuth_1.requireVendorAuth, async (req, res) => {
    try {
        if (!req.vendorId) {
            return res
                .status(401)
                .json({ success: false, message: "Unauthenticated vendor" });
        }
        const deliveries = await prisma_1.prisma.delivery.findMany({
            where: { vendorId: req.vendorId },
            orderBy: { createdAt: "desc" },
            include: {
                order: { select: { id: true, paymentStatus: true, status: true } },
                events: { orderBy: { createdAt: "asc" } }, // ✅ timeline
            },
        });
        return res.json({ success: true, deliveries });
    }
    catch (error) {
        console.error("Vendor list deliveries error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// =====================================================
// ✅ USER: My deliveries
// GET /api/my-deliveries
// =====================================================
router.get("/my-deliveries", auth_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId) {
            return res
                .status(401)
                .json({ success: false, message: "Unauthenticated" });
        }
        const deliveries = await prisma_1.prisma.delivery.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: "desc" },
            include: {
                order: { select: { id: true, paymentStatus: true, status: true } },
                events: { orderBy: { createdAt: "asc" } }, // ✅ timeline
            },
        });
        return res.json({ success: true, deliveries });
    }
    catch (error) {
        console.error("User list deliveries error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// =====================================================
// ✅ PUBLIC: Track shipment (NO AUTH)
// GET /api/logistics/track/:trackingCode
// =====================================================
router.get("/logistics/track/:trackingCode", async (req, res) => {
    try {
        const { trackingCode } = req.params;
        const shipment = await prisma_1.prisma.delivery.findUnique({
            where: { trackingCode },
            include: {
                events: { orderBy: { createdAt: "asc" } }, // ✅ THIS IS EXACTLY WHERE IT GOES
            },
        });
        if (!shipment) {
            return res
                .status(404)
                .json({ success: false, message: "Shipment not found" });
        }
        return res.json({ success: true, shipment });
    }
    catch (error) {
        console.error("Track shipment error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// =====================================================
// ✅ ADMIN: List all deliveries
// GET /api/admin/deliveries
// =====================================================
router.get("/admin/deliveries", auth_1.requireAuth, async (req, res) => {
    try {
        if (req.userRole !== "ADMIN") {
            return res
                .status(403)
                .json({ success: false, message: "Admin access required" });
        }
        const deliveries = await prisma_1.prisma.delivery.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                order: { select: { id: true, paymentStatus: true, status: true } },
                vendor: { select: { id: true, businessName: true } },
                user: { select: { id: true, email: true } },
                events: { orderBy: { createdAt: "asc" } },
            },
        });
        return res.json({ success: true, deliveries });
    }
    catch (error) {
        console.error("Admin list deliveries error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// =====================================================
// ✅ ADMIN: Update delivery status (+ create event)
// PATCH /api/admin/deliveries/:id/status
// =====================================================
router.patch("/admin/deliveries/:id/status", auth_1.requireAuth, async (req, res) => {
    try {
        if (req.userRole !== "ADMIN") {
            return res
                .status(403)
                .json({ success: false, message: "Admin access required" });
        }
        const { id } = req.params;
        const parsed = updateStatusSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid input",
                errors: parsed.error.flatten(),
            });
        }
        const { status, riderName, riderPhone } = parsed.data;
        const delivery = await prisma_1.prisma.$transaction(async (tx) => {
            const updated = await tx.delivery.update({
                where: { id },
                data: {
                    status,
                    riderName: riderName ?? undefined,
                    riderPhone: riderPhone ?? undefined,
                },
            });
            await tx.deliveryEvent.create({
                data: {
                    deliveryId: updated.id,
                    status,
                    title: statusTitle(status),
                },
            });
            return updated;
        });
        return res.json({
            success: true,
            message: "Delivery updated",
            delivery,
        });
    }
    catch (error) {
        console.error("Admin update delivery status error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
exports.default = router;
