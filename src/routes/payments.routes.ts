import { Router, Request, Response } from "express";
import axios from "axios";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { env } from "../config/env";

const router = Router();

// -------------------------
// Validation
// -------------------------
const initPaymentSchema = z.object({
  orderId: z.string().min(1),
});

const capturePaymentSchema = z.object({
  paypalOrderId: z.string().min(1),
  orderId: z.string().min(1),
});

// ===========================================================
// 🔵 PAYPAL HELPERS
// ===========================================================

function getPayPalBaseUrl(): string {
  return env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getPayPalAccessToken(): Promise<string> {
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials not configured");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await axios.post(
    `${getPayPalBaseUrl()}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data.access_token;
}

// ===========================================================
// 🔵 INIT PAYPAL PAYMENT
// ===========================================================

router.post(
  "/paypal/init",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ success: false, message: "Unauthenticated" });
      }

      if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
        return res.status(500).json({ success: false, message: "PayPal is not configured" });
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

      const order = await prisma.order.findFirst({
        where: { id: orderId, userId: req.userId },
        select: {
          id: true,
          totalAmountKobo: true,  // Actually stores cents for USD orders
          currency: true,
          paymentStatus: true,
          status: true,
          paymentMethod: true,
        },
      });

      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      if (order.paymentMethod !== "paypal") {
        return res.status(400).json({ success: false, message: "Order is not set for PayPal payment" });
      }

      if (order.paymentStatus === "PAID") {
        return res.status(400).json({ success: false, message: "Order is already paid" });
      }

      if (order.status === "CANCELLED") {
        return res.status(400).json({ success: false, message: "Cannot pay for a cancelled order" });
      }

      // Convert cents to dollars for PayPal
      const amountUsd = (order.totalAmountKobo / 100).toFixed(2);

      const accessToken = await getPayPalAccessToken();

      const paypalOrderResponse = await axios.post(
        `${getPayPalBaseUrl()}/v2/checkout/orders`,
        {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: order.id,
              amount: {
                currency_code: "USD",
                value: amountUsd,
              },
            },
          ],
          application_context: {
            return_url: `${env.FRONTEND_URL}/order-success.html?orderId=${order.id}&provider=paypal`,
            cancel_url: `${env.FRONTEND_URL}/checkout.html?cancelled=true`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const paypalOrder = paypalOrderResponse.data;
      const approvalLink = paypalOrder.links.find((link: any) => link.rel === "approve");

      if (!approvalLink) {
        return res.status(500).json({ success: false, message: "PayPal approval link not found" });
      }

      // Store payment record
      await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: "paypal",
          providerRef: paypalOrder.id,
          amountKobo: order.totalAmountKobo,  // Store in cents
          currency: "USD",
          status: "PENDING",
          rawResponse: paypalOrder,
        },
      });

      return res.json({
        success: true,
        message: "PayPal payment initialized",
        approvalUrl: approvalLink.href,
        paypalOrderId: paypalOrder.id,
      });
    } catch (error: any) {
      console.error("PayPal init error:", error?.response?.data || error?.message || error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
);

// ===========================================================
// 🔵 CAPTURE PAYPAL PAYMENT (after user approval)
// ===========================================================

router.post(
  "/paypal/capture",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ success: false, message: "Unauthenticated" });
      }

      const parsed = capturePaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: parsed.error.flatten(),
        });
      }

      const { paypalOrderId, orderId } = parsed.data;

      // Verify order belongs to user
      const order = await prisma.order.findFirst({
        where: { id: orderId, userId: req.userId },
      });

      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      // Find the payment record
      const payment = await prisma.payment.findFirst({
        where: { orderId, provider: "paypal", providerRef: paypalOrderId },
      });

      if (!payment) {
        return res.status(404).json({ success: false, message: "Payment not found" });
      }

      if (payment.status === "PAID") {
        return res.json({ success: true, message: "Payment already captured", orderId });
      }

      // Capture the payment
      const accessToken = await getPayPalAccessToken();

      const captureResponse = await axios.post(
        `${getPayPalBaseUrl()}/v2/checkout/orders/${paypalOrderId}/capture`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const captureData = captureResponse.data;

      if (captureData.status === "COMPLETED") {
        // Update payment and order status
        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: "PAID",
              rawResponse: captureData,
            },
          });

          await tx.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: "PAID",
              status: order.status === "PENDING" ? "ACCEPTED" : order.status,
            },
          });
        });

        return res.json({
          success: true,
          message: "Payment captured successfully",
          orderId,
        });
      } else {
        // Payment not completed
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "FAILED",
            rawResponse: captureData,
          },
        });

        return res.status(400).json({
          success: false,
          message: "Payment capture failed",
          status: captureData.status,
        });
      }
    } catch (error: any) {
      console.error("PayPal capture error:", error?.response?.data || error?.message || error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
);

// ===========================================================
// 🔵 INIT PAYSTACK PAYMENT
// ===========================================================

router.post(
  "/paystack/init",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ success: false, message: "Unauthenticated" });
      }

      if (!env.PAYSTACK_SECRET_KEY) {
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
      const order = await prisma.order.findFirst({
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
          message: "User email is missing or invalid for this order",
        });
      }

      const response = await axios.post(
        `${env.PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email,
          amount: order.totalAmountKobo,
          currency: order.currency,
          metadata: { orderId: order.id },
        },
        {
          headers: {
            Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = response.data;

      if (!data.status) {
        return res.status(500).json({
          success: false,
          message: "Paystack initialization failed",
          paystack: data,
        });
      }

      const { authorization_url, reference } = data.data;

      await prisma.payment.create({
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
    } catch (error: any) {
      console.error("Paystack init error:", error?.response?.data || error?.message || error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
);

// ===========================================================
// 🔵 PAYSTACK WEBHOOK HANDLER (RAW BODY REQUIRED)
// ===========================================================

export const paystackWebhookHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const webhookSecret =
      env.PAYSTACK_WEBHOOK_SECRET || env.PAYSTACK_SECRET_KEY;

    if (!webhookSecret) {
      console.error("Missing Paystack secret");
      res.sendStatus(500);
      return;
    }

    const signature = req.headers["x-paystack-signature"] as string;
    if (!signature) {
      console.warn("Missing signature header");
      res.sendStatus(400);
      return;
    }

    const rawBody = req.body as Buffer;

    // Verify signature
    const hash = crypto
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
    const payment = await prisma.payment.findFirst({
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

    let newPaymentStatus: "PENDING" | "PAID" | "FAILED" = "PENDING";
    let newOrderPaymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED" =
      "PENDING";

    if (eventType === "charge.success" && status === "success") {
      newPaymentStatus = "PAID";
      newOrderPaymentStatus = "PAID";
    } else if (
      eventType === "charge.failed" ||
      status === "failed" ||
      status === "reversed"
    ) {
      newPaymentStatus = "FAILED";
      newOrderPaymentStatus = "FAILED";
    } else {
      // Unknown event, just store raw payload
      await prisma.payment.update({
        where: { id: payment.id },
        data: { rawResponse: event },
      });
      res.sendStatus(200);
      return;
    }

    // Update database atomically
    await prisma.$transaction(async (tx) => {
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
  } catch (error) {
    console.error("Webhook handler error:", error);
    res.sendStatus(500);
  }
};

export default router;
