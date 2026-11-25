# Setup & Run Instructions

## 🔧 What was fixed

The app was using **in-memory arrays** for user storage — meaning all users were wiped every time the server restarted. This is why login always failed.

**Fix applied:** `lib/portal-store.ts` now uses **Prisma + Supabase PostgreSQL** so all users persist in the database.

---

## ▶️ First-time setup (run these once in your terminal)

Open a terminal in the project folder:

```
cd "c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main\suryas-mib-portal"
```

### Step 1 — Generate the Prisma client
```bash
npx prisma generate
```

### Step 2 — Push schema to database (creates tables)
```bash
npx prisma db push
```

### Step 3 — Seed the users into the database
```bash
npm run db:seed
```

This creates all 3 accounts with password `Suryas@123`:

| Employee ID | Name               | Role             |
|-------------|-------------------|-----------------|
| MIB01       | G K Bharath        | System Admin     |
| MIB02       | Santhana Kumar V   | Managing Partner |
| MIB03       | Hareesh V          | Managing Partner |

---

## ▶️ Start the development server

```bash
npm run dev
```

Then open: **http://localhost:3000**

---

## 🔑 Login credentials

| Employee ID | Password    |
|-------------|-------------|
| MIB01       | Suryas@123  |
| MIB02       | Suryas@123  |
| MIB03       | Suryas@123  |

---

## 📌 Notes

- If `npx` doesn't work, use: `node node_modules/prisma/build/index.js generate`
- The Supabase database URL is already configured in `.env`
- Never commit `.env` to git
