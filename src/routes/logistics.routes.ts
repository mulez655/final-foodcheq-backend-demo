// src/routes/logistics.routes.ts
import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import {
  requireVendorAuth,
  VendorAuthenticatedRequest,
} from "../middleware/vendorAuth";

const router = Router();

// ========= Zod Schemas =========

const createDeliverySchema = z.object({
  orderId: z.string().min(1),
  pickupLocation: z.string().min(1),
  dropoffLocation: z.string().min(1),
  riderName: z.string().optional(),
  riderPhone: z.string().optional(),
  notes: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["PENDING", "ASSIGNED", "IN_TRANSIT", "COMPLETED", "CANCELLED"]),
  riderName: z.string().optional(),
  riderPhone: z.string().optional(),
});

// Schema for public logistics requests
const createLogisticsRequestSchema = z.object({
  orderId: z.string().optional().nullable(),
  fullName: z.string().min(1, "Full name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Invalid email"),
  pickupLocation: z.string().min(1, "Pickup location is required"),
  dropoffLocation: z.string().min(1, "Dropoff location is required"),
  pickupDate: z.string().optional().nullable(),
  packageType: z.string().min(1, "Package type is required"),
  notes: z.string().optional().nullable(),
});

// ========= Helpers =========

function genTrackingCode() {
  // FCQ-TRK-XXXXXX
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FCQ-TRK-${rand}`;
}

function genLogisticsTrackingCode() {
  // FCQ-LOG-XXXXXX
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FCQ-LOG-${rand}`;
}

function statusTitle(status: string) {
  const s = String(status || "").toUpperCase();
  const map: Record<string, string> = {
    PENDING: "Delivery created",
    ASSIGNED: "Rider assigned",
    IN_TRANSIT: "Shipment in transit",
    COMPLETED: "Delivered",
    CANCELLED: "Delivery cancelled",
  };
  return map[s] || `Status updated: ${s}`;
}

// =====================================================
// ✅ VENDOR: Create delivery for an order
// POST /api/vendor/deliveries
// =====================================================
router.post(
  "/vendor/deliveries",
  requireVendorAuth,
  async (req: VendorAuthenticatedRequest, res: Response) => {
    try {
      if (!req.vendorId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthenticated vendor" });
      }

      let body: unknown = req.body;

      // If body comes in as a string, try to parse it
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch (e) {
          console.error("Failed to parse string body as JSON:", e);
        }
      }

      const parsed = createDeliverySchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: parsed.error.flatten(),
        });
      }

      const { orderId, pickupLocation, dropoffLocation, riderName, riderPhone, notes } =
        parsed.data;

      const order = await prisma.order.findFirst({
        where: { id: orderId, vendorId: req.vendorId },
        select: { id: true, userId: true, vendorId: true, paymentStatus: true },
      });

      if (!order) {
        return res
          .status(404)
          .json({ success: false, message: "Order not found for this vendor" });
      }

      if (order.paymentStatus !== "PAID") {
        return res.status(400).json({
          success: false,
          message: "Cannot create delivery for unpaid order",
        });
      }

      // Idempotent: return existing delivery for this order
      const existing = await prisma.delivery.findUnique({
        where: { orderId: order.id },
      });

      if (existing) {
        return res.status(200).json({
          success: true,
          message: "Delivery already exists for this order",
          delivery: existing,
        });
      }

      const delivery = await prisma.$transaction(async (tx) => {
        const created = await tx.delivery.create({
          data: {
            orderId: order.id,
            vendorId: order.vendorId,
            userId: order.userId,
            pickupLocation,
            dropoffLocation,
            riderName: riderName || null,
            riderPhone: riderPhone || null,
            notes: notes || null,
            status: "PENDING",
            trackingCode: genTrackingCode(),
          },
        });

        await tx.deliveryEvent.create({
          data: {
            deliveryId: created.id,
            status: "PENDING",
            title: "Delivery created",
          },
        });

        return created;
      });

      return res.status(201).json({
        success: true,
        message: "Delivery task created",
        delivery,
      });
    } catch (error) {
      console.error("Vendor create delivery error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// =====================================================
// ✅ VENDOR: List their deliveries
// GET /api/vendor/deliveries
// =====================================================
router.get(
  "/vendor/deliveries",
  requireVendorAuth,
  async (req: VendorAuthenticatedRequest, res: Response) => {
    try {
      if (!req.vendorId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthenticated vendor" });
      }

      const deliveries = await prisma.delivery.findMany({
        where: { vendorId: req.vendorId },
        orderBy: { createdAt: "desc" },
        include: {
          order: { select: { id: true, paymentStatus: true, status: true } },
          events: { orderBy: { createdAt: "asc" } }, // ✅ timeline
        },
      });

      return res.json({ success: true, deliveries });
    } catch (error) {
      console.error("Vendor list deliveries error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// =====================================================
// ✅ USER: My deliveries
// GET /api/my-deliveries
// =====================================================
router.get(
  "/my-deliveries",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthenticated" });
      }

      const deliveries = await prisma.delivery.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: "desc" },
        include: {
          order: { select: { id: true, paymentStatus: true, status: true } },
          events: { orderBy: { createdAt: "asc" } }, // ✅ timeline
        },
      });

      return res.json({ success: true, deliveries });
    } catch (error) {
      console.error("User list deliveries error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// =====================================================
// ✅ PUBLIC: Track shipment (NO AUTH)
// GET /api/logistics/track/:trackingCode
// =====================================================
router.get(
  "/logistics/track/:trackingCode",
  async (req: Request, res: Response) => {
    try {
      const { trackingCode } = req.params;

      const shipment = await prisma.delivery.findUnique({
        where: { trackingCode },
        include: {
          events: { orderBy: { createdAt: "asc" } }, // ✅ THIS IS EXACTLY WHERE IT GOES
        },
      });

      if (!shipment) {
        return res
          .status(404)
          .json({ success: false, message: "Shipment not found" });
      }

      return res.json({ success: true, shipment });
    } catch (error) {
      console.error("Track shipment error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// =====================================================
// ✅ ADMIN: List all deliveries
// GET /api/admin/deliveries
// =====================================================
router.get(
  "/admin/deliveries",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.userRole !== "ADMIN") {
        return res
          .status(403)
          .json({ success: false, message: "Admin access required" });
      }

      const deliveries = await prisma.delivery.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          order: { select: { id: true, paymentStatus: true, status: true } },
          vendor: { select: { id: true, businessName: true } },
          user: { select: { id: true, email: true } },
          events: { orderBy: { createdAt: "asc" } },
        },
      });

      return res.json({ success: true, deliveries });
    } catch (error) {
      console.error("Admin list deliveries error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// =====================================================
// ✅ ADMIN: Update delivery status (+ create event)
// PATCH /api/admin/deliveries/:id/status
// =====================================================
router.patch(
  "/admin/deliveries/:id/status",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.userRole !== "ADMIN") {
        return res
          .status(403)
          .json({ success: false, message: "Admin access required" });
      }

      const { id } = req.params;

      const parsed = updateStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: parsed.error.flatten(),
        });
      }

      const { status, riderName, riderPhone } = parsed.data;

      const delivery = await prisma.$transaction(async (tx) => {
        const updated = await tx.delivery.update({
          where: { id },
          data: {
            status,
            riderName: riderName ?? undefined,
            riderPhone: riderPhone ?? undefined,
          },
        });

        await tx.deliveryEvent.create({
          data: {
            deliveryId: updated.id,
            status,
            title: statusTitle(status),
          },
        });

        return updated;
      });

      return res.json({
        success: true,
        message: "Delivery updated",
        delivery,
      });
    } catch (error) {
      console.error("Admin update delivery status error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// =====================================================
// ✅ PUBLIC: Create logistics request (NO AUTH)
// POST /api/logistics/requests
// =====================================================
router.post("/logistics/requests", async (req: Request, res: Response) => {
  try {
    const parsed = createLogisticsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const {
      orderId,
      fullName,
      phone,
      email,
      pickupLocation,
      dropoffLocation,
      pickupDate,
      packageType,
      notes,
    } = parsed.data;

    const trackingCode = genLogisticsTrackingCode();

    const request = await prisma.logisticsRequest.create({
      data: {
        trackingCode,
        orderId: orderId || null,
        fullName,
        phone,
        email,
        pickupLocation,
        dropoffLocation,
        pickupDate: pickupDate ? new Date(pickupDate) : null,
        packageType,
        notes: notes || null,
        status: "PENDING",
      },
    });

    return res.status(201).json({
      success: true,
      message: "Logistics request created successfully",
      request,
      trackingCode: request.trackingCode,
    });
  } catch (error) {
    console.error("Create logistics request error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

// =====================================================
// ✅ PUBLIC: Track logistics request (NO AUTH)
// GET /api/logistics/requests/:trackingCode
// =====================================================
router.get(
  "/logistics/requests/:trackingCode",
  async (req: Request, res: Response) => {
    try {
      const { trackingCode } = req.params;

      const request = await prisma.logisticsRequest.findUnique({
        where: { trackingCode },
        include: {
          events: { orderBy: { createdAt: "asc" } },
        },
      });

      if (!request) {
        return res
          .status(404)
          .json({ success: false, message: "Request not found" });
      }

      return res.json({ success: true, request });
    } catch (error) {
      console.error("Get logistics request error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// =====================================================
// ✅ ADMIN: List all logistics requests
// GET /api/admin/logistics-requests
// =====================================================
router.get(
  "/admin/logistics-requests",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.userRole !== "ADMIN") {
        return res
          .status(403)
          .json({ success: false, message: "Admin access required" });
      }

      const requests = await prisma.logisticsRequest.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          events: { orderBy: { createdAt: "asc" } },
        },
      });

      return res.json({ success: true, requests });
    } catch (error) {
      console.error("Admin list logistics requests error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// =====================================================
// ✅ ADMIN: Update logistics request status
// PATCH /api/admin/logistics-requests/:id/status
// =====================================================
router.patch(
  "/admin/logistics-requests/:id/status",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.userRole !== "ADMIN") {
        return res
          .status(403)
          .json({ success: false, message: "Admin access required" });
      }

      const { id } = req.params;

      const parsed = updateStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: parsed.error.flatten(),
        });
      }

      const { status, riderName, riderPhone } = parsed.data;

      const request = await prisma.$transaction(async (tx) => {
        const updated = await tx.logisticsRequest.update({
          where: { id },
          data: {
            status,
            riderName: riderName ?? undefined,
            riderPhone: riderPhone ?? undefined,
          },
        });

        await tx.logisticsRequestEvent.create({
          data: {
            requestId: updated.id,
            status,
            title: statusTitle(status),
          },
        });

        return updated;
      });

      return res.json({
        success: true,
        message: "Logistics request updated",
        request,
      });
    } catch (error) {
      console.error("Admin update logistics request status error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

export default router;
