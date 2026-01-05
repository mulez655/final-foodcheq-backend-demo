import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { generateToken, hashToken, getExpiryDate, isExpired } from "../services/tokens";
import { sendEmail, getVerificationEmailHtml, getPasswordResetEmailHtml } from "../services/email";

const router = Router();

// ====== Rate Limiting ======
// Limit login attempts: 5 requests per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit registration: 3 requests per hour per IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts
  message: {
    success: false,
    message: "Too many registration attempts. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit password reset requests: 3 per hour per IP
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    success: false,
    message: "Too many password reset requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ====== Schemas ======
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

// ====== Helpers ======

type UserRole = "USER" | "ADMIN";

function generateTokens(user: { id: string; role: UserRole }) {
  const accessToken = jwt.sign(
    {
      sub: user.id,
      role: user.role, // 👈 embed role so admin checks work
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  const refreshToken = jwt.sign(
    { sub: user.id },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.REFRESH_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
}

// ====== Routes ======

// POST /api/auth/register
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { email, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create user with emailVerified = false
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        emailVerified: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    // Generate verification token
    const rawToken = generateToken();
    const hashedToken = hashToken(rawToken);
    const expiresAt = getExpiryDate(env.EMAIL_VERIFY_TOKEN_EXPIRY_HOURS);

    // Store hashed token in database
    await prisma.emailVerificationToken.create({
      data: {
        token: hashedToken,
        userId: user.id,
        expiresAt,
      },
    });

    // Send verification email
    const verifyUrl = `${env.FRONTEND_URL}/email-verified.html?token=${rawToken}`;
    await sendEmail({
      to: email,
      subject: "Verify your FoodCheQ email",
      html: getVerificationEmailHtml(name || null, verifyUrl),
    });

    const tokens = generateTokens({ id: user.id, role: user.role as UserRole });

    return res.status(201).json({
      success: true,
      message: "User registered successfully. Please check your email to verify your account.",
      user,
      ...tokens,
    });
  } catch (error) {
    console.error("Register error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const tokens = generateTokens({ id: user.id, role: user.role as UserRole });

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      isPartner: user.isPartner,
      createdAt: user.createdAt,
    };

    return res.json({
      success: true,
      message: "Login successful",
      user: safeUser,
      ...tokens,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

// GET /api/auth/verify-email?token=...
router.get("/verify-email", async (req, res) => {
  try {
    const token = req.query.token as string;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification token is required",
      });
    }

    const hashedToken = hashToken(token);

    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!verificationToken) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification token",
      });
    }

    if (isExpired(verificationToken.expiresAt)) {
      // Delete expired token
      await prisma.emailVerificationToken.delete({
        where: { id: verificationToken.id },
      });
      return res.status(400).json({
        success: false,
        message: "Verification token has expired. Please request a new one.",
      });
    }

    // Update user as verified
    await prisma.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerified: true },
    });

    // Delete all verification tokens for this user
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: verificationToken.userId },
    });

    return res.json({
      success: true,
      message: "Email verified successfully. You can now log in.",
    });
  } catch (error) {
    console.error("Verify email error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

// POST /api/auth/resend-verification
router.post("/resend-verification", async (req, res) => {
  try {
    const parsed = resendVerificationSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Always return success to prevent email enumeration
    if (!user || user.emailVerified) {
      return res.json({
        success: true,
        message: "If your email is registered and unverified, you will receive a verification email.",
      });
    }

    // Check rate limit - only allow one resend per minute
    const recentToken = await prisma.emailVerificationToken.findFirst({
      where: {
        userId: user.id,
        createdAt: {
          gte: new Date(Date.now() - 60 * 1000), // Last 1 minute
        },
      },
    });

    if (recentToken) {
      return res.status(429).json({
        success: false,
        message: "Please wait a minute before requesting another verification email.",
      });
    }

    // Delete old tokens and create new one
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });

    const rawToken = generateToken();
    const hashedToken = hashToken(rawToken);
    const expiresAt = getExpiryDate(env.EMAIL_VERIFY_TOKEN_EXPIRY_HOURS);

    await prisma.emailVerificationToken.create({
      data: {
        token: hashedToken,
        userId: user.id,
        expiresAt,
      },
    });

    const verifyUrl = `${env.FRONTEND_URL}/email-verified.html?token=${rawToken}`;
    await sendEmail({
      to: email,
      subject: "Verify your FoodCheQ email",
      html: getVerificationEmailHtml(user.name, verifyUrl),
    });

    return res.json({
      success: true,
      message: "If your email is registered and unverified, you will receive a verification email.",
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { email } = parsed.data;

    // Always return success to prevent email enumeration
    const successResponse = {
      success: true,
      message: "If your email is registered, you will receive a password reset link.",
    };

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.json(successResponse);
    }

    // Check rate limit - only allow one reset per 5 minutes
    const recentToken = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        createdAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
        },
      },
    });

    if (recentToken) {
      return res.json(successResponse); // Still return success to prevent enumeration
    }

    // Delete old tokens and create new one
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    const rawToken = generateToken();
    const hashedToken = hashToken(rawToken);
    const expiresAt = getExpiryDate(env.PASSWORD_RESET_TOKEN_EXPIRY_HOURS);

    await prisma.passwordResetToken.create({
      data: {
        token: hashedToken,
        userId: user.id,
        expiresAt,
      },
    });

    const resetUrl = `${env.FRONTEND_URL}/reset-password.html?token=${rawToken}`;
    await sendEmail({
      to: email,
      subject: "Reset your FoodCheQ password",
      html: getPasswordResetEmailHtml(user.name, resetUrl),
    });

    return res.json(successResponse);
  } catch (error) {
    console.error("Forgot password error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { token, password } = parsed.data;
    const hashedToken = hashToken(token);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!resetToken) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    if (resetToken.used) {
      return res.status(400).json({
        success: false,
        message: "This reset token has already been used",
      });
    }

    if (isExpired(resetToken.expiresAt)) {
      await prisma.passwordResetToken.delete({
        where: { id: resetToken.id },
      });
      return res.status(400).json({
        success: false,
        message: "Reset token has expired. Please request a new one.",
      });
    }

    // Hash new password and update user
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
      // Delete all other reset tokens for this user
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: resetToken.userId,
          id: { not: resetToken.id },
        },
      }),
    ]);

    return res.json({
      success: true,
      message: "Password reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

// GET /api/auth/me (protected)
router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // With the updated requireAuth, we expect req.user to be set
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthenticated",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        isPartner: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get /me error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

export default router;
