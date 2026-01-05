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
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// ====== Schemas ======
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    name: zod_1.z.string().min(1).optional(),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
function generateTokens(user) {
    const accessToken = jsonwebtoken_1.default.sign({
        sub: user.id,
        role: user.role, // 👈 embed role so admin checks work
    }, env_1.env.JWT_ACCESS_SECRET, { expiresIn: env_1.env.JWT_EXPIRES_IN });
    const refreshToken = jsonwebtoken_1.default.sign({ sub: user.id }, env_1.env.JWT_REFRESH_SECRET, { expiresIn: env_1.env.REFRESH_EXPIRES_IN });
    return { accessToken, refreshToken };
}
// ====== Routes ======
// POST /api/auth/register
router.post("/register", async (req, res) => {
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
        const existing = await prisma_1.prisma.user.findUnique({
            where: { email },
        });
        if (existing) {
            return res
                .status(409)
                .json({ success: false, message: "Email already in use" });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const user = await prisma_1.prisma.user.create({
            data: {
                email,
                passwordHash,
                name,
                // role will default to USER via Prisma enum default
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
            },
        });
        const tokens = generateTokens({ id: user.id, role: user.role });
        return res.status(201).json({
            success: true,
            message: "User registered successfully",
            user,
            ...tokens,
        });
    }
    catch (error) {
        console.error("Register error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// POST /api/auth/login
router.post("/login", async (req, res) => {
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
        const user = await prisma_1.prisma.user.findUnique({
            where: { email },
        });
        if (!user) {
            return res
                .status(401)
                .json({ success: false, message: "Invalid email or password" });
        }
        const isValid = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isValid) {
            return res
                .status(401)
                .json({ success: false, message: "Invalid email or password" });
        }
        const tokens = generateTokens({ id: user.id, role: user.role });
        const safeUser = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            createdAt: user.createdAt,
        };
        return res.json({
            success: true,
            message: "Login successful",
            user: safeUser,
            ...tokens,
        });
    }
    catch (error) {
        console.error("Login error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// GET /api/auth/me (protected)
router.get("/me", auth_1.requireAuth, async (req, res) => {
    try {
        // With the updated requireAuth, we expect req.user to be set
        if (!req.user?.id) {
            return res.status(401).json({
                success: false,
                message: "Unauthenticated",
            });
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
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
    }
    catch (error) {
        console.error("Get /me error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
exports.default = router;
