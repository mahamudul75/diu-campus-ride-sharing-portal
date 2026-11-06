# 🚗 Campus Ride Sharing Portal — Daffodil International University (DIU)

> **DIU Capstone Engineering Project**  
> An exclusive, safe, cost-splitting campus ride-sharing and carpooling web platform designed exclusively for students of Daffodil International University.

---

## 📌 Project Concept

**Campus Ride Sharing Portal — DIU** is not a public commercial ride-hailing app. It is a closed, secure student-to-student network connecting DIU classmates commuting between **Daffodil Smart City (Ashulia Campus)**, **Dhanmondi (Sobhanbag)**, **Mirpur 10**, **Uttara**, **Savar**, and Dhaka city.

### 🌟 Key Differentiators:
- **100% Student-Only Community:** Every user is verified via their DIU Student ID (`000-00-000` format) and institutional email (`@diu.edu.bd`).
- **Unified Account Model:** There are no separate driver and passenger accounts. Every user is a student who can commute as a passenger or apply with their bike/car to offer rides on days they commute.
- **Fair Cost-Sharing:** Passengers save significant travel time and commute costs; student drivers offset their daily fuel expenses.
- **Privacy Protection (F17):** Driver phone numbers and vehicle registration plates remain strictly protected until a booking request is accepted by the driver.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Tailwind CSS, React Router 7, Axios, Leaflet, Lucide Icons |
| **Backend** | Node.js, Express.js, REST API Architecture, Helmet, CORS, Cookie-Parser |
| **Authentication** | JWT (JSON Web Tokens), bcryptjs password hashing, HttpOnly secure cookies |
| **Database** | MySQL 8.0+ (`mysql2` with connection pooling & parameterized queries) |
| **Database Fallback** | Seamless transactional in-memory relational store with ACID transactions |
| **Mapping & GIS** | Leaflet 1.9, OpenStreetMap tiles, Nominatim geocoding & route paths |
| **Testing** | Node.js / tsx automated test runner |

---

## 📂 Project Architecture

```
campus-ride-sharing/
├── client/ (or src/)
│   ├── components/         # Reusable UI (Navbar, Footer, RideCard, MapPicker, MapView, Modal, Toast, StatusBadge)
│   ├── context/            # AuthContext, ToastContext
│   ├── pages/              # 16 Complete Pages (Landing, Register, Login, Dashboard, Search, Post, My Rides, etc.)
│   ├── services/           # Axios API client with credentials & token interceptor
│   └── types/              # TypeScript models for User, Ride, RideRequest, AdminStats
├── server/
│   ├── src/
│   │   ├── config/         # db.ts (MySQL pool & graceful container fallback)
│   │   ├── controllers/    # authController, userController, driverController, rideController, requestController, adminController
│   │   ├── middleware/     # auth.ts (JWT verify, requireAdmin, requireApprovedDriver, isBlocked check)
│   │   ├── routes/         # authRoutes, userRoutes, driverRoutes, rideRoutes, requestRoutes, adminRoutes, index.ts
│   │   ├── utils/          # jwt.ts, validators.ts (DIU Student ID & email checks)
│   │   └── database/
│   │       ├── schema.sql  # MySQL table definitions, constraints, indexes
│   │       └── seed.sql    # Seed data (1 admin, 4 students, 6 rides, requests)
├── test/
│   └── run-tests.ts        # Automated backend test suite
├── .env.example            # Environment variables template
├── CONTRIBUTING.md         # Team collaboration & git branching workflow
├── package.json            # Scripts & dependencies
├── server.ts               # Full-stack server entry point (Express + Vite)
└── README.md               # Project documentation
```

---

## ⚙️ Local Installation & Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)
- MySQL 8.0+ (optional: an automatic transactional in-memory relational engine runs if MySQL is absent)

### Step 1: Clone Repository & Install Dependencies
```bash
git clone https://github.com/<your-username>/campus-ride-sharing.git
cd campus-ride-sharing
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update `.env` with your settings:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=diu_campus_ride_jwt_secret_capstone_2026_key_secure
JWT_EXPIRES_IN=7d
DIU_EMAIL_DOMAIN=diu.edu.bd

# MySQL Configuration (when running locally)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=diu_ride_sharing
```

### Step 3: MySQL Database Setup & Seeding
If you have MySQL installed locally:
```bash
# 1. Log in to MySQL
mysql -u root -p

# 2. Run the Schema SQL script
mysql -u root -p < server/src/database/schema.sql

# 3. Seed the database with sample users and rides
mysql -u root -p < server/src/database/seed.sql
```

### Step 4: Run the Application
Start the full-stack development server:
```bash
npm run dev
```
Open your browser at: **`http://localhost:3000`**

---

## 🔑 Pre-Seeded Demo Accounts

For instant grading, testing, and team review:

| Role | Email | Password | Details |
|---|---|---|---|
| **Campus Admin** | `admin@diu.edu.bd` | `Admin123!` | Full admin privileges, user management, driver approvals |
| **Approved Driver** | `tanvir.cse@diu.edu.bd` | `Password123!` | Motorbike driver (`Yamaha FZ-S`), active posted rides |
| **Approved Driver** | `nusrat.swe@diu.edu.bd` | `Password123!` | Car driver (`Toyota Aqua`), active posted rides |
| **Pending Driver** | `rahat.eee@diu.edu.bd` | `Password123!` | Driver application submitted, pending review |
| **Student Passenger** | `sadia.bba@diu.edu.bd` | `Password123!` | Regular passenger with active bookings |

*(Note: The login page includes quick 1-click test buttons to instantly fill these credentials!)*

---

## 🧪 Running Automated Backend Tests

Execute the automated test suite with:
```bash
npm test
```
The test suite verifies 20 critical assertions across:
1. DIU Student ID regex validation (`000-00-000`).
2. Institutional email domain enforcement (`@diu.edu.bd`).
3. Student registration & duplicate detection.
4. Bcrypt password hashing & verification.
5. JWT token generation & payload verification.
6. Driver application submissions.
7. Admin driver approvals.
8. Ride publishing & route storage.
9. Filtered ride search queries.
10. Passenger booking requests.
11. Transactional seat decrements & full-ride status locking.
12. Request cancellations with exact single-seat restoration.
13. Student account blocking / suspension governance.
14. Admin account protection rules.

---

## 📡 REST API Documentation (`/api`)

### Authentication
- `POST /api/auth/register` — Register new student with DIU ID & email verification.
- `POST /api/auth/login` — Sign in with email and password (sets HttpOnly cookie).
- `POST /api/auth/logout` — Clear authentication cookie.
- `GET  /api/auth/me` — Get currently authenticated student.

### User Profile
- `GET  /api/users/profile` — Retrieve student profile details.
- `PUT  /api/users/profile` — Update name, phone, and vehicle information.
- `PUT  /api/users/password` — Change account password.

### Driver Operations
- `POST /api/drivers/apply` — Submit student vehicle details for driver approval.

### Rides
- `GET   /api/rides` — Search rides with filters (pickup, destination, date, max_fare, vehicle_type).
- `GET   /api/rides/:id` — Get detailed ride view with map coordinates and driver details.
- `POST  /api/rides` — Create new ride (Approved drivers only).
- `PUT   /api/rides/:id` — Edit open ride details.
- `PATCH /api/rides/:id/cancel` — Cancel a scheduled ride.
- `PATCH /api/rides/:id/complete` — Mark ride completed.
- `GET   /api/rides/mine` — Retrieve all rides posted by the logged-in driver.

### Ride Requests & Bookings
- `POST  /api/rides/:id/requests` — Submit booking request for a ride.
- `GET   /api/rides/:id/requests` — Driver views incoming requests for their ride.
- `PATCH /api/requests/:id/accept` — Driver accepts request (seats decrement transactionally).
- `PATCH /api/requests/:id/reject` — Driver rejects request.
- `PATCH /api/requests/:id/cancel` — Passenger cancels booking (restores seat count).
- `GET   /api/requests/mine` — Passenger views all their ride requests and unlocked driver contact info.

### Administration
- `GET    /api/admin/stats` — Platform metrics (total users, approved drivers, rides, requests).
- `GET    /api/admin/users` — Search and view all student accounts.
- `PATCH  /api/admin/users/:id/block` — Suspend or reactivate student account.
- `DELETE /api/admin/users/:id` — Remove student account and cascade associated data.
- `GET    /api/admin/drivers/pending` — List pending driver applications.
- `PATCH  /api/admin/drivers/:id/approve` — Approve student driver application.
- `PATCH  /api/admin/drivers/:id/reject` — Reject driver application.

---

## ✅ Feature Verification Matrix (F1 – F21)

| Feature ID | Feature Description | Backend Implementation | Frontend Implementation | Test Status |
|:---:|:---|:---:|:---:|:---:|
| **F1** | Student Registration | `POST /api/auth/register`, DIU ID & email validation | `RegisterPage.tsx` | Verified & Passed |
| **F2** | Login and Logout | `POST /api/auth/login`, `POST /api/auth/logout` | `LoginPage.tsx` | Verified & Passed |
| **F3** | Student Authentication | `authenticateToken` middleware, blocked account check | `ProtectedRoute.tsx` | Verified & Passed |
| **F4** | Role-Based Permissions | `requireAdmin`, `requireApprovedDriver` middleware | Role-aware `Navbar.tsx`, Route Guards | Verified & Passed |
| **F5** | Student Profile | `GET/PUT /api/users/profile`, `PUT /api/users/password` | `ProfilePage.tsx` | Verified & Passed |
| **F6** | Become a Driver | `POST /api/drivers/apply` | `BecomeDriverPage.tsx` | Verified & Passed |
| **F7** | Admin Approval | `PATCH /api/admin/drivers/:id/approve` | `AdminDriverApprovalsPage.tsx` | Verified & Passed |
| **F8** | Create Ride | `POST /api/rides` with seat & fare validation | `PostRidePage.tsx` | Verified & Passed |
| **F9** | Map Location Selection | Coordinates stored in MySQL (`pickup_lat`, `dest_lat`) | Leaflet `MapPicker.tsx` with OSM & Nominatim | Verified & Passed |
| **F10** | My Posted Rides | `GET /api/rides/mine`, `PATCH complete/cancel` | `MyRidesPage.tsx` | Verified & Passed |
| **F11** | Incoming Requests | `GET /api/rides/:id/requests`, `PATCH accept/reject` | `MyRidesPage.tsx` Requests Modal | Verified & Passed |
| **F12** | Search Rides | `GET /api/rides` with multi-parameter SQL filters | `SearchRidesPage.tsx` (Split/List/Map) | Verified & Passed |
| **F13** | Ride Details | `GET /api/rides/:id` with joined driver details | `RideDetailsPage.tsx` | Verified & Passed |
| **F14** | Request a Ride | `POST /api/rides/:id/requests` (self-booking blocked) | `RideDetailsPage.tsx` Confirmation Modal | Verified & Passed |
| **F15** | My Requests | `GET /api/requests/mine` | `MyRequestsPage.tsx` | Verified & Passed |
| **F16** | Cancel Request | `PATCH /api/requests/:id/cancel` with seat restoration | `MyRequestsPage.tsx` | Verified & Passed |
| **F17** | Driver Contact Info | Privacy gate: phone & plate masked unless accepted | `RideDetailsPage.tsx`, `MyRequestsPage.tsx` | Verified & Passed |
| **F18** | Status Transitions | Valid state machine enforcement | Semantic `StatusBadge.tsx` | Verified & Passed |
| **F19** | Admin Dashboard | `GET /api/admin/stats` | `AdminDashboardPage.tsx` | Verified & Passed |
| **F20** | User Management | `GET/PATCH/DELETE /api/admin/users` with safety check | `AdminUsersPage.tsx` | Verified & Passed |
| **F21** | Driver Approvals | `GET /api/admin/drivers/pending` | `AdminDriverApprovalsPage.tsx` | Verified & Passed |
