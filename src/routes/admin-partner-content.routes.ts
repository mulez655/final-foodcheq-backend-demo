import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requireAdminAuth } from "../middleware/adminAuth";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// =======================
// Upload config (multer) for documents
// =======================
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "partner-docs");

// Ensure folder exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ext && ext.length <= 10 ? ext : "";
    const name = `doc_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`;
    cb(null, name);
  },
});

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for documents
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error("Only PDF, DOC, DOCX, XLS, XLSX, TXT, and image files are allowed"));
    }
    cb(null, true);
  },
});

// =======================
// Zod schemas
// =======================

// Announcements
const createAnnouncementSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  content: z.string().min(1, "Content is required").max(10000),
  priority: z.number().int().min(0).max(100).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

// Documents
const createDocumentSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(1000).optional(),
  category: z.enum(["GENERAL", "REPORT", "GUIDE", "CONTRACT", "FINANCIAL", "POLICY"]).optional(),
});

const updateDocumentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  category: z.enum(["GENERAL", "REPORT", "GUIDE", "CONTRACT", "FINANCIAL", "POLICY"]).optional(),
  isActive: z.boolean().optional(),
});

// ============================================
// ANNOUNCEMENTS ROUTES
// ============================================

// GET /api/admin/partner-content/announcements
router.get("/announcements", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";

    const where: any = {};
    if (!includeInactive) {
      where.isActive = true;
    }

    const announcements = await prisma.partnerAnnouncement.findMany({
      where,
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

// GET /api/admin/partner-content/announcements/:id
router.get("/announcements/:id", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const announcement = await prisma.partnerAnnouncement.findUnique({
      where: { id: req.params.id },
    });

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found",
      });
    }

    return res.json({
      success: true,
      announcement,
    });
  } catch (error) {
    console.error("Get announcement error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/admin/partner-content/announcements
router.post("/announcements", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = createAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { title, content, priority, expiresAt } = parsed.data;

    const announcement = await prisma.partnerAnnouncement.create({
      data: {
        title,
        content,
        priority: priority ?? 0,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdById: req.user!.id,
        isActive: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Announcement created",
      announcement,
    });
  } catch (error) {
    console.error("Create announcement error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/admin/partner-content/announcements/:id
router.patch("/announcements/:id", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = updateAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const existing = await prisma.partnerAnnouncement.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found",
      });
    }

    const updateData: any = { ...parsed.data };
    if (parsed.data.expiresAt !== undefined) {
      updateData.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
    }

    const announcement = await prisma.partnerAnnouncement.update({
      where: { id: req.params.id },
      data: updateData,
    });

    return res.json({
      success: true,
      message: "Announcement updated",
      announcement,
    });
  } catch (error) {
    console.error("Update announcement error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/admin/partner-content/announcements/:id
router.delete("/announcements/:id", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const existing = await prisma.partnerAnnouncement.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found",
      });
    }

    await prisma.partnerAnnouncement.delete({
      where: { id: req.params.id },
    });

    return res.json({
      success: true,
      message: "Announcement deleted",
    });
  } catch (error) {
    console.error("Delete announcement error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ============================================
// DOCUMENTS ROUTES
// ============================================

// GET /api/admin/partner-content/documents
router.get("/documents", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const category = req.query.category as string | undefined;

    const where: any = {};
    if (!includeInactive) {
      where.isActive = true;
    }
    if (category) {
      where.category = category;
    }

    const documents = await prisma.partnerDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
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

// GET /api/admin/partner-content/documents/:id
router.get("/documents/:id", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const document = await prisma.partnerDocument.findUnique({
      where: { id: req.params.id },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    return res.json({
      success: true,
      document,
    });
  } catch (error) {
    console.error("Get document error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/admin/partner-content/documents (with file upload)
router.post(
  "/documents",
  requireAuth,
  requireAdminAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      const parsed = createDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        // Delete uploaded file if validation fails
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: parsed.error.flatten(),
        });
      }

      const { title, description, category } = parsed.data;

      const document = await prisma.partnerDocument.create({
        data: {
          title,
          description: description || null,
          category: category || "GENERAL",
          fileName: req.file.originalname,
          filePath: `/uploads/partner-docs/${req.file.filename}`,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          createdById: req.user!.id,
          isActive: true,
        },
      });

      return res.status(201).json({
        success: true,
        message: "Document uploaded",
        document,
      });
    } catch (error) {
      console.error("Upload document error:", error);
      // Clean up file if error
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
);

// PATCH /api/admin/partner-content/documents/:id
router.patch("/documents/:id", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = updateDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const existing = await prisma.partnerDocument.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const document = await prisma.partnerDocument.update({
      where: { id: req.params.id },
      data: parsed.data,
    });

    return res.json({
      success: true,
      message: "Document updated",
      document,
    });
  } catch (error) {
    console.error("Update document error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/admin/partner-content/documents/:id
router.delete("/documents/:id", requireAuth, requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const existing = await prisma.partnerDocument.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Delete the file from disk
    const fullPath = path.join(process.cwd(), existing.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    // Delete from database
    await prisma.partnerDocument.delete({
      where: { id: req.params.id },
    });

    return res.json({
      success: true,
      message: "Document deleted",
    });
  } catch (error) {
    console.error("Delete document error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ============================================
// STATS ROUTE
// ============================================

// GET /api/admin/partner-content/stats
router.get("/stats", requireAuth, requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const [announcementCount, documentCount, activeAnnouncements, activeDocuments] = await Promise.all([
      prisma.partnerAnnouncement.count(),
      prisma.partnerDocument.count(),
      prisma.partnerAnnouncement.count({ where: { isActive: true } }),
      prisma.partnerDocument.count({ where: { isActive: true } }),
    ]);

    return res.json({
      success: true,
      stats: {
        totalAnnouncements: announcementCount,
        activeAnnouncements,
        totalDocuments: documentCount,
        activeDocuments,
      },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
