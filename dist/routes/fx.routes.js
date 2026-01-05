"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/fx.routes.ts
const express_1 = require("express");
const fx_1 = require("../lib/fx");
const router = (0, express_1.Router)();
// GET /api/fx/usd-ngn
router.get("/usd-ngn", async (_req, res) => {
    try {
        const rate = await (0, fx_1.getUsdNgnRate)();
        return res.json({ success: true, rate });
    }
    catch (e) {
        console.error("FX read error:", e);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
exports.default = router;
