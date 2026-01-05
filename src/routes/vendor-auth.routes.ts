import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import {
  requireVendorAuth,
  VendorAuthenticatedRequest,
} from "../middleware/vendorAuth";

const router = Router();

// ====== Schemas ======
const vendorRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  businessName: z.string().min(2),
  contactName: z.string().min(1).optional(),
  phone: z.string().min(6).optional(),
});

const vendorLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// ====== Helpers ======
function generateVendorTokens(vendorId: string) {
  const accessToken = jwt.sign(
    { sub: vendorId },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  const refreshToken = jwt.sign(
    { sub: vendorId },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.REFRESH_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
}

// ====== Routes ======

// POST /api/vendor/auth/register
router.post("/register", async (req, res) => {
  try {
    const parsed = vendorRegisterSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { email, password, businessName, contactName, phone } = parsed.data;

    const existing = await prisma.vendor.findUnique({
      where: { email },
    });

    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Email already in use" });
    }




    const passwordHash = await bcrypt.hash(password, 10);

    const vendor = await prisma.vendor.create({
      data: {
        email,
        passwordHash,
        businessName,
        contactName,
        phone,
        // status: PENDING by default
      },
      select: {
        id: true,
        email: true,
        businessName: true,
        contactName: true,
        phone: true,
        status: true,
        isActive: true,
        createdAt: true,
      },
    });

    const tokens = generateVendorTokens(vendor.id);

    return res.status(201).json({
      success: true,
      message: "Vendor registered successfully",
      vendor,
      ...tokens,
    });
  } catch (error) {
    console.error("Vendor register error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

// POST /api/vendor/auth/login
router.post("/login", async (req, res) => {
  try {
    const parsed = vendorLoginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { email, password } = parsed.data;

    const vendor = await prisma.vendor.findUnique({
      where: { email },
    });

    if (!vendor) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const isValid = await bcrypt.compare(password, vendor.passwordHash);

    if (!isValid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    console.log("Vendor login debug:", {
      email: vendor.email,
      status: vendor.status,
      isActive: vendor.isActive,
    });


    // Optional: restrict login if not approved
    if (vendor.status !== "APPROVED") {
      return res.status(403).json({
        success: false,
        message: "Vendor account not approved yet",
        status: vendor.status,
      });
    }

    const tokens = generateVendorTokens(vendor.id);

    const safeVendor = {
      id: vendor.id,
      email: vendor.email,
      businessName: vendor.businessName,
      contactName: vendor.contactName,
      phone: vendor.phone,
      status: vendor.status,
      isActive: vendor.isActive,
      createdAt: vendor.createdAt,
    };

    return res.json({
      success: true,
      message: "Vendor login successful",
      vendor: safeVendor,
      ...tokens,
    });
  } catch (error) {
    console.error("Vendor login error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

// GET /api/vendor/auth/me (protected)
router.get(
  "/me",
  requireVendorAuth,
  async (req: VendorAuthenticatedRequest, res) => {
    try {
      if (!req.vendorId) {
        return res.status(401).json({
          success: false,
          message: "Unauthenticated",
        });
      }

      const vendor = await prisma.vendor.findUnique({
        where: { id: req.vendorId },
        select: {
          id: true,
          email: true,
          businessName: true,
          contactName: true,
          phone: true,
          status: true,
          isActive: true,
          createdAt: true,
        },
      });

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      return res.json({
        success: true,
        vendor,
      });
    } catch (error) {
      console.error("Vendor /me error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

export default router;
