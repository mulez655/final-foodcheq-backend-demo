"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma");
const env_1 = require("../config/env");
async function requireAuth(req, res, next) {
    try {
        const header = String(req.headers.authorization || "");
        if (!header.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const token = header.slice("Bearer ".length).trim();
        if (!token) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        // ✅ MUST match your auth.routes.ts (accessToken secret)
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET);
        const userId = decoded?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, name: true, role: true },
        });
        if (!user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        // Attach to request
        req.user = user;
        req.userId = user.id;
        req.userRole = user.role;
        return next();
    }
    catch (err) {
        // If token expired or invalid => 401
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
}
