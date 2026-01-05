import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requireAdminAuth } from "../middleware/adminAuth";
import { sendEmail, getPartnershipStatusEmailHtml } from "../services/email";

const router = Router();

// ====== Schemas ======
const updateApplicationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "NEEDS_INFO"]),
  notes: z.string().optional(),
});

// ====== Routes ======

// GET /api/admin/partnerships
router.get("/", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const where: any = {};

    if (status && ["PENDING", "APPROVED", "REJECTED", "NEEDS_INFO"].includes(status)) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const applications = await prisma.partnershipApplication.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isPartner: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      applications,
    });
  } catch (error) {
    console.error("Get partnerships error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/admin/partnerships/:id
router.patch("/:id", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const applicationId = req.params.id;
    const adminId = req.user?.id;

    const parsed = updateApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { status, notes } = parsed.data;

    const application = await prisma.partnershipApplication.findUnique({
      where: { id: applicationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    // Update application and user isPartner status in a transaction
    const [updatedApplication] = await prisma.$transaction([
      prisma.partnershipApplication.update({
        where: { id: applicationId },
        data: {
          status,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          reviewNotes: notes || null,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              isPartner: true,
            },
          },
        },
      }),
      // If approved, set user as partner
      ...(status === "APPROVED"
        ? [
            prisma.user.update({
              where: { id: application.userId },
              data: { isPartner: true },
            }),
          ]
        : []),
    ]);

    // Send email notification
    await sendEmail({
      to: application.user.email,
      subject:
        status === "APPROVED"
          ? "Your FoodCheQ Partnership Application was Approved!"
          : status === "REJECTED"
          ? "Update on Your FoodCheQ Partnership Application"
          : "Additional Information Required for Your Partnership Application",
      html: getPartnershipStatusEmailHtml(application.user.name, status, notes),
    });

    return res.json({
      success: true,
      message: `Application ${status.toLowerCase()}`,
      application: updatedApplication,
    });
  } catch (error) {
    console.error("Update partnership error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/admin/partnerships/stats
router.get("/stats", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const [pending, approved, rejected, needsInfo, totalPartners] = await Promise.all([
      prisma.partnershipApplication.count({ where: { status: "PENDING" } }),
      prisma.partnershipApplication.count({ where: { status: "APPROVED" } }),
      prisma.partnershipApplication.count({ where: { status: "REJECTED" } }),
      prisma.partnershipApplication.count({ where: { status: "NEEDS_INFO" } }),
      prisma.user.count({ where: { isPartner: true } }),
    ]);

    return res.json({
      success: true,
      stats: {
        pending,
        approved,
        rejected,
        needsInfo,
        totalPartners,
      },
    });
  } catch (error) {
    console.error("Get partnership stats error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
