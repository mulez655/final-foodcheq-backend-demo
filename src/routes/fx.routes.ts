// src/routes/fx.routes.ts
import { Router, Response } from "express";
import { getUsdNgnRate } from "../lib/fx";

const router = Router();

// GET /api/fx/usd-ngn
router.get("/usd-ngn", async (_req, res: Response) => {
  try {
    const rate = await getUsdNgnRate();
    return res.json({ success: true, rate });
  } catch (e) {
    console.error("FX read error:", e);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
