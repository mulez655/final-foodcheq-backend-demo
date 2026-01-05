"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsdNgnRate = getUsdNgnRate;
exports.setUsdNgnRate = setUsdNgnRate;
exports.usdCentsToKobo = usdCentsToKobo;
// src/lib/fx.ts
const prisma_1 = require("./prisma");
const client_1 = require("@prisma/client");
const FX_KEY = "USD_NGN_RATE";
const DEFAULT_RATE = 1600;
async function getUsdNgnRate() {
    const row = await prisma_1.prisma.appSetting.findUnique({ where: { key: FX_KEY } });
    const rate = row ? Number(row.value) : 0;
    return rate > 0 ? rate : DEFAULT_RATE;
}
async function setUsdNgnRate(rate) {
    const r = Number(rate || 0);
    if (!Number.isFinite(r) || r <= 0)
        throw new Error("Invalid FX rate");
    await prisma_1.prisma.appSetting.upsert({
        where: { key: FX_KEY },
        update: { value: new client_1.Prisma.Decimal(r) },
        create: { key: FX_KEY, value: new client_1.Prisma.Decimal(r) },
    });
}
/**
 * USD cents -> NGN kobo
 * kobo = usdCents * rate (because: cents/100 * rate * 100)
 */
function usdCentsToKobo(usdCents, rateNgnPerUsd) {
    return Math.round(Number(usdCents || 0) * Number(rateNgnPerUsd || 0));
}
