// src/routes/orders.routes.ts
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// -----------------------------
// Helpers (server FX conversion)
// -----------------------------
function getUsdNgnRate(): number {
  // Prefer ENV, fallback to 1600
  const fromEnv = Number(process.env.USD_NGN_RATE || 0);
  return fromEnv > 0 ? fromEnv : 1600;
}

// USD cents -> NGN kobo
function usdCentsToKobo(usdCents: number, rate: number) {
  // kobo = usdCents * rate (because (cents/100)*rate*100)
  return Math.round(Number(usdCents || 0) * Number(rate || 0));
}

// -----------------------------
// Shipping Fee Constants (in USD cents)
// -----------------------------
const SHIPPING_FEES_USD_CENTS = {
  standard: 500,  // $5.00
  express: 1500,  // $15.00
} as const;

type ShippingType = keyof typeof SHIPPING_FEES_USD_CENTS;
type PaymentMethod = "paypal" | "paystack";

// -----------------------------
// Validation
// -----------------------------
const orderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(100),
});

const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  paymentMethod: z.enum(["paypal", "paystack"]).default("paypal"),
  shippingType: z.enum(["standard", "express"]).default("standard"),
});

async function getProductsForItems(items: z.infer<typeof orderItemSchema>[]) {
  const productIds = [...new Set(items.map((i) => i.productId))];

  const products = await prisma.product.findMany({
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

  const map = new Map<string, (typeof products)[number]>();
  for (const p of products) map.set(p.id, p);

  return { products, map };
}

// =====================================================
// ✅ GET /api/orders  (list "my orders")
// =====================================================
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const orders = await prisma.order.findMany({
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
  } catch (e) {
    console.error("List my orders error:", e);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// =====================================================
// ✅ GET /api/orders/:id  (single order details)
// =====================================================
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const { id } = req.params;

    const order = await prisma.order.findFirst({
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
  } catch (e) {
    console.error("Get my order error:", e);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// -----------------------------
// POST /api/orders  (create order with payment method & shipping)
// -----------------------------
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

    const { items, paymentMethod, shippingType } = parsed.data;

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
    const firstProduct = map.get(items[0].productId)!;
    const vendorId = firstProduct.vendorId;

    for (const i of items) {
      const p = map.get(i.productId)!;
      if (p.vendorId !== vendorId) {
        return res.status(400).json({
          success: false,
          message: "Cart contains products from different vendors. Please checkout per vendor.",
        });
      }
    }

    // Get FX rate for conversions
    const rate = getUsdNgnRate();

    // Determine currency based on payment method
    const currency = paymentMethod === "paypal" ? "USD" : "NGN";

    // Calculate items subtotal in USD cents first
    let subtotalUsdCents = 0;
    items.forEach((i) => {
      const p = map.get(i.productId)!;
      subtotalUsdCents += Number(p.priceUsdCents || 0) * Number(i.quantity || 1);
    });

    // Get shipping fee in USD cents
    const shippingFeeUsdCents = SHIPPING_FEES_USD_CENTS[shippingType as ShippingType] || SHIPPING_FEES_USD_CENTS.standard;

    // Calculate totals based on currency
    let subtotalAmount: number;
    let shippingFee: number;
    let totalAmount: number;

    if (currency === "USD") {
      // PayPal: keep in USD cents
      subtotalAmount = subtotalUsdCents;
      shippingFee = shippingFeeUsdCents;
      totalAmount = subtotalAmount + shippingFee;
    } else {
      // Paystack: convert to NGN kobo
      subtotalAmount = usdCentsToKobo(subtotalUsdCents, rate);
      shippingFee = usdCentsToKobo(shippingFeeUsdCents, rate);
      totalAmount = subtotalAmount + shippingFee;
    }

    // Prepare order items data (store in the order's currency)
    const orderItemsData = items.map((i) => {
      const p = map.get(i.productId)!;
      const priceUsdCents = Number(p.priceUsdCents || 0);

      // Unit price in order's currency
      const unitPrice = currency === "USD" ? priceUsdCents : usdCentsToKobo(priceUsdCents, rate);
      const subtotal = unitPrice * Number(i.quantity || 1);

      return {
        productId: p.id,
        quantity: i.quantity,
        unitPriceKobo: unitPrice,  // Named "Kobo" but stores cents for USD orders
        subtotalKobo: subtotal,
      };
    });

    const order = await prisma.order.create({
      data: {
        userId: req.userId,
        vendorId,
        currency,
        paymentMethod,
        shippingType,
        subtotalAmount,
        shippingFee,
        totalAmountKobo: totalAmount,  // Named "Kobo" but stores cents for USD orders
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
  } catch (e) {
    console.error("Create order error:", e);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
