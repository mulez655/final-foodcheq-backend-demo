// src/routes/admin-fx.routes.ts
import { Router, Response } from "express";
import { z } from "zod";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requireAdminAuth } from "../middleware/adminAuth";
import { prisma } from "../lib/prisma";

const router = Router();

const bodySchema = z.object({
  rate: z.number().positive(),
});

// GET /api/admin/fx/usd-ngn  -> returns current rate from AppSetting
router.get("/usd-ngn", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: "USD_NGN_RATE" },
      select: { value: true, updatedAt: true },
    });

    // fallback default if not set yet
    const rate = row?.value ? Number(row.value) : 1600;

    return res.json({
      success: true,
      rate,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (e) {
    console.error("Admin FX get error:", e);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/admin/fx/usd-ngn -> saves current rate to AppSetting
router.patch("/usd-ngn", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const rate = parsed.data.rate;

    await prisma.appSetting.upsert({
      where: { key: "USD_NGN_RATE" },
      create: { key: "USD_NGN_RATE", value: rate },
      update: { value: rate },
    });

    return res.json({ success: true, message: "FX rate updated", rate });
  } catch (e) {
    console.error("Admin FX update error:", e);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
