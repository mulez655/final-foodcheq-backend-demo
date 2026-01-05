"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/vendor-products.routes.ts
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const vendorAuth_1 = require("../middleware/vendorAuth");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
// =======================
// Upload config (multer)
// =======================
const UPLOAD_DIR = path_1.default.join(process.cwd(), "uploads", "vendor-products");
// ensure folder exists
if (!fs_1.default.existsSync(UPLOAD_DIR)) {
    fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname || "").toLowerCase();
        const safeExt = ext && ext.length <= 10 ? ext : "";
        const name = `vp_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`;
        cb(null, name);
    },
});
const upload = (0, multer_1.default)({
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
const createProductSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Name is required"),
    description: zod_1.z.string().optional(),
    shortDesc: zod_1.z.string().optional(),
    benefits: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    relatedIds: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    priceUsdCents: zod_1.z
        .number({
        required_error: "priceUsdCents is required",
        invalid_type_error: "priceUsdCents must be a number",
    })
        .int()
        .min(1, "Price must be at least 1 cent"),
    category: zod_1.z.string().optional(),
    // NOTE: keeping your validation as-is for create-by-URL.
    // Upload endpoint below will set imageUrl to a public /uploads/... path.
    imageUrl: zod_1.z.string().url("imageUrl must be a valid URL").optional(),
    isAvailable: zod_1.z.boolean().optional(),
});
const listProductsQuerySchema = zod_1.z.object({
    status: zod_1.z
        .enum(["DRAFT", "ACTIVE", "INACTIVE"])
        .optional()
        .or(zod_1.z.literal("").transform(() => undefined)),
    includeDeleted: zod_1.z
        .string()
        .optional()
        .transform((v) => v === "true"),
});
// =======================
// POST /api/vendor/products
// Create a product for vendor
// =======================
router.post("/", vendorAuth_1.requireVendorAuth, async (req, res) => {
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
        const { name, description, shortDesc, benefits, relatedIds, priceUsdCents, category, imageUrl, isAvailable, } = parsed.data;
        const product = await prisma_1.prisma.product.create({
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
    }
    catch (error) {
        console.error("Create product error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
// =======================
// ✅ POST /api/vendor/products/:id/image
// Upload product image (multipart/form-data)
// Field name: "image"
// =======================
router.post("/:id/image", vendorAuth_1.requireVendorAuth, upload.single("image"), async (req, res) => {
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
        const product = await prisma_1.prisma.product.findFirst({
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
                fs_1.default.unlinkSync(req.file.path);
            }
            catch { }
            return res.status(404).json({
                success: false,
                message: "Product not found for this vendor",
            });
        }
        // public URL path served by app.ts: app.use("/uploads", express.static(...))
        const publicPath = `/uploads/vendor-products/${req.file.filename}`;
        const updated = await prisma_1.prisma.product.update({
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
    }
    catch (error) {
        console.error("Upload product image error:", error);
        // multer fileFilter errors show up here too
        const msg = typeof error?.message === "string"
            ? error.message
            : "Internal server error";
        return res.status(500).json({ success: false, message: msg });
    }
});
// =======================
// GET /api/vendor/products
// List products for vendor
// =======================
router.get("/", vendorAuth_1.requireVendorAuth, async (req, res) => {
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
        const products = await prisma_1.prisma.product.findMany({
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
    }
    catch (error) {
        console.error("List vendor products error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});
exports.default = router;
