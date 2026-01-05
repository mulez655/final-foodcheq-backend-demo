// src/lib/fx.ts
import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

const FX_KEY = "USD_NGN_RATE";
const DEFAULT_RATE = 1600;

export async function getUsdNgnRate(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: FX_KEY } });
  const rate = row ? Number(row.value) : 0;
  return rate > 0 ? rate : DEFAULT_RATE;
}

export async function setUsdNgnRate(rate: number): Promise<void> {
  const r = Number(rate || 0);
  if (!Number.isFinite(r) || r <= 0) throw new Error("Invalid FX rate");

  await prisma.appSetting.upsert({
    where: { key: FX_KEY },
    update: { value: new Prisma.Decimal(r) },
    create: { key: FX_KEY, value: new Prisma.Decimal(r) },
  });
}

/**
 * USD cents -> NGN kobo
 * kobo = usdCents * rate (because: cents/100 * rate * 100)
 */
export function usdCentsToKobo(usdCents: number, rateNgnPerUsd: number): number {
  return Math.round(Number(usdCents || 0) * Number(rateNgnPerUsd || 0));
}
