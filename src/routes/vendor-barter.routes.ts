import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireVendorAuth } from "../middleware/vendorAuth";

const router = Router();

// ====== Schemas ======
const barterItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1),
  isOffered: z.boolean(), // true = vendor offers, false = vendor requests
});

const createOfferSchema = z.object({
  recipientVendorId: z.string().min(1),
  items: z.array(barterItemSchema).min(1),
  cashGapCents: z.number().int().min(0).default(0),
  cashGapDirection: z.enum(["INITIATOR_PAYS", "RECIPIENT_PAYS"]).optional(),
  message: z.string().optional(),
});

const updateOfferSchema = z.object({
  items: z.array(barterItemSchema).min(1).optional(),
  cashGapCents: z.number().int().min(0).optional(),
  cashGapDirection: z.enum(["INITIATOR_PAYS", "RECIPIENT_PAYS"]).optional().nullable(),
  message: z.string().optional(),
});

const counterOfferSchema = z.object({
  items: z.array(barterItemSchema).min(1),
  cashGapCents: z.number().int().min(0).default(0),
  cashGapDirection: z.enum(["INITIATOR_PAYS", "RECIPIENT_PAYS"]).optional(),
  message: z.string().optional(),
});

const disputeSchema = z.object({
  reason: z.string().min(1, "Dispute reason is required"),
});

// ====== Helper Functions ======
async function getOfferWithDetails(offerId: string) {
  return prisma.barterOffer.findUnique({
    where: { id: offerId },
    include: {
      initiatorVendor: {
        select: { id: true, businessName: true, email: true },
      },
      recipientVendor: {
        select: { id: true, businessName: true, email: true },
      },
      items: {
        include: {
          product: {
            select: { id: true, name: true, imageUrl: true, priceUsdCents: true },
          },
        },
      },
      parentOffer: {
        select: { id: true, status: true },
      },
      counterOffers: {
        select: { id: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

function transformOffer(offer: any, currentVendorId: string) {
  const offeredItems = offer.items.filter((i: any) => i.isOffered);
  const requestedItems = offer.items.filter((i: any) => !i.isOffered);

  const offeredTotal = offeredItems.reduce(
    (sum: number, i: any) => sum + i.valueCents * i.quantity,
    0
  );
  const requestedTotal = requestedItems.reduce(
    (sum: number, i: any) => sum + i.valueCents * i.quantity,
    0
  );

  return {
    id: offer.id,
    status: offer.status,
    isInitiator: offer.initiatorVendorId === currentVendorId,
    initiatorVendor: offer.initiatorVendor,
    recipientVendor: offer.recipientVendor,
    offeredItems: offeredItems.map((i: any) => ({
      id: i.id,
      product: i.product,
      quantity: i.quantity,
      valueCents: i.valueCents,
      totalCents: i.valueCents * i.quantity,
    })),
    requestedItems: requestedItems.map((i: any) => ({
      id: i.id,
      product: i.product,
      quantity: i.quantity,
      valueCents: i.valueCents,
      totalCents: i.valueCents * i.quantity,
    })),
    offeredTotalCents: offeredTotal,
    requestedTotalCents: requestedTotal,
    cashGapCents: offer.cashGapCents,
    cashGapDirection: offer.cashGapDirection,
    message: offer.message,
    counterOfMessage: offer.counterOfMessage,
    fulfilledByInitiator: offer.fulfilledByInitiator,
    fulfilledByRecipient: offer.fulfilledByRecipient,
    disputeReason: offer.disputeReason,
    disputeResolution: offer.disputeResolution,
    parentOfferId: offer.parentOfferId,
    counterOffers: offer.counterOffers,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
}

// ====== Routes ======

// GET /api/vendor/barter/vendors - List other vendors for recipient selection
router.get("/vendors", requireVendorAuth, async (req: any, res) => {
  try {
    const currentVendorId = req.vendorId;

    const vendors = await prisma.vendor.findMany({
      where: {
        id: { not: currentVendorId },
        status: "APPROVED",
        isActive: true,
      },
      select: {
        id: true,
        businessName: true,
        _count: {
          select: {
            products: {
              where: { isDeleted: false, isAvailable: true, status: "ACTIVE" },
            },
          },
        },
      },
      orderBy: { businessName: "asc" },
    });

    return res.json({
      success: true,
      vendors: vendors.map((v) => ({
        id: v.id,
        businessName: v.businessName,
        productCount: v._count.products,
      })),
    });
  } catch (error) {
    console.error("Get vendors error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/vendor/barter/vendors/:id/products - Get products of a specific vendor
router.get("/vendors/:id/products", requireVendorAuth, async (req: any, res) => {
  try {
    const vendorId = req.params.id;

    const products = await prisma.product.findMany({
      where: {
        vendorId,
        isDeleted: false,
        isAvailable: true,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        priceUsdCents: true,
        category: true,
      },
      orderBy: { name: "asc" },
    });

    return res.json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Get vendor products error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/vendor/barter/offers - List my offers (sent + received)
router.get("/offers", requireVendorAuth, async (req: any, res) => {
  try {
    const vendorId = req.vendorId;
    const status = req.query.status as string | undefined;
    const type = req.query.type as "sent" | "received" | undefined;

    const where: any = {
      OR: [{ initiatorVendorId: vendorId }, { recipientVendorId: vendorId }],
    };

    if (status) {
      where.status = status;
    }

    if (type === "sent") {
      where.OR = undefined;
      where.initiatorVendorId = vendorId;
    } else if (type === "received") {
      where.OR = undefined;
      where.recipientVendorId = vendorId;
    }

    const offers = await prisma.barterOffer.findMany({
      where,
      include: {
        initiatorVendor: {
          select: { id: true, businessName: true },
        },
        recipientVendor: {
          select: { id: true, businessName: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, imageUrl: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const transformed = offers.map((offer) => ({
      id: offer.id,
      status: offer.status,
      isInitiator: offer.initiatorVendorId === vendorId,
      otherVendor:
        offer.initiatorVendorId === vendorId
          ? offer.recipientVendor
          : offer.initiatorVendor,
      itemCount: offer.items.length,
      offeredCount: offer.items.filter((i) => i.isOffered).length,
      requestedCount: offer.items.filter((i) => !i.isOffered).length,
      cashGapCents: offer.cashGapCents,
      cashGapDirection: offer.cashGapDirection,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    }));

    return res.json({
      success: true,
      offers: transformed,
    });
  } catch (error) {
    console.error("Get offers error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/vendor/barter/offers/:id - Get offer details
router.get("/offers/:id", requireVendorAuth, async (req: any, res) => {
  try {
    const vendorId = req.vendorId;
    const offerId = req.params.id;

    const offer = await getOfferWithDetails(offerId);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    // Check if vendor is part of this offer
    if (offer.initiatorVendorId !== vendorId && offer.recipientVendorId !== vendorId) {
      return res.status(403).json({
        success: false,
        message: "You are not part of this offer",
      });
    }

    return res.json({
      success: true,
      offer: transformOffer(offer, vendorId),
    });
  } catch (error) {
    console.error("Get offer error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/vendor/barter/offers - Create a new offer
router.post("/offers", requireVendorAuth, async (req: any, res) => {
  try {
    const initiatorVendorId = req.vendorId;

    const parsed = createOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { recipientVendorId, items, cashGapCents, cashGapDirection, message } = parsed.data;

    // Validate recipient vendor exists and is not self
    if (recipientVendorId === initiatorVendorId) {
      return res.status(400).json({
        success: false,
        message: "Cannot create offer to yourself",
      });
    }

    const recipientVendor = await prisma.vendor.findUnique({
      where: { id: recipientVendorId },
    });

    if (!recipientVendor || recipientVendor.status !== "APPROVED" || !recipientVendor.isActive) {
      return res.status(400).json({
        success: false,
        message: "Recipient vendor not found or not active",
      });
    }

    // Validate products and get prices
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, vendorId: true, priceUsdCents: true, isAvailable: true, isDeleted: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validate each item
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product ${item.productId} not found`,
        });
      }

      if (product.isDeleted || !product.isAvailable) {
        return res.status(400).json({
          success: false,
          message: `Product ${item.productId} is not available`,
        });
      }

      // Offered items must belong to initiator
      if (item.isOffered && product.vendorId !== initiatorVendorId) {
        return res.status(400).json({
          success: false,
          message: "You can only offer your own products",
        });
      }

      // Requested items must belong to recipient
      if (!item.isOffered && product.vendorId !== recipientVendorId) {
        return res.status(400).json({
          success: false,
          message: "You can only request products from the recipient vendor",
        });
      }
    }

    // Create offer with items
    const offer = await prisma.barterOffer.create({
      data: {
        initiatorVendorId,
        recipientVendorId,
        status: "DRAFT",
        cashGapCents,
        cashGapDirection: cashGapCents > 0 ? cashGapDirection : null,
        message,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            valueCents: productMap.get(item.productId)!.priceUsdCents,
            isOffered: item.isOffered,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Offer created as draft",
      offer,
    });
  } catch (error) {
    console.error("Create offer error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/vendor/barter/offers/:id - Update draft offer
router.patch("/offers/:id", requireVendorAuth, async (req: any, res) => {
  try {
    const vendorId = req.vendorId;
    const offerId = req.params.id;

    const offer = await prisma.barterOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    if (offer.initiatorVendorId !== vendorId) {
      return res.status(403).json({
        success: false,
        message: "Only the initiator can update the offer",
      });
    }

    if (offer.status !== "DRAFT") {
      return res.status(400).json({
        success: false,
        message: "Only draft offers can be updated",
      });
    }

    const parsed = updateOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { items, cashGapCents, cashGapDirection, message } = parsed.data;

    // If items are provided, replace all items
    if (items) {
      const productIds = items.map((i) => i.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, vendorId: true, priceUsdCents: true },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      await prisma.$transaction([
        prisma.barterItem.deleteMany({ where: { offerId } }),
        prisma.barterItem.createMany({
          data: items.map((item) => ({
            offerId,
            productId: item.productId,
            quantity: item.quantity,
            valueCents: productMap.get(item.productId)!.priceUsdCents,
            isOffered: item.isOffered,
          })),
        }),
      ]);
    }

    const updatedOffer = await prisma.barterOffer.update({
      where: { id: offerId },
      data: {
        ...(cashGapCents !== undefined && { cashGapCents }),
        ...(cashGapDirection !== undefined && { cashGapDirection }),
        ...(message !== undefined && { message }),
      },
    });

    return res.json({
      success: true,
      message: "Offer updated",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("Update offer error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/vendor/barter/offers/:id/send - Send draft offer
router.post("/offers/:id/send", requireVendorAuth, async (req: any, res) => {
  try {
    const vendorId = req.vendorId;
    const offerId = req.params.id;

    const offer = await prisma.barterOffer.findUnique({
      where: { id: offerId },
      include: { items: true },
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    if (offer.initiatorVendorId !== vendorId) {
      return res.status(403).json({
        success: false,
        message: "Only the initiator can send the offer",
      });
    }

    if (offer.status !== "DRAFT") {
      return res.status(400).json({
        success: false,
        message: "Only draft offers can be sent",
      });
    }

    if (offer.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot send an empty offer",
      });
    }

    const updatedOffer = await prisma.barterOffer.update({
      where: { id: offerId },
      data: { status: "SENT" },
    });

    return res.json({
      success: true,
      message: "Offer sent successfully",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("Send offer error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/vendor/barter/offers/:id/accept - Accept offer
router.post("/offers/:id/accept", requireVendorAuth, async (req: any, res) => {
  try {
    const vendorId = req.vendorId;
    const offerId = req.params.id;

    const offer = await prisma.barterOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    if (offer.recipientVendorId !== vendorId) {
      return res.status(403).json({
        success: false,
        message: "Only the recipient can accept the offer",
      });
    }

    if (!["SENT", "COUNTERED"].includes(offer.status)) {
      return res.status(400).json({
        success: false,
        message: "This offer cannot be accepted",
      });
    }

    const updatedOffer = await prisma.barterOffer.update({
      where: { id: offerId },
      data: { status: "ACCEPTED" },
    });

    return res.json({
      success: true,
      message: "Offer accepted! You can now proceed with fulfillment.",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("Accept offer error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/vendor/barter/offers/:id/reject - Reject offer
router.post("/offers/:id/reject", requireVendorAuth, async (req: any, res) => {
  try {
    const vendorId = req.vendorId;
    const offerId = req.params.id;

    const offer = await prisma.barterOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    if (offer.recipientVendorId !== vendorId) {
      return res.status(403).json({
        success: false,
        message: "Only the recipient can reject the offer",
      });
    }

    if (!["SENT", "COUNTERED"].includes(offer.status)) {
      return res.status(400).json({
        success: false,
        message: "This offer cannot be rejected",
      });
    }

    const updatedOffer = await prisma.barterOffer.update({
      where: { id: offerId },
      data: { status: "REJECTED" },
    });

    return res.json({
      success: true,
      message: "Offer rejected",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("Reject offer error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/vendor/barter/offers/:id/counter - Create counter-offer
router.post("/offers/:id/counter", requireVendorAuth, async (req: any, res) => {
  try {
    const vendorId = req.vendorId;
    const offerId = req.params.id;

    const originalOffer = await prisma.barterOffer.findUnique({
      where: { id: offerId },
    });

    if (!originalOffer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    if (originalOffer.recipientVendorId !== vendorId) {
      return res.status(403).json({
        success: false,
        message: "Only the recipient can counter the offer",
      });
    }

    if (!["SENT", "COUNTERED"].includes(originalOffer.status)) {
      return res.status(400).json({
        success: false,
        message: "This offer cannot be countered",
      });
    }

    const parsed = counterOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { items, cashGapCents, cashGapDirection, message } = parsed.data;

    // Validate products
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, vendorId: true, priceUsdCents: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // In counter-offer, roles are swapped: recipient becomes initiator
    const counterOffer = await prisma.$transaction(async (tx) => {
      // Mark original as countered
      await tx.barterOffer.update({
        where: { id: offerId },
        data: { status: "COUNTERED" },
      });

      // Create counter-offer (swap initiator and recipient)
      return tx.barterOffer.create({
        data: {
          initiatorVendorId: vendorId, // Current recipient becomes initiator
          recipientVendorId: originalOffer.initiatorVendorId, // Original initiator becomes recipient
          status: "SENT",
          cashGapCents,
          cashGapDirection: cashGapCents > 0 ? cashGapDirection : null,
          message,
          counterOfMessage: `Counter-offer to offer ${offerId}`,
          parentOfferId: offerId,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              valueCents: productMap.get(item.productId)!.priceUsdCents,
              isOffered: item.isOffered,
            })),
          },
        },
      });
    });

    return res.status(201).json({
      success: true,
      message: "Counter-offer sent",
      offer: counterOffer,
    });
  } catch (error) {
    console.error("Counter offer error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/vendor/barter/offers/:id/cancel - Cancel offer
router.post("/offers/:id/cancel", requireVendorAuth, async (req: any, res) => {
  try {
    const vendorId = req.vendorId;
    const offerId = req.params.id;

    const offer = await prisma.barterOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    if (offer.initiatorVendorId !== vendorId) {
      return res.status(403).json({
        success: false,
        message: "Only the initiator can cancel the offer",
      });
    }

    if (!["DRAFT", "SENT"].includes(offer.status)) {
      return res.status(400).json({
        success: false,
        message: "This offer cannot be cancelled",
      });
    }

    const updatedOffer = await prisma.barterOffer.update({
      where: { id: offerId },
      data: { status: "CANCELLED" },
    });

    return res.json({
      success: true,
      message: "Offer cancelled",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("Cancel offer error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/vendor/barter/offers/:id/fulfill - Mark my side as fulfilled
router.post("/offers/:id/fulfill", requireVendorAuth, async (req: any, res) => {
  try {
    const vendorId = req.vendorId;
    const offerId = req.params.id;

    const offer = await prisma.barterOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    const isInitiator = offer.initiatorVendorId === vendorId;
    const isRecipient = offer.recipientVendorId === vendorId;

    if (!isInitiator && !isRecipient) {
      return res.status(403).json({
        success: false,
        message: "You are not part of this offer",
      });
    }

    if (offer.status !== "ACCEPTED" && offer.status !== "IN_PROGRESS") {
      return res.status(400).json({
        success: false,
        message: "Only accepted or in-progress offers can be fulfilled",
      });
    }

    const updateData: any = {};
    if (isInitiator) {
      if (offer.fulfilledByInitiator) {
        return res.status(400).json({
          success: false,
          message: "You have already marked your side as fulfilled",
        });
      }
      updateData.fulfilledByInitiator = true;
    } else {
      if (offer.fulfilledByRecipient) {
        return res.status(400).json({
          success: false,
          message: "You have already marked your side as fulfilled",
        });
      }
      updateData.fulfilledByRecipient = true;
    }

    // Check if both sides will be fulfilled
    const willBeComplete =
      (isInitiator && offer.fulfilledByRecipient) ||
      (isRecipient && offer.fulfilledByInitiator);

    if (willBeComplete) {
      updateData.status = "COMPLETED";
    } else if (offer.status === "ACCEPTED") {
      updateData.status = "IN_PROGRESS";
    }

    const updatedOffer = await prisma.barterOffer.update({
      where: { id: offerId },
      data: updateData,
    });

    return res.json({
      success: true,
      message: willBeComplete
        ? "Barter completed! Both parties have fulfilled their obligations."
        : "Your side marked as fulfilled. Waiting for the other party.",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("Fulfill offer error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/vendor/barter/offers/:id/dispute - Raise a dispute
router.post("/offers/:id/dispute", requireVendorAuth, async (req: any, res) => {
  try {
    const vendorId = req.vendorId;
    const offerId = req.params.id;

    const parsed = disputeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { reason } = parsed.data;

    const offer = await prisma.barterOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    if (offer.initiatorVendorId !== vendorId && offer.recipientVendorId !== vendorId) {
      return res.status(403).json({
        success: false,
        message: "You are not part of this offer",
      });
    }

    if (!["ACCEPTED", "IN_PROGRESS"].includes(offer.status)) {
      return res.status(400).json({
        success: false,
        message: "Only accepted or in-progress offers can be disputed",
      });
    }

    const updatedOffer = await prisma.barterOffer.update({
      where: { id: offerId },
      data: {
        status: "DISPUTED",
        disputeReason: reason,
      },
    });

    return res.json({
      success: true,
      message: "Dispute raised. An admin will review this case.",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("Dispute offer error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
