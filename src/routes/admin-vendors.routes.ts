import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// Adjust to match your actual enum values if needed
const VendorStatusEnum = z.enum(["PENDING", "APPROVED"]);

// ===== Zod Schemas =====

const listVendorsQuerySchema = z.object({
  search: z.string().optional(),
  status: VendorStatusEnum.optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1).default(1)),
  pageSize: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100).default(20)),
});

const updateVendorStatusSchema = z.object({
  status: VendorStatusEnum,
  isActive: z.boolean().optional(),
});

// ===== Middleware =====

function requireAdmin(req: AuthenticatedRequest, res: Response, next: () => void) {
  if (req.userRole !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }
  next();
}

// ===== Routes =====

// GET /api/admin/vendors
router.get(
  "/",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = listVendorsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid query parameters",
          errors: parsed.error.flatten(),
        });
      }

      const { search, status, page, pageSize } = parsed.data;
      const skip = (page - 1) * pageSize;

      const where: any = {};

      if (search) {
        where.OR = [
          { email: { contains: search, mode: "insensitive" } },
          { businessName: { contains: search, mode: "insensitive" } },
          { contactName: { contains: search, mode: "insensitive" } },
        ];
      }

      if (status) {
        where.status = status;
      }

      const [total, vendors] = await Promise.all([
        prisma.vendor.count({ where }),
        prisma.vendor.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { createdAt: "desc" },
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
        }),
      ]);

      return res.json({
        success: true,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        vendors,
      });
    } catch (error) {
      console.error("Admin list vendors error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// PATCH /api/admin/vendors/:id/approve
router.patch(
  "/:id/approve",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const vendor = await prisma.vendor.update({
        where: { id },
        data: {
          status: "APPROVED",
          isActive: true,
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

      return res.json({
        success: true,
        message: "Vendor approved",
        vendor,
      });
    } catch (error) {
      console.error("Admin approve vendor error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// PATCH /api/admin/vendors/:id/status
router.patch(
  "/:id/status",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = updateVendorStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: parsed.error.flatten(),
        });
      }

      const { status, isActive } = parsed.data;

      const vendor = await prisma.vendor.update({
        where: { id },
        data: {
          status,
          ...(typeof isActive === "boolean" ? { isActive } : {}),
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

      return res.json({
        success: true,
        message: "Vendor status updated",
        vendor,
      });
    } catch (error) {
      console.error("Admin update vendor status error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

export default router;
