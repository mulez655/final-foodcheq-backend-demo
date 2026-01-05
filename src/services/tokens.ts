import crypto from "crypto";

/**
 * Generate a random token for email verification or password reset
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hash a token for secure storage in database
 * We store hashed tokens so that even if the database is compromised,
 * the actual tokens cannot be used
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generate expiry date from now
 */
export function getExpiryDate(hours: number): Date {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date;
}

/**
 * Check if a date has passed
 */
export function isExpired(date: Date): boolean {
  return new Date() > date;
}
