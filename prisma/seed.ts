// prisma/seed.ts
import {
  PrismaClient,
  UserRole,
  VendorStatus,
  ProductStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function moneyKobo(naira: number) {
  return Math.round(naira * 100);
}

async function main() {
  console.log("🌱 Seeding FoodCheq data...");

  // ===== Users =====
  const adminEmail = "admin@foodcheq.test";
  const userEmail = "user@foodcheq.test";

  const adminPasswordHash = await bcrypt.hash("Admin12345!", 10);
  const userPasswordHash = await bcrypt.hash("User12345!", 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: UserRole.ADMIN },
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      name: "FoodCheq Admin",
      role: UserRole.ADMIN,
    },
    select: { id: true, email: true, role: true },
  });

  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: {},
    create: {
      email: userEmail,
      passwordHash: userPasswordHash,
      name: "Test User",
      role: UserRole.USER,
    },
    select: { id: true, email: true, role: true },
  });

  console.log("✅ Admin:", admin);
  console.log("✅ User:", user);

  // ===== Vendors =====
  const vendor1Email = "vendor1@foodcheq.test";
  const vendor2Email = "vendor2@foodcheq.test";
  const vendorPasswordHash = await bcrypt.hash("Vendor12345!", 10);

  const vendor1 = await prisma.vendor.upsert({
    where: { email: vendor1Email },
    update: {
      status: VendorStatus.APPROVED,
      isActive: true,
      businessName: "Warri Fresh Foods",
      contactName: "Vendor One",
      phone: "08011111111",
    },
    create: {
      email: vendor1Email,
      passwordHash: vendorPasswordHash,
      businessName: "Warri Fresh Foods",
      contactName: "Vendor One",
      phone: "08011111111",
      status: VendorStatus.APPROVED,
      isActive: true,
    },
    select: { id: true, email: true, status: true, isActive: true },
  });

  const vendor2 = await prisma.vendor.upsert({
    where: { email: vendor2Email },
    update: {
      status: VendorStatus.APPROVED,
      isActive: true,
      businessName: "Abraka Farm Hub",
      contactName: "Vendor Two",
      phone: "08022222222",
    },
    create: {
      email: vendor2Email,
      passwordHash: vendorPasswordHash,
      businessName: "Abraka Farm Hub",
      contactName: "Vendor Two",
      phone: "08022222222",
      status: VendorStatus.APPROVED,
      isActive: true,
    },
    select: { id: true, email: true, status: true, isActive: true },
  });

  console.log("✅ Vendor1:", vendor1);
  console.log("✅ Vendor2:", vendor2);

  // ===== Products =====
  const productsSeed = [
    // Vendor 1
    { name: "Local Rice (5kg)", price: 18000, category: "Grains" },
    { name: "Beans (Derica)", price: 2500, category: "Grains" },
    { name: "Palm Oil (1L)", price: 4500, category: "Oil" },
    { name: "Groundnut Oil (1L)", price: 7000, category: "Oil" },
    { name: "Fresh Tomatoes (Basket)", price: 6000, category: "Vegetables" },
    { name: "Pepper Mix", price: 3000, category: "Vegetables" },
    { name: "Onions (Bag Small)", price: 9000, category: "Vegetables" },
    { name: "Garri (Yellow 5kg)", price: 5500, category: "Staples" },
    { name: "Yam (Medium Tubers x5)", price: 12000, category: "Staples" },
    { name: "Plantain (Bunch)", price: 8000, category: "Staples" },
    { name: "Dried Fish Pack", price: 4000, category: "Protein" },
    { name: "Crayfish Pack", price: 3500, category: "Protein" },
    { name: "Eggs (Crate)", price: 6500, category: "Protein" },
    { name: "Chicken (Frozen 1kg)", price: 8500, category: "Protein" },
    { name: "Salt (1kg)", price: 800, category: "Essentials" },

    // Vendor 2
    { name: "Flour (2kg)", price: 4500, category: "Baking" },
    { name: "Sugar (1kg)", price: 1800, category: "Baking" },
    { name: "Milk Powder", price: 3200, category: "Baking" },
    { name: "Spaghetti (Pack)", price: 1200, category: "Pasta" },
    { name: "Noodles (Carton)", price: 14000, category: "Pasta" },
    { name: "Canned Tomatoes", price: 1500, category: "Canned" },
    { name: "Tuna (Can)", price: 2000, category: "Canned" },
    { name: "Cornflakes (Medium)", price: 3800, category: "Breakfast" },
    { name: "Oats (1kg)", price: 5200, category: "Breakfast" },
    { name: "Butter", price: 2200, category: "Dairy" },
    { name: "Cheese Slices", price: 2600, category: "Dairy" },
    { name: "Bottled Water (Pack)", price: 2000, category: "Drinks" },
    { name: "Soft Drink (Pack)", price: 4500, category: "Drinks" },
    { name: "Detergent (Medium)", price: 2500, category: "Household" },
    { name: "Tissue (Pack)", price: 1800, category: "Household" },
  ];

  // Remove existing products for these vendors (so reseeding is clean)
  await prisma.product.deleteMany({
    where: { vendorId: { in: [vendor1.id, vendor2.id] } },
  });

  const vendor1Products = productsSeed.slice(0, 15).map((p) => ({
    vendorId: vendor1.id,
    name: p.name,
    description: `Quality ${p.name} from vendor ${vendor1.email}`,
    priceKobo: moneyKobo(p.price),
    currency: "NGN",
    category: p.category,
    isAvailable: true,
    isDeleted: false,
    status: ProductStatus.ACTIVE, // ✅ your enum uses ACTIVE
  }));

  const vendor2Products = productsSeed.slice(15).map((p) => ({
    vendorId: vendor2.id,
    name: p.name,
    description: `Quality ${p.name} from vendor ${vendor2.email}`,
    priceKobo: moneyKobo(p.price),
    currency: "NGN",
    category: p.category,
    isAvailable: true,
    isDeleted: false,
    status: ProductStatus.ACTIVE, // ✅ your enum uses ACTIVE
  }));

  await prisma.product.createMany({
    data: [...vendor1Products, ...vendor2Products],
  });

  const totalProducts = await prisma.product.count({
    where: { vendorId: { in: [vendor1.id, vendor2.id] } },
  });

  console.log(`✅ Products seeded: ${totalProducts}`);
  console.log("🌱 Seeding complete.\n");

  console.log("=== Test Accounts ===");
  console.log("ADMIN:", adminEmail, "password:", "Admin12345!");
  console.log("USER :", userEmail, "password:", "User12345!");
  console.log("V1   :", vendor1Email, "password:", "Vendor12345!");
  console.log("V2   :", vendor2Email, "password:", "Vendor12345!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
