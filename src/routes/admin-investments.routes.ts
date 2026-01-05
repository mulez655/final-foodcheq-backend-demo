import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requireAdminAuth } from "../middleware/adminAuth";

const router = Router();

// ====== Schemas ======
const createInvestmentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
});

const updateInvestmentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

// ====== Routes ======

// GET /api/admin/investments
router.get("/", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";

    const where: any = {};
    if (!includeInactive) {
      where.isActive = true;
    }

    const opportunities = await prisma.investmentOpportunity.findMany({
      where,
      include: {
        _count: {
          select: { interests: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const transformed = opportunities.map((opp) => ({
      id: opp.id,
      title: opp.title,
      description: opp.description,
      isActive: opp.isActive,
      interestCount: opp._count.interests,
      createdAt: opp.createdAt,
      updatedAt: opp.updatedAt,
    }));

    return res.json({
      success: true,
      opportunities: transformed,
    });
  } catch (error) {
    console.error("Get investments error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/admin/investments/:id
router.get("/:id", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const opportunityId = req.params.id;

    const opportunity = await prisma.investmentOpportunity.findUnique({
      where: { id: opportunityId },
      include: {
        interests: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!opportunity) {
      return res.status(404).json({
        success: false,
        message: "Investment opportunity not found",
      });
    }

    return res.json({
      success: true,
      opportunity: {
        id: opportunity.id,
        title: opportunity.title,
        description: opportunity.description,
        isActive: opportunity.isActive,
        createdAt: opportunity.createdAt,
        updatedAt: opportunity.updatedAt,
        interests: opportunity.interests.map((i) => ({
          id: i.id,
          userId: i.userId,
          userEmail: i.user.email,
          userName: i.user.name,
          createdAt: i.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("Get investment error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/admin/investments
router.post("/", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = createInvestmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { title, description } = parsed.data;

    const opportunity = await prisma.investmentOpportunity.create({
      data: {
        title,
        description,
        isActive: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Investment opportunity created",
      opportunity,
    });
  } catch (error) {
    console.error("Create investment error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/admin/investments/:id
router.patch("/:id", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const opportunityId = req.params.id;

    const parsed = updateInvestmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const existing = await prisma.investmentOpportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Investment opportunity not found",
      });
    }

    const opportunity = await prisma.investmentOpportunity.update({
      where: { id: opportunityId },
      data: parsed.data,
    });

    return res.json({
      success: true,
      message: "Investment opportunity updated",
      opportunity,
    });
  } catch (error) {
    console.error("Update investment error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/admin/investments/:id
router.delete("/:id", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const opportunityId = req.params.id;

    const existing = await prisma.investmentOpportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Investment opportunity not found",
      });
    }

    // Delete the opportunity (cascade will delete interests)
    await prisma.investmentOpportunity.delete({
      where: { id: opportunityId },
    });

    return res.json({
      success: true,
      message: "Investment opportunity deleted",
    });
  } catch (error) {
    console.error("Delete investment error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
