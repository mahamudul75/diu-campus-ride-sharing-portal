# 🚗 Campus Ride Sharing Portal — Daffodil International University (DIU)

> **DIU Capstone Engineering Project**  
> A secure, student-exclusive ride-sharing and carpooling web platform designed to connect Daffodil International University students, share commuting costs, and make campus transportation more convenient.

---

## 📌 Project Overview

**Campus Ride Sharing Portal — DIU** is a university-exclusive ride-sharing platform designed specifically for students of Daffodil International University.

Unlike public commercial ride-hailing applications, this platform provides a closed student-to-student network connecting students travelling between **Daffodil Smart City (Ashulia Campus), Dhanmondi (Sobhanbag), Mirpur 10, Uttara, Savar, and other locations across Dhaka.**

### 🌟 Key Features & Differentiators

- **100% Student-Only Community:** Students register using their DIU Student ID (`000-00-000` format) and institutional email (`@diu.edu.bd`).
- **Unified Account Model:** Every user has a single student account and can act as a passenger or apply to become a driver.
- **Driver Verification:** Students must submit a driver application and receive admin approval before publishing rides.
- **Fair Cost-Sharing:** Students travelling along similar routes can share transportation expenses.
- **Secure Booking System:** Passengers can request rides, while drivers can accept or reject booking requests.
- **Seat Management:** Transactional booking operations help prevent overbooking and maintain seat availability.
- **Interactive Maps:** Students can select pickup and destination locations using Leaflet and OpenStreetMap.
- **Privacy Protection (F17):** Driver phone numbers and vehicle registration details remain protected until the applicable booking request is accepted.
- **Admin Management:** Administrators can manage student accounts, approve drivers, and monitor platform activity.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS |
| Routing | React Router 7 |
| API Communication | Axios |
| UI Icons | Lucide Icons |
| Backend | Node.js, Express.js |
| API Architecture | REST API |
| Security | Helmet, CORS, Cookie-Parser |
| Authentication | JWT, bcryptjs, HttpOnly Cookies |
| Database | MySQL 8.0+ / TiDB Cloud Serverless (`mysql2`) |
| Database Fallback | Transactional in-memory relational store (dev/test only) |
| Mapping & Routing | Leaflet 1.9, OpenStreetMap tiles (with OSM Germany fallback), OSRM |
| Geocoding | Nominatim (OpenStreetMap) |
| Testing | Node.js, tsx |

---

## 📂 Project Architecture

```text
diu-campus-ride-sharing-portal/
│
├── src/                         # Frontend application
│   ├── components/              # Reusable UI components
│   ├── context/                 # Authentication and toast contexts
│   ├── pages/                   # Application pages
│   ├── services/                # Axios API services
│   └── types/                   # TypeScript interfaces and models
│
├── server/
│   └── src/
│       ├── config/              # Database configuration
│       ├── controllers/         # Backend controllers
│       ├── middleware/          # Authentication and authorization
│       ├── routes/              # REST API routes
│       ├── utils/                # JWT and validation utilities
│       └── database/
│           ├── schema.sql       # Database schema
│           ├── seed.sql         # Development seed data
│           └── migrations/      # Versioned database migrations
│
├── test/
│   └── run-tests.ts             # Automated backend tests
│
├── public/                      # Static assets
├── .env.example                 # Environment configuration template
├── CONTRIBUTING.md              # Team contribution guidelines
├── package.json                 # Dependencies and npm scripts
├── server.ts                    # Application server entry point
└── README.md                    # Project documentation
```

*Note: The architecture above describes the main logical structure. Individual filenames and directories may vary as the project evolves.*

---

## ⚙️ Local Installation & Setup

### Prerequisites

- Node.js v18 or higher
- npm v9 or higher
- MySQL 8.0+ (for persistent local database storage)
- Git

### Step 1: Clone the Repository

```bash
git clone https://github.com/<your-username>/diu-campus-ride-sharing-portal.git

cd diu-campus-ride-sharing-portal
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Create a `.env` file using the existing `.env.example` template.

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

On Linux/macOS:

```bash
cp .env.example .env
```

Configure the required environment variables:

```env
PORT=3000
NODE_ENV=development

JWT_SECRET=replace_with_a_random_secret_of_at_least_32_characters
JWT_EXPIRES_IN=7d

DIU_EMAIL_DOMAIN=diu.edu.bd

# MySQL / TiDB Cloud Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_database_password
DB_NAME=diu_campus_ride_sharing
DB_SSL_CA="path/to/isrgrootx1.pem"
```

**Security Notice:**
- Generate a unique, sufficiently random JWT secret for each environment.
- Never commit `.env` files or actual credentials to GitHub.
- Use `.env.example` only for placeholder configuration values.

### Step 4: Database Setup

If you are initializing a **brand-new** local MySQL or TiDB database:

1. Create the project database:

```sql
CREATE DATABASE IF NOT EXISTS diu_campus_ride_sharing;
```

2. Run `server/src/database/schema.sql` **only on a fresh empty database** (warning: `schema.sql` contains `DROP TABLE IF EXISTS` statements and will wipe existing tables).
3. For existing databases, apply incremental migrations instead of re-running `schema.sql`:

```bash
npm run migrate
npm run migrate:indexes
npm run migrate:passenger-requests
```

4. Provision the campus admin account safely using environment variables (`ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_STUDENT_ID`, `ADMIN_PHONE` in `.env`):

```bash
npm run seed:admin
```

*(Note: `server/src/database/seed.sql` is intended strictly for fresh local development/testing environments as it contains `TRUNCATE TABLE` statements. Never execute `schema.sql` or `seed.sql` against a live or shared database.)*

### Step 5: Run the Application

Start the development server:

```bash
npm run dev
```

Open your browser:

```text
http://localhost:3000
```

---

## 🔑 Admin & Development Accounts

- **Campus Admin:** Provisioned safely via `npm run seed:admin` using the `ADMIN_*` environment variables defined in your local `.env` file (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `ADMIN_STUDENT_ID`, `ADMIN_PHONE`). Never hardcode or publish production credentials.
- **Local Development Seed Data:** If you run `server/src/database/seed.sql` on an empty local database, sample student/driver/admin rows are created for local UI walkthroughs; review `seed.sql` directly if needed for local development and change all passwords before any shared deployment.

---

## 🧪 Automated Backend Testing

Run the automated backend test suite:

```bash
npm test
```

The test suite is designed to verify important application functionality, including:

1. DIU Student ID validation (`000-00-000`).
2. Institutional email domain validation.
3. Student registration and duplicate detection.
4. Bcrypt password hashing and verification.
5. JWT token generation and verification.
6. Driver application submission.
7. Admin driver approval.
8. Ride creation and route information.
9. Filtered ride searches.
10. Passenger booking requests.
11. Transactional seat allocation.
12. Booking cancellation and seat restoration.
13. Student account blocking and suspension.
14. Admin account protection.

Additional tests may cover booking concurrency, authorization, validation, and other edge cases.

Run the available quality checks:

```bash
npm run lint
npm run test
npm run build
```

*(In `package.json`, `npm run lint` runs TypeScript verification via `tsc --noEmit`, `npm test` runs the isolated in-memory test suite `test/run-tests.ts`, and `npm run build` runs `vite build`.)*

Only use scripts available in the project's `package.json`.

---

## 📡 REST API Documentation

Base URL:

```text
http://localhost:3000/api
```

### 0. Health & Liveness

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Readiness & database connection health check |
| GET | `/live` | Lightweight process liveness check |

### 1. Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register a DIU student |
| POST | `/auth/login` | Authenticate student and set HttpOnly cookie |
| POST | `/auth/logout` | Clear authentication cookie |
| GET | `/auth/me` | Retrieve authenticated student |
| POST | `/auth/forgot-password` | Request password reset token |
| POST | `/auth/reset-password` | Reset password with valid reset token |
| POST | `/auth/verify-email` | Verify student email with verification token |
| POST | `/auth/resend-verification` | Resend email verification token |

### 2. User Profile

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users/profile` | Retrieve student profile |
| GET | `/users/dashboard-stats` | Retrieve personal booking and ride counts |
| PUT | `/users/profile` | Update profile information and privacy toggle |
| PUT | `/users/password` | Change account password |
| POST | `/users/avatar` | Upload validated profile avatar image |
| DELETE | `/users/avatar` | Remove profile avatar |
| GET | `/users/:id/public` | View public DIU student profile |

### 3. Driver Operations

| Method | Endpoint | Description |
|---|---|---|
| POST | `/drivers/apply` | Submit driver application |
| GET | `/drivers/history` | View driver application review history |

### 4. Ride Management

| Method | Endpoint | Description |
|---|---|---|
| GET | `/rides` | Search rides with filters |
| GET | `/rides/mine` | Retrieve posted rides |
| GET | `/rides/:id` | Retrieve ride details |
| POST | `/rides` | Publish a ride (approved drivers only) |
| PUT | `/rides/:id` | Update an open/scheduled ride |
| PATCH | `/rides/:id/status` | Update ride status (`scheduled`, `open`, `in_progress`, `completed`, `cancelled`) |
| PATCH | `/rides/:id/cancel` | Cancel a scheduled/open ride |
| PATCH | `/rides/:id/complete` | Mark a ride as completed |

### 5. Ride Requests & Bookings

| Method | Endpoint | Description |
|---|---|---|
| POST | `/rides/:id/requests` | Submit a booking request |
| GET | `/rides/:id/requests` | Retrieve incoming requests for a specific ride |
| GET | `/requests/mine` | Retrieve personal passenger booking requests |
| GET | `/requests/incoming` | Retrieve incoming booking requests across driver's rides |
| PATCH | `/requests/:id/accept` | Accept a booking request |
| PATCH | `/requests/:id/reject` | Reject a booking request |
| PATCH | `/requests/:id/cancel` | Cancel a booking request |

### 6. Passenger Ride Requests & Driver Offers

| Method | Endpoint | Description |
|---|---|---|
| GET | `/passenger-requests` | Browse open passenger requests (approved drivers only) |
| GET | `/passenger-requests/mine` | Retrieve personal passenger requests |
| GET | `/passenger-requests/offers/mine` | Retrieve offers submitted by authenticated driver |
| GET | `/passenger-requests/:id` | View passenger request details and offers |
| POST | `/passenger-requests` | Post a new passenger ride request |
| PATCH | `/passenger-requests/:id/cancel` | Cancel own passenger ride request |
| POST | `/passenger-requests/:id/offers` | Submit a driver offer for a passenger request |
| PATCH | `/passenger-requests/offers/:offerId` | Update a pending driver offer |
| PATCH | `/passenger-requests/offers/:offerId/withdraw` | Withdraw a pending driver offer |
| PATCH | `/passenger-requests/:id/offers/:offerId/accept` | Accept a driver offer (atomic ride & booking creation) |
| PATCH | `/passenger-requests/:id/offers/:offerId/reject` | Reject a driver offer |

### 7. Reviews, Notifications, Chat & Safety Center

| Method | Endpoint | Description |
|---|---|---|
| POST | `/reviews` | Submit a rating/review for a completed ride |
| GET | `/reviews/user/:userId` | Retrieve reviews received by a student |
| GET | `/reviews/ride/:rideId` | Retrieve ride reviews and review eligibility |
| GET | `/notifications` | List notifications and unread count |
| PATCH | `/notifications/read-all` | Mark all notifications as read |
| PATCH | `/notifications/:id/read` | Mark one notification as read |
| DELETE | `/notifications/:id` | Delete a notification |
| GET | `/chat/conversations` | List ride/match conversations |
| POST | `/chat/conversations` | Get or create a conversation |
| GET | `/chat/conversations/:id/messages` | Fetch conversation message history |
| PATCH | `/chat/conversations/:id/read` | Mark conversation messages as read |
| POST | `/chat/conversations/:id/messages` | Send a message in a conversation |
| GET | `/safety/emergency-contacts` | List personal emergency contacts (max 5) |
| POST | `/safety/emergency-contacts` | Add an emergency contact |
| DELETE | `/safety/emergency-contacts/:id` | Remove an emergency contact |
| POST | `/safety/reports` | Submit a student safety report |
| GET | `/safety/reports/mine` | List submitted safety reports |
| GET | `/safety/blocks` | List blocked users |
| POST | `/safety/blocks` | Block a user |
| DELETE | `/safety/blocks/:blockedId` | Unblock a user |

### 8. Administration

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/stats` | Retrieve platform statistics |
| GET | `/admin/users` | Search and list student accounts |
| PATCH | `/admin/users/:id/verify` | Toggle Verified DIU Student badge |
| PATCH | `/admin/users/:id/block` | Block or reactivate an account |
| DELETE | `/admin/users/:id` | Remove a student account |
| GET | `/admin/drivers/pending` | View pending driver applications |
| PATCH | `/admin/drivers/:id/approve` | Approve a driver application |
| PATCH | `/admin/drivers/:id/reject` | Reject a driver application |
| GET | `/admin/rides` | View all platform rides |
| PATCH | `/admin/rides/:id/moderate` | Cancel/moderate a ride and notify participants |
| GET | `/admin/bookings` | View platform booking records |
| GET | `/admin/reports` | View safety reports |
| PATCH | `/admin/reports/:id` | Update report status and optionally suspend user |

*All protected endpoints require the appropriate authentication and authorization.*

---

## 🗺️ Map Services & Public Provider Limitations

The frontend uses free, zero-key public geospatial services by default:

- **Map Tiles (`OpenStreetMap` + `OSM Germany` fallback):** Configured in `src/utils/mapConfig.ts`. Public OSM tile servers enforce fair-use/rate limits and may temporarily throttle heavy traffic; the client detects failed or policy-notice tiles and automatically falls back to OSM Germany.
- **Geocoding (`Nominatim`):** Reverse and forward address searches in `MapPicker` use `https://nominatim.openstreetmap.org` with client-side debouncing (550 ms), in-memory response caching, request timeouts, and automatic `AbortController` cancellation. If Nominatim is temporarily unreachable or rate-limited, coordinate labels fall back gracefully to `lat, lng`.
- **Routing (`OSRM`):** Route polylines and distance/ETA estimates use the public `https://router.project-osrm.org` demo server with timeouts and caching. If OSRM times out or rate-limits requests, maps automatically fall back to a dashed straight-line route with Haversine distance estimation.
- **Production Recommendation:** For high-volume campus production traffic, consider hosting dedicated tile/OSRM/Nominatim instances or configuring a custom commercial tile endpoint via `VITE_MAP_TILE_URL` / `VITE_MAP_ATTRIBUTION` while respecting provider Terms of Service.

---

## ✅ Feature Verification Matrix (F1–F21)

The following matrix documents the project's 21 defined functional requirements.

| Feature ID | Feature Description | Backend Implementation | Frontend Implementation |
|:---:|---|---|---|
| F1 | Student Registration | Registration API and validation | RegisterPage |
| F2 | Login and Logout | Authentication APIs | LoginPage |
| F3 | Student Authentication | JWT middleware and blocked account checks | ProtectedRoute |
| F4 | Role-Based Permissions | Admin and approved-driver middleware | Navbar and route guards |
| F5 | Student Profile | Profile and password APIs | ProfilePage |
| F6 | Become a Driver | Driver application API | BecomeDriverPage |
| F7 | Admin Approval | Driver approval API | AdminDriverApprovalsPage |
| F8 | Create Ride | Ride creation and validation | PostRidePage |
| F9 | Map Location Selection | Coordinate storage | MapPicker |
| F10 | My Posted Rides | Ride management APIs | MyRidesPage |
| F11 | Incoming Requests | Request management APIs | MyRidesPage |
| F12 | Search Rides | Filtered ride search API | SearchRidesPage |
| F13 | Ride Details | Ride details API | RideDetailsPage |
| F14 | Request a Ride | Booking request API | RideDetailsPage |
| F15 | My Requests | Personal booking requests API | MyRequestsPage |
| F16 | Cancel Request | Cancellation and seat restoration | MyRequestsPage |
| F17 | Driver Contact Privacy | Conditional contact information access | RideDetailsPage and MyRequestsPage |
| F18 | Status Transitions | Booking state validation | StatusBadge |
| F19 | Admin Dashboard | Admin statistics API | AdminDashboardPage |
| F20 | User Management | Student management APIs | AdminUsersPage |
| F21 | Driver Approvals | Driver approval management APIs | AdminDriverApprovalsPage |

*Feature implementation and test status should be confirmed against the current codebase and test results before being reported as verified.*

---

## 🔐 Security & Privacy

Security and student privacy are important aspects of this project.

- Institutional email validation for DIU students.
- Student ID format validation.
- Password hashing using bcryptjs.
- JWT-based authentication.
- HttpOnly authentication cookies.
- Protected backend routes and authorization middleware.
- Parameterized database queries.
- Restricted driver contact information.
- Admin-controlled driver approval.
- Student account blocking and access control.

---

## 🤝 Team Collaboration

This project follows a structured Git and GitHub collaboration workflow.

All contributors should:

- Use their own GitHub accounts.
- Create dedicated feature branches.
- Make meaningful code contributions.
- Use descriptive commit messages.
- Test changes before pushing.
- Submit Pull Requests for review.
- Avoid committing secrets and unnecessary files.

For detailed contribution instructions, see:

**[CONTRIBUTING.md](CONTRIBUTING.md)**

---

## 🎯 Project Objectives

The Campus Ride Sharing Portal aims to:

1. Connect DIU students travelling along similar routes.
2. Reduce individual commuting expenses through fair cost-sharing.
3. Provide a secure student-only transportation network.
4. Improve ride discovery and booking convenience.
5. Maintain reliable seat availability and booking management.
6. Protect student privacy through controlled information access.
7. Provide administrators with tools for platform management.

---

## 👨‍💻 Project Information

**Project Name:** Campus Ride Sharing Portal — DIU  
**Institution:** Daffodil International University  
**Project Type:** Software Engineering Capstone Project  
**Platform:** Web Application  
**Target Users:** Verified DIU Students

---

**Developed with dedication for the DIU student community.** 🚗
