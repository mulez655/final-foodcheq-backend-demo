import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z
    .string()
    .default("4000")
    .transform((value) => {
      const num = Number(value);
      if (Number.isNaN(num)) {
        throw new Error("PORT must be a number");
      }
      return num;
    }),

  DATABASE_URL: z.string().optional(),

  // Auth / JWT
  JWT_ACCESS_SECRET: z.string(),
  JWT_REFRESH_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_EXPIRES_IN: z.string().default("7d"),

  // Paystack (optional for now)
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  PAYSTACK_BASE_URL: z.string().default("https://api.paystack.co"),

  // PayPal (optional - sandbox mode by default)
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_MODE: z.enum(["sandbox", "live"]).default("sandbox"),

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("FoodCheQ <noreply@foodcheq.com>"),

  // Frontend URL for email links
  FRONTEND_URL: z.string().default("http://localhost:3000"),

  // Token expiry settings
  EMAIL_VERIFY_TOKEN_EXPIRY_HOURS: z.string().default("24").transform(Number),
  PASSWORD_RESET_TOKEN_EXPIRY_HOURS: z.string().default("1").transform(Number),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
