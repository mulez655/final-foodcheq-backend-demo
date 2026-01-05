"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paystackWebhookHandler = void 0;
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const env_1 = require("../config/env");
const router = (0, express_1.Router)();
// -------------------------
// Validation
// -------------------------
const initPaymentSchema = zod_1.z.object({
    orderId: zod_1.z.string().min(1),
});
// ===========================================================
// 🔵 INIT PAYSTACK PAYMENT
// ===========================================================
// inside payments.routes.ts
router.post("/paystack/init", auth_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ success: false, message: "Unauthenticated" });
        }
        if (!env_1.env.PAYSTACK_SECRET_KEY) {
            return res.status(500).json({ success: false, message: "Paystack is not configured" });
        }
        const parsed = initPaymentSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid input",
                errors: parsed.error.flatten(),
            });
        }
        const { orderId } = parsed.data;
        // ✅ Make sure we always load the user's email
        const order = await prisma_1.prisma.order.findFirst({
            where: { id: orderId, userId: req.userId },
            select: {
                id: true,
                totalAmountKobo: true,
                currency: true,
                paymentStatus: true,
                status: true,
                userId: true,
                user: { select: { email: true } },
            },
        });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        if (order.paymentStatus === "PAID") {
            return res.status(400).json({ success: false, message: "Order is already paid" });
        }
        if (order.status === "CANCELLED") {
            return res.status(400).json({ success: false, message: "Cannot pay for a cancelled order" });
        }
        const email = (order.user?.email || "").trim();
        // ✅ If email is missing/invalid, stop BEFORE Paystack call
        if (!email || !email.includes("@")) {
            console.error("Paystack init blocked: missing/invalid user email", {
                orderId: order.id,
                userId: order.userId,
                emailFromDb: order.user?.email,
            });
            return res.status(400).json({
                success: false,
                message: "User email is missing/invalid for this order",
                debug: {
                    orderId: order.id,
                    userId: order.userId,
                    emailFromDb: order.user?.email ?? null,
                },
            });
        }
        const response = await axios_1.default.post(`${env_1.env.PAYSTACK_BASE_URL}/transaction/initialize`, {
            email,
            amount: order.totalAmountKobo,
            currency: order.currency,
            metadata: { orderId: order.id },
        }, {
            headers: {
                Authorization: `Bearer ${env_1.env.PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        });
        const data = response.data;
        if (!data.status) {
            return res.status(500).json({
                success: false,
                message: "Paystack initialization failed",
                paystack: data,
            });
        }
        const { authorization_url, reference } = data.data;
        await prisma_1.prisma.payment.create({
            data: {
                orderId: order.id,
                provider: "paystack",
                providerRef: reference,
                amountKobo: order.totalAmountKobo,
                currency: order.currency,
                status: "PENDING",
                rawResponse: data,
            },
        });
        return res.json({
            success: true,
            message: "Paystack payment initialized",
            authorizationUrl: authorization_url,
            reference,
        });
    }
    catch (error) {
        console.error("Paystack init error:", error?.response?.data || error?.message || error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
// ===========================================================
// 🔵 PAYSTACK WEBHOOK HANDLER (RAW BODY REQUIRED)
// ===========================================================
const paystackWebhookHandler = async (req, res) => {
    try {
        const webhookSecret = env_1.env.PAYSTACK_WEBHOOK_SECRET || env_1.env.PAYSTACK_SECRET_KEY;
        if (!webhookSecret) {
            console.error("Missing Paystack secret");
            res.sendStatus(500);
            return;
        }
        const signature = req.headers["x-paystack-signature"];
        if (!signature) {
            console.warn("Missing signature header");
            res.sendStatus(400);
            return;
        }
        const rawBody = req.body;
        // Verify signature
        const hash = crypto_1.default
            .createHmac("sha512", webhookSecret)
            .update(rawBody)
            .digest("hex");
        if (hash !== signature) {
            console.warn("Invalid webhook signature");
            res.sendStatus(400);
            return;
        }
        // Parse event
        const event = JSON.parse(rawBody.toString("utf8"));
        const eventType = event.event;
        const data = event.data;
        const reference = data?.reference;
        const status = data?.status;
        console.log("Received Paystack webhook:", {
            eventType,
            reference,
            status,
        });
        if (!reference) {
            res.sendStatus(200);
            return;
        }
        // Fetch payment record
        const payment = await prisma_1.prisma.payment.findFirst({
            where: { provider: "paystack", providerRef: reference },
            include: { order: true },
        });
        if (!payment) {
            console.warn("No payment found for reference:", reference);
            res.sendStatus(200);
            return;
        }
        // Idempotency (ignore repeated webhooks)
        if (payment.status === "PAID" || payment.status === "FAILED") {
            console.log("Payment already finalized, skipping.");
            res.sendStatus(200);
            return;
        }
        let newPaymentStatus = "PENDING";
        let newOrderPaymentStatus = "PENDING";
        if (eventType === "charge.success" && status === "success") {
            newPaymentStatus = "PAID";
            newOrderPaymentStatus = "PAID";
        }
        else if (eventType === "charge.failed" ||
            status === "failed" ||
            status === "reversed") {
            newPaymentStatus = "FAILED";
            newOrderPaymentStatus = "FAILED";
        }
        else {
            // Unknown event, just store raw payload
            await prisma_1.prisma.payment.update({
                where: { id: payment.id },
                data: { rawResponse: event },
            });
            res.sendStatus(200);
            return;
        }
        // Update database atomically
        await prisma_1.prisma.$transaction(async (tx) => {
            await tx.payment.update({
                where: { id: payment.id },
                data: {
                    status: newPaymentStatus,
                    rawResponse: event,
                },
            });
            await tx.order.update({
                where: { id: payment.orderId },
                data: {
                    paymentStatus: newOrderPaymentStatus,
                    // ✅ if payment is successful, move order forward
                    ...(newOrderPaymentStatus === "PAID" && payment.order.status === "PENDING"
                        ? { status: "ACCEPTED" }
                        : {}),
                },
            });
        });
        res.sendStatus(200);
    }
    catch (error) {
        console.error("Webhook handler error:", error);
        res.sendStatus(500);
    }
};
exports.paystackWebhookHandler = paystackWebhookHandler;
exports.default = router;
