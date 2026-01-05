// src/routes/wishlist.routes.ts
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

const idSchema = z.object({
  productId: z.string().min(1),
});

// ✅ GET /api/wishlist  (list my wishlist)
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const items = await prisma.wishlistItem.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            shortDesc: true,
            description: true,
            benefits: true,
            priceUsdCents: true,
            category: true,
            imageUrl: true,
            isAvailable: true,
            createdAt: true,
            vendor: { select: { businessName: true } },
          },
        },
      },
    });

    return res.json({
      success: true,
      items: items.map((i) => ({
        id: i.id,
        createdAt: i.createdAt,
        product: i.product,
      })),
    });
  } catch (e) {
    console.error("Wishlist list error:", e);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ✅ GET /api/wishlist/ids  (fast: just product IDs)
router.get("/ids", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const rows = await prisma.wishlistItem.findMany({
      where: { userId: req.userId },
      select: { productId: true },
    });

    return res.json({ success: true, productIds: rows.map((r) => r.productId) });
  } catch (e) {
    console.error("Wishlist ids error:", e);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ✅ POST /api/wishlist  { productId }  (add)
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const parsed = idSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { productId } = parsed.data;

    // ensure product exists & public
    const product = await prisma.product.findFirst({
      where: { id: productId, isDeleted: false, isAvailable: true },
      select: { id: true },
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // idempotent add
    const item = await prisma.wishlistItem.upsert({
      where: {
        userId_productId: {
          userId: req.userId,
          productId,
        },
      },
      update: {},
      create: {
        userId: req.userId,
        productId,
      },
    });

    return res.status(201).json({ success: true, message: "Added to wishlist", item });
  } catch (e) {
    console.error("Wishlist add error:", e);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ✅ DELETE /api/wishlist/:productId  (remove)
router.delete("/:productId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const productId = String(req.params.productId || "").trim();
    if (!productId) {
      return res.status(400).json({ success: false, message: "Missing productId" });
    }

    await prisma.wishlistItem.deleteMany({
      where: { userId: req.userId, productId },
    });

    return res.json({ success: true, message: "Removed from wishlist" });
  } catch (e) {
    console.error("Wishlist remove error:", e);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
