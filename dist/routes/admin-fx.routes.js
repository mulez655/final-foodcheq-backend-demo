"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/admin-fx.routes.ts
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const adminAuth_1 = require("../middleware/adminAuth");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
const bodySchema = zod_1.z.object({
    rate: zod_1.z.number().positive(),
});
// GET /api/admin/fx/usd-ngn  -> returns current rate from AppSetting
router.get("/usd-ngn", auth_1.requireAuth, adminAuth_1.requireAdminAuth, async (req, res) => {
    try {
        const row = await prisma_1.prisma.appSetting.findUnique({
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
    }
    catch (e) {
        console.error("Admin FX get error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
// PATCH /api/admin/fx/usd-ngn -> saves current rate to AppSetting
router.patch("/usd-ngn", auth_1.requireAuth, adminAuth_1.requireAdminAuth, async (req, res) => {
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
        await prisma_1.prisma.appSetting.upsert({
            where: { key: "USD_NGN_RATE" },
            create: { key: "USD_NGN_RATE", value: rate },
            update: { value: rate },
        });
        return res.json({ success: true, message: "FX rate updated", rate });
    }
    catch (e) {
        console.error("Admin FX update error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
exports.default = router;
