"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const env_1 = require("../config/env");
const vendorAuth_1 = require("../middleware/vendorAuth");
const router = (0, express_1.Router)();
// ====== Schemas ======
const vendorRegisterSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    businessName: zod_1.z.string().min(2),
    contactName: zod_1.z.string().min(1).optional(),
    phone: zod_1.z.string().min(6).optional(),
});
const vendorLoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
// ====== Helpers ======
function generateVendorTokens(vendorId) {
    const accessToken = jsonwebtoken_1.default.sign({ sub: vendorId }, env_1.env.JWT_ACCESS_SECRET, { expiresIn: env_1.env.JWT_EXPIRES_IN });
    const refreshToken = jsonwebtoken_1.default.sign({ sub: vendorId }, env_1.env.JWT_REFRESH_SECRET, { expiresIn: env_1.env.REFRESH_EXPIRES_IN });
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
        const existing = await prisma_1.prisma.vendor.findUnique({
            where: { email },
        });
        if (existing) {
            return res
                .status(409)
                .json({ success: false, message: "Email already in use" });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const vendor = await prisma_1.prisma.vendor.create({
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
    }
    catch (error) {
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
        const vendor = await prisma_1.prisma.vendor.findUnique({
            where: { email },
        });
        if (!vendor) {
            return res
                .status(401)
                .json({ success: false, message: "Invalid email or password" });
        }
        const isValid = await bcryptjs_1.default.compare(password, vendor.passwordHash);
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
    }
    catch (error) {
        console.error("Vendor login error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// GET /api/vendor/auth/me (protected)
router.get("/me", vendorAuth_1.requireVendorAuth, async (req, res) => {
    try {
        if (!req.vendorId) {
            return res.status(401).json({
                success: false,
                message: "Unauthenticated",
            });
        }
        const vendor = await prisma_1.prisma.vendor.findUnique({
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
    }
    catch (error) {
        console.error("Vendor /me error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
exports.default = router;
