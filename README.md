# 🏢 SURYAS MiB ENTERPRISES Intranet Portal

## Current Baseline

The primary application is the Next.js app at the repository root. It currently uses local JSON files under `.data` for users, requests, notifications, and ledger records; it is a development baseline, not a production-ready deployment. The separate `suryas-mib-portal` folder is an independent scaffold and is excluded from the root TypeScript project.

The current working copy includes signed HttpOnly sessions, server-side role checks, a first-run account bootstrap, sequential registration approvals, mandatory approval remarks, and server-side request ownership checks. PostgreSQL persistence, the complete leave/expense/project/report workflows, private attachment storage, payment recording, and comprehensive automated tests remain incomplete. Do not use real company data or deploy this baseline publicly.

## Secure Local Setup

1. In PowerShell, copy `.env.example` to `.env.local`:

	```powershell
	Copy-Item .env.example .env.local
	```

2. Set `SESSION_SECRET` to a random value of at least 32 characters and set a separate random `INITIAL_SETUP_TOKEN`. Keep `.env.local` private; it is ignored by Git. Set a separate `CRON_TOKEN` and schedule a daily authenticated POST to `/api/cron/check-reminders` to enable scheduled reminders and the 90-day archive workflow. See [DATA_RETENTION_POLICY.md](./DATA_RETENTION_POLICY.md).
3. Install and start the root app:

	```powershell
	npm install
	npm run dev
	```

4. Open `http://localhost:3000/setup` and enter the `INITIAL_SETUP_TOKEN`. The setup creates the three initial leadership accounts. Temporary passwords are shown only for newly created accounts; store them securely and change each at first login.

The first setup request is intentionally unavailable unless `INITIAL_SETUP_TOKEN` is configured. After the Founder account exists, the setup endpoint requires a Founder session. Never reuse the example values as secrets.

A modern, secure virtual intranet platform built with **Next.js 16**, **React 19**, and **Tailwind CSS**. Designed for seamless employee engagement, admin management, and guest access.

## ✨ Features

### 🔐 Authentication & Authorization
- Multi-role login system (Admin, User, Guest)
- Secure profile setup modal
- Role-based access control
- Guest purpose tracking modal

### 📊 Admin Dashboard
- **Leave Management** - Approve/reject employee leave requests
- **Allowance Claims** - Manage travel allowance claims
- **Project Management** - Track ongoing projects
- **User Management** - Monitor system users
- **Analytics & Reports** - Detailed system insights
- **Login History** - Track user activity

### 👥 Employee Features
- Leave request submission
- Allowance claim filing
- Project creation and tracking
- Internal revenue tracking

### 🎯 Guest Portal
- Guest purpose collection modal
- Limited access to company information
- Default user icon profile
- Purpose tracking

## 🚀 Getting Started

### Prerequisites
- Node.js 18.17+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/LashminiAD/intranet_suryas.git
cd intranet_suryas

# Install dependencies
npm install

# Start development server
npm run dev
```

### View in Browser

Once the dev server is running, open your browser and go to:

**👉 [http://localhost:3000](http://localhost:3000)**

> **⚠️ IMPORTANT:** Make sure the dev server is running before clicking the link!
> 
> In your terminal, you should see:
> ```
> ✓ Next.js 16.1.4 (Turbopack)
> ✓ Ready in XXXms
> - Local:         http://localhost:3000
> ```

If the page doesn't load:
1. ✅ **Ensure terminal shows** `✓ Ready in XXXms`
2. ✅ **Check port 3000** is not blocked by another app
3. ✅ **Clear browser cache** (Ctrl+Shift+Del)
4. ✅ **Hard refresh** the page (Ctrl+F5 or Cmd+Shift+R)
5. ✅ **Restart dev server** if still not working

## 📁 Project Structure

```
suryas-intranet/
├── app/
│   ├── admin-dashboard/        # Main admin console
│   ├── admin/                  # Admin sub-pages
│   │   ├── leave-management/
│   │   ├── ta-claims/
│   │   ├── project-approvals/
│   │   ├── user-management/
│   │   └── reports/
│   ├── login/                  # Login page
│   ├── signup/                 # Registration page
│   ├── homepage/               # Landing page (post-login)
│   ├── dashboard/              # User dashboard
│   ├── forms-gallery/          # Downloadable forms
│   ├── about-founder/          # Company & founder info
│   └── ...other pages
├── components/
│   ├── guest-purpose-modal.tsx # Guest data collection
│   ├── profile-setup-modal.tsx # User profile completion
│   ├── main-layout.tsx         # Master layout
│   ├── events-carousel.tsx     # Events display
│   ├── qr-code-modal.tsx       # Payment QR display
│   └── ui/                     # shadcn/ui components
├── lib/
│   ├── auth-context.tsx        # Authentication state
│   └── utils.ts                # Utility functions
└── public/                     # Static assets
```

## 🛠 Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Next.js** | 16.1.4 | React framework |
| **React** | 19.2.3 | UI library |
| **TypeScript** | 5.x | Type safety |
| **Tailwind CSS** | 4.x | Styling |
| **Lucide React** | Latest | Icons |
| **shadcn/ui** | Latest | UI components |
| **Sonner** | Latest | Toast notifications |

## 🎨 User Flows

### Employee/User Flow
1. Login with credentials
2. Redirected to Homepage
3. Profile setup modal (first-time users)
4. Role selection (Intern/Freelancer/Employee)
5. Access to dashboard and features

### Guest Flow
1. Login with guest credentials
2. Redirected to Homepage
3. **Guest Purpose Modal** appears (Name, Designation, Company, Role, Purpose)
4. Default user icon assigned
5. Access to limited features

### Admin Flow
1. Login with admin credentials
2. Redirected to Homepage
3. Access to Admin Dashboard
4. Full system control and oversight

## 🔄 Key Features Explained

### Guest Purpose Modal
Collects guest information on first login:
- **Name** (required)
- **Designation** (optional)
- **Company Name** (optional)
- **Company Role** (optional)
- **Purpose of Visit** (required) - description box

### Profile Setup Modal
For regular users (non-admin):
- Profile picture upload (required)
- Full name
- Phone number
- Role selection (Intern/Freelancer/Employee)

## 📝 Available Routes

| Route | Access | Purpose |
|-------|--------|---------|
| `/login` | Public | User login |
| `/signup` | Public | New user registration |
| `/homepage` | Authenticated | Landing page |
| `/dashboard` | User/Guest | User dashboard |
| `/admin-dashboard` | Admin | Admin console |
| `/leave-form` | User | Submit leave request |
| `/ta-claim` | User | Submit allowance claim |
| `/project-creation` | User | Create projects |

| `/admin/approvals` | Authorized approvers | Unified approval queue and workflow history for requests and registrations |
| `/admin/user-management` | Admin | Manage users |
| `/attendance` | Authenticated staff | Daily check-in/check-out and attendance reports |
| `/tasks` | Admin, assigned employees/interns | Assign work, deadlines, status, progress, comments, and authorized reassignment |
| `/service-requests` | Authenticated staff | Request relieving letters and applicable experience/internship/completion certificates |
| `/my-requests` | Authenticated staff | Track request status, approval remarks, and history |
| `/admin/approvals` | Authorized approvers | Review requests and issue approved official PDFs |

Attendance reports follow the Hareesh V → Santhana Kumar V → G. K. Bharath approval sequence. Intern registration cannot be finally approved until the final approver assigns an active guide. Intern requests first require that guide's recommendation and then continue through the authorized approval chain; guide recommendation does not constitute final approval. Only the designated final approver can issue an official certificate or relieving-letter PDF.

Leave, allowance, project, report, attendance, internal-service, certificate, relieving-letter, and registration approvals are reviewed in the unified `/admin/approvals` page. Dashboard approval shortcuts open this page so decisions and workflow history stay in one place. Admin, Founder, and Managing Partner users can assign and reassign tasks; employees and interns update their assigned task progress.

## 🚀 Building & Deployment

### Development Build
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Deploy to Vercel
```bash
vercel
```

## 📝 Environment Variables

Create a `.env.local` file:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## 🐛 Troubleshooting

### Dev Server Won't Start
```bash
# Kill process on port 3000
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Then restart
npm run dev
```

### Dependencies Issues
```bash
# Clear node_modules and reinstall
rm -r node_modules package-lock.json
npm install
```

### Build Errors
```bash
# Clear Next.js cache
rm -r .next
npm run dev
```

### Page Can't Be Reached
1. Make sure `npm run dev` is running in terminal
2. Look for `✓ Ready in XXXms` message
3. Try `http://localhost:3000` not `https://`
4. Hard refresh browser (Ctrl+F5)

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [shadcn/ui Components](https://ui.shadcn.com)

## 📄 License

This project is proprietary. All rights reserved © SURYAS MiB ENTERPRISES.

## 👤 Author

**Lashmini AD**
- GitHub: [@LashminiAD](https://github.com/LashminiAD)
- Repository: [intranet_suryas](https://github.com/LashminiAD/intranet_suryas)

---

**Last Updated:** October 17, 2026
**Version:** Development baseline; not production ready
