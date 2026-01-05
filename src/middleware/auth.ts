import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string | null;
    role: "USER" | "ADMIN";
  };
  userId?: string;
  userRole?: "USER" | "ADMIN";
}

// Optional: keep this type small + safe
type JwtPayload = {
  sub?: string;
  role?: "USER" | "ADMIN";
  iat?: number;
  exp?: number;
};

export async function requireAuth(req: any, res: Response, next: NextFunction) {
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
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

    const userId = decoded?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
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
  } catch (err) {
    // If token expired or invalid => 401
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
}
