import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth";

export interface AdminAuthenticatedRequest extends AuthenticatedRequest {}

export function requireAdminAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
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
