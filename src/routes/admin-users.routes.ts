import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// ===== Zod Schemas =====

const listUsersQuerySchema = z.object({
  search: z.string().optional(),
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

const updateUserRoleSchema = z.object({
  role: z.enum(["USER", "ADMIN"]),
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

// GET /api/admin/users
router.get(
  "/",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = listUsersQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid query parameters",
          errors: parsed.error.flatten(),
        });
      }

      const { search, page, pageSize } = parsed.data;
      const skip = (page - 1) * pageSize;

      const where = search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }
        : {};

      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
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
        users,
      });
    } catch (error) {
      console.error("Admin list users error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// PATCH /api/admin/users/:id/role
router.patch(
  "/:id/role",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const parsed = updateUserRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: parsed.error.flatten(),
        });
      }

      const { role } = parsed.data;

      // Optional: prevent self-demotion from ADMIN
      if (req.userId === id && role !== "ADMIN") {
        return res.status(400).json({
          success: false,
          message: "You cannot remove your own admin privileges",
        });
      }

      const user = await prisma.user.update({
        where: { id },
        data: { role },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      return res.json({
        success: true,
        message: "User role updated",
        user,
      });
    } catch (error) {
      console.error("Admin update user role error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

export default router;
