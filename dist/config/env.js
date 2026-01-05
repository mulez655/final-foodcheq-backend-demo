"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z
        .enum(["development", "test", "production"])
        .default("development"),
    PORT: zod_1.z
        .string()
        .default("4000")
        .transform((value) => {
        const num = Number(value);
        if (Number.isNaN(num)) {
            throw new Error("PORT must be a number");
        }
        return num;
    }),
    DATABASE_URL: zod_1.z.string().optional(),
    // Auth / JWT
    JWT_ACCESS_SECRET: zod_1.z.string(),
    JWT_REFRESH_SECRET: zod_1.z.string(),
    JWT_EXPIRES_IN: zod_1.z.string().default("15m"),
    REFRESH_EXPIRES_IN: zod_1.z.string().default("7d"),
    // Paystack (optional for now)
    PAYSTACK_SECRET_KEY: zod_1.z.string().optional(),
    PAYSTACK_PUBLIC_KEY: zod_1.z.string().optional(),
    PAYSTACK_WEBHOOK_SECRET: zod_1.z.string().optional(),
    PAYSTACK_BASE_URL: zod_1.z.string().default("https://api.paystack.co"),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(parsed.error.format());
    process.exit(1);
}
exports.env = parsed.data;
