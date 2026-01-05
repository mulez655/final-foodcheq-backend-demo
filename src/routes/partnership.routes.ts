import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// ====== Schemas ======
const applySchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().min(1, "Location is required"),
});

// ====== Routes ======

// POST /api/partnership/apply
router.post("/apply", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { name, location } = parsed.data;

    // Check if user already has an application
    const existingApplication = await prisma.partnershipApplication.findUnique({
      where: { userId },
    });

    if (existingApplication) {
      // If rejected, allow reapplication
      if (existingApplication.status === "REJECTED") {
        const updated = await prisma.partnershipApplication.update({
          where: { userId },
          data: {
            name,
            location,
            status: "PENDING",
            reviewedBy: null,
            reviewedAt: null,
            reviewNotes: null,
          },
        });
        return res.json({
          success: true,
          message: "Partnership application resubmitted",
          application: updated,
        });
      }

      return res.status(400).json({
        success: false,
        message: `You already have a ${existingApplication.status.toLowerCase()} application`,
        application: existingApplication,
      });
    }

    // Check if user is already a partner
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPartner: true },
    });

    if (user?.isPartner) {
      return res.status(400).json({
        success: false,
        message: "You are already a partner",
      });
    }

    const application = await prisma.partnershipApplication.create({
      data: {
        userId,
        name,
        location,
        status: "PENDING",
      },
    });

    return res.status(201).json({
      success: true,
      message: "Partnership application submitted successfully",
      application,
    });
  } catch (error) {
    console.error("Partnership apply error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/partnership/status
router.get("/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPartner: true },
    });

    const application = await prisma.partnershipApplication.findUnique({
      where: { userId },
    });

    return res.json({
      success: true,
      isPartner: user?.isPartner || false,
      application: application || null,
    });
  } catch (error) {
    console.error("Partnership status error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/partnership/investments (partners only)
router.get("/investments", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPartner: true },
    });

    if (!user?.isPartner) {
      return res.status(403).json({
        success: false,
        message: "Only partners can access investment opportunities",
      });
    }

    const opportunities = await prisma.investmentOpportunity.findMany({
      where: { isActive: true },
      include: {
        interests: {
          where: { userId },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Transform to include hasExpressedInterest flag
    const transformedOpportunities = opportunities.map((opp) => ({
      id: opp.id,
      title: opp.title,
      description: opp.description,
      createdAt: opp.createdAt,
      hasExpressedInterest: opp.interests.length > 0,
    }));

    return res.json({
      success: true,
      opportunities: transformedOpportunities,
    });
  } catch (error) {
    console.error("Get investments error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/partnership/investments/:id/interest (partners only)
router.post("/investments/:id/interest", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPartner: true },
    });

    if (!user?.isPartner) {
      return res.status(403).json({
        success: false,
        message: "Only partners can express interest in investments",
      });
    }

    const opportunityId = req.params.id;

    const opportunity = await prisma.investmentOpportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity || !opportunity.isActive) {
      return res.status(404).json({
        success: false,
        message: "Investment opportunity not found",
      });
    }

    // Check if already expressed interest
    const existingInterest = await prisma.investmentInterest.findUnique({
      where: {
        opportunityId_userId: {
          opportunityId,
          userId,
        },
      },
    });

    if (existingInterest) {
      return res.status(400).json({
        success: false,
        message: "You have already expressed interest in this opportunity",
      });
    }

    await prisma.investmentInterest.create({
      data: {
        opportunityId,
        userId,
      },
    });

    return res.json({
      success: true,
      message: "Interest expressed successfully",
    });
  } catch (error) {
    console.error("Express interest error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/partnership/investments/:id/interest (partners only)
router.delete("/investments/:id/interest", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const opportunityId = req.params.id;

    const interest = await prisma.investmentInterest.findUnique({
      where: {
        opportunityId_userId: {
          opportunityId,
          userId,
        },
      },
    });

    if (!interest) {
      return res.status(404).json({
        success: false,
        message: "Interest not found",
      });
    }

    await prisma.investmentInterest.delete({
      where: { id: interest.id },
    });

    return res.json({
      success: true,
      message: "Interest withdrawn successfully",
    });
  } catch (error) {
    console.error("Withdraw interest error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ============================================
// PARTNER CONTENT - ANNOUNCEMENTS (partners only)
// ============================================

// GET /api/partnership/announcements
router.get("/announcements", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPartner: true },
    });

    if (!user?.isPartner) {
      return res.status(403).json({
        success: false,
        message: "Only partners can access announcements",
      });
    }

    // Get active announcements, filter out expired ones
    const now = new Date();
    const announcements = await prisma.partnerAnnouncement.findMany({
      where: {
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    return res.json({
      success: true,
      announcements,
    });
  } catch (error) {
    console.error("Get announcements error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ============================================
// PARTNER CONTENT - DOCUMENTS (partners only)
// ============================================

// GET /api/partnership/documents
router.get("/documents", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPartner: true },
    });

    if (!user?.isPartner) {
      return res.status(403).json({
        success: false,
        message: "Only partners can access documents",
      });
    }

    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;

    const where: any = { isActive: true };
    if (category) {
      where.category = category;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const documents = await prisma.partnerDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        downloadCount: true,
        createdAt: true,
      },
    });

    return res.json({
      success: true,
      documents,
    });
  } catch (error) {
    console.error("Get documents error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/partnership/documents/:id/download
router.get("/documents/:id/download", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPartner: true },
    });

    if (!user?.isPartner) {
      return res.status(403).json({
        success: false,
        message: "Only partners can download documents",
      });
    }

    const document = await prisma.partnerDocument.findUnique({
      where: { id: req.params.id },
    });

    if (!document || !document.isActive) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Increment download count
    await prisma.partnerDocument.update({
      where: { id: req.params.id },
      data: { downloadCount: { increment: 1 } },
    });

    return res.json({
      success: true,
      downloadUrl: document.filePath,
      fileName: document.fileName,
    });
  } catch (error) {
    console.error("Download document error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
