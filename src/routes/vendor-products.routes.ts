// src/routes/vendor-products.routes.ts
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  requireVendorAuth,
  VendorAuthenticatedRequest,
} from "../middleware/vendorAuth";

import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// =======================
// Upload config (multer)
// =======================
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "vendor-products");

// ensure folder exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ext && ext.length <= 10 ? ext : "";
    const name = `vp_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    // accept only images
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image uploads are allowed"));
    }
    cb(null, true);
  },
});

// =======================
// Zod schemas
// =======================

// ✅ Approach B: price stored as USD cents
const createProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  shortDesc: z.string().optional(),
  benefits: z.array(z.string().min(1)).optional(),
  relatedIds: z.array(z.string().min(1)).optional(),

  priceUsdCents: z
    .number({
      required_error: "priceUsdCents is required",
      invalid_type_error: "priceUsdCents must be a number",
    })
    .int()
    .min(1, "Price must be at least 1 cent"),

  category: z.string().optional(),

  // NOTE: keeping your validation as-is for create-by-URL.
  // Upload endpoint below will set imageUrl to a public /uploads/... path.
  imageUrl: z.string().url("imageUrl must be a valid URL").optional(),

  isAvailable: z.boolean().optional(),
});

const listProductsQuerySchema = z.object({
  status: z
    .enum(["DRAFT", "ACTIVE", "INACTIVE"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  includeDeleted: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

// =======================
// POST /api/vendor/products
// Create a product for vendor
// =======================
router.post(
  "/",
  requireVendorAuth,
  async (req: VendorAuthenticatedRequest, res: Response) => {
    try {
      if (!req.vendorId) {
        return res.status(401).json({
          success: false,
          message: "Unauthenticated vendor",
        });
      }

      const parsed = createProductSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: parsed.error.flatten(),
        });
      }

      const {
        name,
        description,
        shortDesc,
        benefits,
        relatedIds,
        priceUsdCents,
        category,
        imageUrl,
        isAvailable,
      } = parsed.data;

      const product = await prisma.product.create({
        data: {
          vendorId: req.vendorId,
          name,
          description: description || null,
          shortDesc: shortDesc || null,
          benefits: benefits ?? [],
          relatedIds: relatedIds ?? [],
          priceUsdCents,
          category: category || null,
          imageUrl: imageUrl || null,
          isAvailable: isAvailable ?? true,
          status: "ACTIVE", // Default to ACTIVE so products are visible
        },
        select: {
          id: true,
          name: true,
          description: true,
          shortDesc: true,
          benefits: true,
          relatedIds: true,
          priceUsdCents: true,
          category: true,
          imageUrl: true,
          isAvailable: true,
          status: true,
          isDeleted: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.status(201).json({
        success: true,
        message: "Product created successfully",
        product,
      });
    } catch (error) {
      console.error("Create product error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// =======================
// ✅ POST /api/vendor/products/:id/image
// Upload product image (multipart/form-data)
// Field name: "image"
// =======================
router.post(
  "/:id/image",
  requireVendorAuth,
  upload.single("image"),
  async (req: VendorAuthenticatedRequest, res: Response) => {
    try {
      if (!req.vendorId) {
        return res.status(401).json({ success: false, message: "Unauthenticated vendor" });
      }

      const productId = String(req.params.id || "").trim();
      if (!productId) {
        return res.status(400).json({ success: false, message: "Missing product id" });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No image uploaded. Use form-data field name: image",
        });
      }

      // Ensure product belongs to this vendor
      const product = await prisma.product.findFirst({
        where: {
          id: productId,
          vendorId: req.vendorId,
          isDeleted: false,
        },
        select: { id: true },
      });

      if (!product) {
        // cleanup uploaded file
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
        return res.status(404).json({
          success: false,
          message: "Product not found for this vendor",
        });
      }

      // public URL path served by app.ts: app.use("/uploads", express.static(...))
      const publicPath = `/uploads/vendor-products/${req.file.filename}`;

      const updated = await prisma.product.update({
        where: { id: productId },
        data: { imageUrl: publicPath },
        select: {
          id: true,
          imageUrl: true,
          updatedAt: true,
        },
      });

      return res.json({
        success: true,
        message: "Image uploaded successfully",
        product: updated,
      });
    } catch (error: any) {
      console.error("Upload product image error:", error);

      // multer fileFilter errors show up here too
      const msg =
        typeof error?.message === "string"
          ? error.message
          : "Internal server error";

      return res.status(500).json({ success: false, message: msg });
    }
  }
);

// =======================
// GET /api/vendor/products
// List products for vendor
// =======================
router.get(
  "/",
  requireVendorAuth,
  async (req: VendorAuthenticatedRequest, res: Response) => {
    try {
      if (!req.vendorId) {
        return res.status(401).json({
          success: false,
          message: "Unauthenticated vendor",
        });
      }

      const parsed = listProductsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid query parameters",
          errors: parsed.error.flatten(),
        });
      }

      const { status, includeDeleted } = parsed.data;

      const products = await prisma.product.findMany({
        where: {
          vendorId: req.vendorId,
          ...(status ? { status } : {}),
          ...(includeDeleted ? {} : { isDeleted: false }),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          shortDesc: true,
          benefits: true,
          relatedIds: true,
          priceUsdCents: true,
          category: true,
          imageUrl: true,
          isAvailable: true,
          status: true,
          isDeleted: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.json({
        success: true,
        products,
      });
    } catch (error) {
      console.error("List vendor products error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// =======================
// PATCH /api/vendor/products/:id
// Update a product
// =======================
const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  shortDesc: z.string().optional().nullable(),
  benefits: z.array(z.string().min(1)).optional(),
  relatedIds: z.array(z.string().min(1)).optional(),
  priceUsdCents: z.number().int().min(1).optional(),
  category: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  isAvailable: z.boolean().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]).optional(),
});

router.patch(
  "/:id",
  requireVendorAuth,
  async (req: VendorAuthenticatedRequest, res: Response) => {
    try {
      if (!req.vendorId) {
        return res.status(401).json({
          success: false,
          message: "Unauthenticated vendor",
        });
      }

      const productId = String(req.params.id || "").trim();
      if (!productId) {
        return res.status(400).json({
          success: false,
          message: "Missing product id",
        });
      }

      const parsed = updateProductSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: parsed.error.flatten(),
        });
      }

      // Check product belongs to vendor
      const existing = await prisma.product.findFirst({
        where: {
          id: productId,
          vendorId: req.vendorId,
          isDeleted: false,
        },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const data = parsed.data;

      const product = await prisma.product.update({
        where: { id: productId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.shortDesc !== undefined && { shortDesc: data.shortDesc }),
          ...(data.benefits !== undefined && { benefits: data.benefits }),
          ...(data.relatedIds !== undefined && { relatedIds: data.relatedIds }),
          ...(data.priceUsdCents !== undefined && { priceUsdCents: data.priceUsdCents }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
          ...(data.isAvailable !== undefined && { isAvailable: data.isAvailable }),
          ...(data.status !== undefined && { status: data.status }),
        },
        select: {
          id: true,
          name: true,
          description: true,
          shortDesc: true,
          benefits: true,
          relatedIds: true,
          priceUsdCents: true,
          category: true,
          imageUrl: true,
          isAvailable: true,
          status: true,
          isDeleted: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.json({
        success: true,
        message: "Product updated successfully",
        product,
      });
    } catch (error) {
      console.error("Update product error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

// =======================
// DELETE /api/vendor/products/:id
// Soft delete a product
// =======================
router.delete(
  "/:id",
  requireVendorAuth,
  async (req: VendorAuthenticatedRequest, res: Response) => {
    try {
      if (!req.vendorId) {
        return res.status(401).json({
          success: false,
          message: "Unauthenticated vendor",
        });
      }

      const productId = String(req.params.id || "").trim();
      if (!productId) {
        return res.status(400).json({
          success: false,
          message: "Missing product id",
        });
      }

      const existing = await prisma.product.findFirst({
        where: {
          id: productId,
          vendorId: req.vendorId,
          isDeleted: false,
        },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      await prisma.product.update({
        where: { id: productId },
        data: { isDeleted: true },
      });

      return res.json({
        success: true,
        message: "Product deleted successfully",
      });
    } catch (error) {
      console.error("Delete product error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

export default router;
