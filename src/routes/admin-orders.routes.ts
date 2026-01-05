import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// Adjust to match your actual enum values if needed
const OrderStatusEnum = z.enum(["PENDING", "ACCEPTED", "COMPLETED", "CANCELLED"]);
const PaymentStatusEnum = z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]);

// ===== Schemas =====

const listOrdersQuerySchema = z.object({
  status: OrderStatusEnum.optional(),
  paymentStatus: PaymentStatusEnum.optional(),
  userId: z.string().optional(),
  vendorId: z.string().optional(),
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

const updateOrderStatusSchema = z.object({
  status: OrderStatusEnum,
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

// GET /api/admin/orders
router.get(
  "/",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = listOrdersQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid query parameters",
          errors: parsed.error.flatten(),
        });
      }

      const { status, paymentStatus, userId, vendorId, page, pageSize } =
        parsed.data;
      const skip = (page - 1) * pageSize;

      const where: any = {};

      if (status) where.status = status;
      if (paymentStatus) where.paymentStatus = paymentStatus;
      if (userId) where.userId = userId;
      if (vendorId) where.vendorId = vendorId;

      const [total, orders] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
            vendor: {
              select: { id: true, businessName: true, email: true },
            },
            items: {
              select: {
                id: true,
                productId: true,
                quantity: true,
                unitPriceKobo: true,
                subtotalKobo: true, // ✅ use subtotalKobo here
              },
            },
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
        orders,
      });
    } catch (error) {
      console.error("Admin list orders error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// GET /api/admin/orders/:id
router.get(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
          vendor: {
            select: { id: true, businessName: true, email: true },
          },
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPriceKobo: true,
              subtotalKobo: true, // ✅ and here too
            },
          },
          payments: true,
          delivery: true,
        },
      });

      if (!order) {
        return res
          .status(404)
          .json({ success: false, message: "Order not found" });
      }

      return res.json({
        success: true,
        order,
      });
    } catch (error) {
      console.error("Admin get order error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// PATCH /api/admin/orders/:id/status
router.patch(
  "/:id/status",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const parsed = updateOrderStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: parsed.error.flatten(),
        });
      }

      const { status } = parsed.data;

      const order = await prisma.order.update({
        where: { id },
        data: { status },
      });

      return res.json({
        success: true,
        message: "Order status updated",
        order,
      });
    } catch (error) {
      console.error("Admin update order status error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

export default router;
