# FoodCheq Backend (Node + Express + Prisma + PostgreSQL)

This is the custom backend for **FoodCheq** – a cooperative food platform that supports:

- 👤 User auth (signup / login / profile)
- 🧑‍🍳 Vendor auth + onboarding (approval flow)
- 🛒 Products (per vendor)
- 📦 Orders (per user, tied to vendors)
- 💳 Payments (Paystack integration with webhook)
- 🚚 Logistics (delivery records connected to orders)
- 🛠 Admin panel APIs (manage users, vendors, orders, deliveries)

---

## 1. Tech Stack

- **Language**: TypeScript
- **Runtime / Framework**: Node.js + Express
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: JWT (access + refresh tokens)
- **Payments**: Paystack (test mode for now)
- **Logistics**: Internal `Delivery` model (no external courier yet)

---

## 2. Project Structure (Key Files)

```txt
foodcheq-backend/
├─ src/
│  ├─ app.ts                 # Express app wiring
│  ├─ server.ts              # Server bootstrap (if used)
│  ├─ config/
│  │  └─ env.ts              # Zod-validated environment variables
│  ├─ lib/
│  │  └─ prisma.ts           # Prisma client singleton
│  ├─ middleware/
│  │  ├─ auth.ts             # requireAuth + role handling
│  │  └─ vendorAuth.ts       # requireVendorAuth
│  ├─ routes/
│  │  ├─ auth.routes.ts              # User auth
│  │  ├─ vendor-auth.routes.ts       # Vendor auth
│  │  ├─ vendor-products.routes.ts   # Vendor product CRUD
│  │  ├─ orders.routes.ts            # User orders
│  │  ├─ payments.routes.ts          # Paystack init + webhook handler
│  │  ├─ logistics.routes.ts         # Deliveries (user/vendor/admin)
│  │  ├─ admin-users.routes.ts       # Admin user management
│  │  ├─ admin-vendors.routes.ts     # Admin vendor management
│  │  └─ admin-orders.routes.ts      # Admin order management
│  └─ ...
├─ prisma/
│  ├─ schema.prisma           # Data models (User, Vendor, Product, Order, Payment, Delivery, etc.)
│  └─ migrations/             # Prisma migrations
├─ .env                       # Local environment config (NOT committed)
├─ package.json
├─ pnpm-lock.yaml
└─ README-backend.md
