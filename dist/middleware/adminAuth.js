"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdminAuth = requireAdminAuth;
function requireAdminAuth(req, res, next) {
    // requireAuth should already have run and set req.user
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "Unauthenticated",
        });
    }
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({
            success: false,
            message: "Admin access required",
        });
    }
    next();
}
