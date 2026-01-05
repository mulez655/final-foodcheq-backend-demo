"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireVendorAuth = requireVendorAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
function requireVendorAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Missing or invalid Authorization header",
        });
    }
    const token = authHeader.substring("Bearer ".length);
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET);
        req.vendorId = payload.sub;
        return next();
    }
    catch (error) {
        console.error("Vendor auth error:", error);
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token",
        });
    }
}
