# SURYA’S MiB ENTERPRISES Portal

A secure Next.js + TypeScript + Tailwind enterprise management portal for SURYA’S MiB ENTERPRISES.

## Stack
- Next.js 16 App Router
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Zod validation
- Secure session cookies via `jose`
- bcryptjs password hashing

## Prerequisites
- Node.js 20+
- PostgreSQL 14+
- npm

## Setup
1. Copy `.env.example` to `.env` and replace the values.
2. Create the PostgreSQL database.
3. Run:

```bash
npm install
npx prisma generate
npx prisma db push
npm run db:seed
```

## Bootstrap admin
The first admin bootstrap is handled by the app runtime and uses a secure password from `BOOTSTRAP_ADMIN_PASSWORD` in the environment. Do not commit a production password.

## Development

```bash
npm run dev
```

## Production build

```bash
npm run build
npm run start
```

## Included features
- Secure login/logout session management
- Registration request workflow with founder approval
- Role-based access control
- Dashboard entry points
- Employee leave, claims and project placeholders backed by typed architecture

## Notes
This is a production-oriented secure baseline project created in a separate folder to preserve the original workspace reference implementation.
