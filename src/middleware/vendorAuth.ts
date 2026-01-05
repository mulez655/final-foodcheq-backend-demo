import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

export interface VendorAuthenticatedRequest extends Request {
  vendorId?: string;
}

export function requireVendorAuth(
  req: VendorAuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Missing or invalid Authorization header",
    });
  }

  const token = authHeader.substring("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    req.vendorId = payload.sub;
    return next();
  } catch (error) {
    console.error("Vendor auth error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}
