"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const vendorAuth_1 = require("../middleware/vendorAuth");
const router = (0, express_1.Router)();
// GET /api/vendor/orders  -> Vendor's orders
router.get("/", vendorAuth_1.requireVendorAuth, async (req, res) => {
    try {
        if (!req.vendorId) {
            return res.status(401).json({
                success: false,
                message: "Unauthenticated vendor",
            });
        }
        const orders = await prisma_1.prisma.order.findMany({
            where: { vendorId: req.vendorId },
            orderBy: { createdAt: "desc" },
            // ✅ include paymentStatus + amounts so FE can show Paid-only + totals
            select: {
                id: true,
                vendorId: true,
                userId: true,
                status: true,
                paymentStatus: true,
                totalAmountKobo: true,
                currency: true,
                createdAt: true,
                updatedAt: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                    },
                },
                items: {
                    select: {
                        id: true,
                        quantity: true,
                        unitPriceKobo: true,
                        subtotalKobo: true,
                        product: {
                            select: {
                                id: true,
                                name: true,
                                category: true,
                            },
                        },
                    },
                },
                // ✅ optional: show the latest payment record (handy for debugging)
                payments: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        id: true,
                        provider: true,
                        providerRef: true,
                        status: true,
                        amountKobo: true,
                        currency: true,
                        createdAt: true,
                    },
                },
            },
        });
        return res.json({
            success: true,
            orders,
        });
    }
    catch (error) {
        console.error("Vendor list orders error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});
// PATCH /api/vendor/orders/:orderId/accept
router.patch("/:orderId/accept", vendorAuth_1.requireVendorAuth, async (req, res) => {
    try {
        if (!req.vendorId) {
            return res.status(401).json({
                success: false,
                message: "Unauthenticated vendor",
            });
        }
        const { orderId } = req.params;
        const order = await prisma_1.prisma.order.findFirst({
            where: { id: orderId, vendorId: req.vendorId },
            select: { id: true, status: true, paymentStatus: true },
        });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }
        if (order.status === "CANCELLED" || order.status === "REJECTED") {
            return res.status(400).json({
                success: false,
                message: `Cannot accept an order that is ${order.status.toLowerCase()}`,
            });
        }
        if (order.status === "ACCEPTED") {
            return res.status(400).json({
                success: false,
                message: "Order is already accepted",
            });
        }
        // ✅ Paid-only rule
        if (order.paymentStatus !== "PAID") {
            return res.status(400).json({
                success: false,
                message: "Cannot accept an order until payment is PAID",
            });
        }
        const updated = await prisma_1.prisma.order.update({
            where: { id: order.id },
            data: { status: "ACCEPTED" },
            select: {
                id: true,
                status: true,
                paymentStatus: true,
                updatedAt: true,
            },
        });
        return res.json({
            success: true,
            message: "Order accepted",
            order: updated,
        });
    }
    catch (error) {
        console.error("Vendor accept order error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});
// PATCH /api/vendor/orders/:orderId/reject
router.patch("/:orderId/reject", vendorAuth_1.requireVendorAuth, async (req, res) => {
    try {
        if (!req.vendorId) {
            return res.status(401).json({
                success: false,
                message: "Unauthenticated vendor",
            });
        }
        const { orderId } = req.params;
        const order = await prisma_1.prisma.order.findFirst({
            where: { id: orderId, vendorId: req.vendorId },
            select: { id: true, status: true },
        });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }
        if (order.status === "CANCELLED") {
            return res.status(400).json({
                success: false,
                message: "Order is already cancelled",
            });
        }
        if (order.status === "REJECTED") {
            return res.status(400).json({
                success: false,
                message: "Order is already rejected",
            });
        }
        const updated = await prisma_1.prisma.order.update({
            where: { id: order.id },
            data: { status: "REJECTED" },
            select: {
                id: true,
                status: true,
                paymentStatus: true,
                updatedAt: true,
            },
        });
        return res.json({
            success: true,
            message: "Order rejected",
            order: updated,
        });
    }
    catch (error) {
        console.error("Vendor reject order error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});
// PATCH /api/vendor/orders/:orderId/status  -> Vendor updates order lifecycle
router.patch("/:orderId/status", vendorAuth_1.requireVendorAuth, async (req, res) => {
    try {
        if (!req.vendorId) {
            return res.status(401).json({
                success: false,
                message: "Unauthenticated vendor",
            });
        }
        const { orderId } = req.params;
        const { status } = req.body;
        const next = String(status || "").toUpperCase();
        // Allowed vendor lifecycle statuses
        const allowed = new Set(["PREPARING", "READY", "COMPLETED"]);
        if (!allowed.has(next)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status. Allowed: PREPARING, READY, COMPLETED",
            });
        }
        const order = await prisma_1.prisma.order.findFirst({
            where: { id: orderId, vendorId: req.vendorId },
            select: {
                id: true,
                status: true,
                paymentStatus: true,
            },
        });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }
        const current = String(order.status || "").toUpperCase();
        if (current === "CANCELLED" || current === "REJECTED") {
            return res.status(400).json({
                success: false,
                message: `Cannot update an order that is ${current.toLowerCase()}`,
            });
        }
        // Paid-only fulfillment rule
        if (order.paymentStatus !== "PAID") {
            return res.status(400).json({
                success: false,
                message: "Cannot update fulfillment status until payment is PAID",
            });
        }
        // Enforce correct step order
        const flow = ["ACCEPTED", "PREPARING", "READY", "COMPLETED"];
        const idxCurrent = flow.indexOf(current);
        const idxNext = flow.indexOf(next);
        if (idxCurrent === -1) {
            return res.status(400).json({
                success: false,
                message: `Order must be ACCEPTED before moving to ${next}`,
            });
        }
        if (idxNext <= idxCurrent) {
            return res.status(400).json({
                success: false,
                message: `Cannot move from ${current} to ${next}`,
            });
        }
        const updated = await prisma_1.prisma.order.update({
            where: { id: order.id },
            data: { status: next },
            select: {
                id: true,
                status: true,
                paymentStatus: true,
                updatedAt: true,
            },
        });
        return res.json({
            success: true,
            message: `Order updated to ${next}`,
            order: updated,
        });
    }
    catch (error) {
        console.error("Vendor update order status error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});
exports.default = router;
