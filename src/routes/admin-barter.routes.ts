import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requireAdminAuth } from "../middleware/adminAuth";

const router = Router();

// ====== Schemas ======
const resolveDisputeSchema = z.object({
  resolution: z.string().min(1, "Resolution is required"),
  newStatus: z.enum(["CANCELLED", "COMPLETED"]),
});

const updateStatusSchema = z.object({
  status: z.enum([
    "DRAFT",
    "SENT",
    "COUNTERED",
    "ACCEPTED",
    "REJECTED",
    "CANCELLED",
    "IN_PROGRESS",
    "COMPLETED",
    "DISPUTED",
  ]),
});

// ====== Routes ======

// GET /api/admin/barter - List all barter offers
router.get("/", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const vendorId = req.query.vendorId as string | undefined;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (vendorId) {
      where.OR = [{ initiatorVendorId: vendorId }, { recipientVendorId: vendorId }];
    }

    const offers = await prisma.barterOffer.findMany({
      where,
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
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const transformed = offers.map((offer) => {
      const offeredItems = offer.items.filter((i) => i.isOffered);
      const requestedItems = offer.items.filter((i) => !i.isOffered);

      const offeredTotal = offeredItems.reduce((sum, i) => sum + i.valueCents * i.quantity, 0);
      const requestedTotal = requestedItems.reduce((sum, i) => sum + i.valueCents * i.quantity, 0);

      return {
        id: offer.id,
        status: offer.status,
        initiatorVendor: offer.initiatorVendor,
        recipientVendor: offer.recipientVendor,
        offeredCount: offeredItems.length,
        requestedCount: requestedItems.length,
        offeredTotalCents: offeredTotal,
        requestedTotalCents: requestedTotal,
        cashGapCents: offer.cashGapCents,
        cashGapDirection: offer.cashGapDirection,
        fulfilledByInitiator: offer.fulfilledByInitiator,
        fulfilledByRecipient: offer.fulfilledByRecipient,
        disputeReason: offer.disputeReason,
        createdAt: offer.createdAt,
        updatedAt: offer.updatedAt,
      };
    });

    return res.json({
      success: true,
      offers: transformed,
    });
  } catch (error) {
    console.error("Get barter offers error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/admin/barter/stats
router.get("/stats", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const [draft, sent, accepted, inProgress, completed, disputed, rejected, cancelled] =
      await Promise.all([
        prisma.barterOffer.count({ where: { status: "DRAFT" } }),
        prisma.barterOffer.count({ where: { status: "SENT" } }),
        prisma.barterOffer.count({ where: { status: "ACCEPTED" } }),
        prisma.barterOffer.count({ where: { status: "IN_PROGRESS" } }),
        prisma.barterOffer.count({ where: { status: "COMPLETED" } }),
        prisma.barterOffer.count({ where: { status: "DISPUTED" } }),
        prisma.barterOffer.count({ where: { status: "REJECTED" } }),
        prisma.barterOffer.count({ where: { status: "CANCELLED" } }),
      ]);

    return res.json({
      success: true,
      stats: {
        draft,
        sent,
        accepted,
        inProgress,
        completed,
        disputed,
        rejected,
        cancelled,
        total: draft + sent + accepted + inProgress + completed + disputed + rejected + cancelled,
      },
    });
  } catch (error) {
    console.error("Get barter stats error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/admin/barter/:id - Get offer details
router.get("/:id", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const offerId = req.params.id;

    const offer = await prisma.barterOffer.findUnique({
      where: { id: offerId },
      include: {
        initiatorVendor: {
          select: { id: true, businessName: true, email: true, phone: true },
        },
        recipientVendor: {
          select: { id: true, businessName: true, email: true, phone: true },
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

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    const offeredItems = offer.items.filter((i) => i.isOffered);
    const requestedItems = offer.items.filter((i) => !i.isOffered);

    return res.json({
      success: true,
      offer: {
        id: offer.id,
        status: offer.status,
        initiatorVendor: offer.initiatorVendor,
        recipientVendor: offer.recipientVendor,
        offeredItems: offeredItems.map((i) => ({
          id: i.id,
          product: i.product,
          quantity: i.quantity,
          valueCents: i.valueCents,
          totalCents: i.valueCents * i.quantity,
        })),
        requestedItems: requestedItems.map((i) => ({
          id: i.id,
          product: i.product,
          quantity: i.quantity,
          valueCents: i.valueCents,
          totalCents: i.valueCents * i.quantity,
        })),
        cashGapCents: offer.cashGapCents,
        cashGapDirection: offer.cashGapDirection,
        message: offer.message,
        counterOfMessage: offer.counterOfMessage,
        fulfilledByInitiator: offer.fulfilledByInitiator,
        fulfilledByRecipient: offer.fulfilledByRecipient,
        disputeReason: offer.disputeReason,
        disputeResolvedBy: offer.disputeResolvedBy,
        disputeResolution: offer.disputeResolution,
        parentOffer: offer.parentOffer,
        counterOffers: offer.counterOffers,
        createdAt: offer.createdAt,
        updatedAt: offer.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get barter offer error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/admin/barter/:id/resolve - Resolve a dispute
router.patch("/:id/resolve", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const offerId = req.params.id;
    const adminId = req.user?.id;

    const parsed = resolveDisputeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { resolution, newStatus } = parsed.data;

    const offer = await prisma.barterOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    if (offer.status !== "DISPUTED") {
      return res.status(400).json({
        success: false,
        message: "Only disputed offers can be resolved",
      });
    }

    const updatedOffer = await prisma.barterOffer.update({
      where: { id: offerId },
      data: {
        status: newStatus,
        disputeResolvedBy: adminId,
        disputeResolution: resolution,
      },
    });

    return res.json({
      success: true,
      message: `Dispute resolved. Offer marked as ${newStatus.toLowerCase()}.`,
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("Resolve dispute error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/admin/barter/:id/status - Force status change (admin override)
router.patch("/:id/status", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const offerId = req.params.id;

    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { status } = parsed.data;

    const offer = await prisma.barterOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    const updatedOffer = await prisma.barterOffer.update({
      where: { id: offerId },
      data: { status },
    });

    return res.json({
      success: true,
      message: `Offer status updated to ${status}`,
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("Update barter status error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
