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
| Database | MySQL 8.0+, mysql2 |
| Database Fallback | Transactional in-memory relational store |
| Mapping | Leaflet 1.9, OpenStreetMap |
| Geocoding | Nominatim |
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

# MySQL Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=diu_ride_sharing
```

**Security Notice:**
- Generate a unique, sufficiently random JWT secret for each environment.
- Never commit `.env` files or actual credentials to GitHub.
- Use `.env.example` only for placeholder configuration values.

### Step 4: Database Setup

If you are using MySQL locally:

1. Create the project database.
2. Review the existing database schema.
3. Apply the required database migrations in the correct order.
4. Insert development seed data if required.

Example:

```sql
CREATE DATABASE diu_ride_sharing;
```

The project includes database schema and migration files under:

```text
server/src/database/
```

**Important:** Follow the project's existing migration instructions and migration sequence. Do not execute the base schema or seed scripts repeatedly against an existing database without checking their compatibility.

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

## 🔑 Demo Accounts

The following accounts are intended for development, demonstration, and academic evaluation, provided they are available in the configured seed database.

| Role | Email | Password |
|---|---|---|
| Campus Admin | `admin@diu.edu.bd` | `Admin123!` |
| Approved Driver | `tanvir.cse@diu.edu.bd` | `Password123!` |
| Approved Driver | `nusrat.swe@diu.edu.bd` | `Password123!` |
| Pending Driver | `rahat.eee@diu.edu.bd` | `Password123!` |
| Student Passenger | `sadia.bba@diu.edu.bd` | `Password123!` |

**Note:** Demo account availability depends on the configured development seed data. Do not use these credentials in a production environment.

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
npm run build
npm test
npm run lint
```

Only use scripts available in the project's `package.json`.

---

## 📡 REST API Documentation

Base URL:

```text
http://localhost:3000/api
```

### 1. Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register a DIU student |
| POST | `/auth/login` | Authenticate student and set cookie |
| POST | `/auth/logout` | Clear authentication cookie |
| GET | `/auth/me` | Retrieve authenticated student |

### 2. User Profile

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users/profile` | Retrieve student profile |
| PUT | `/users/profile` | Update profile information |
| PUT | `/users/password` | Change account password |

### 3. Driver Operations

| Method | Endpoint | Description |
|---|---|---|
| POST | `/drivers/apply` | Submit driver application |

### 4. Ride Management

| Method | Endpoint | Description |
|---|---|---|
| GET | `/rides` | Search rides with filters |
| GET | `/rides/:id` | Retrieve ride details |
| POST | `/rides` | Publish a ride (approved drivers only) |
| PUT | `/rides/:id` | Update an open ride |
| PATCH | `/rides/:id/cancel` | Cancel a scheduled ride |
| PATCH | `/rides/:id/complete` | Mark a ride as completed |
| GET | `/rides/mine` | Retrieve posted rides |

### 5. Ride Requests & Bookings

| Method | Endpoint | Description |
|---|---|---|
| POST | `/rides/:id/requests` | Submit a booking request |
| GET | `/rides/:id/requests` | Retrieve incoming ride requests |
| PATCH | `/requests/:id/accept` | Accept a booking request |
| PATCH | `/requests/:id/reject` | Reject a booking request |
| PATCH | `/requests/:id/cancel` | Cancel a booking request |
| GET | `/requests/mine` | Retrieve personal booking requests |

### 6. Administration

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/stats` | Retrieve platform statistics |
| GET | `/admin/users` | View student accounts |
| PATCH | `/admin/users/:id/block` | Block or reactivate an account |
| DELETE | `/admin/users/:id` | Remove a student account |
| GET | `/admin/drivers/pending` | View pending driver applications |
| PATCH | `/admin/drivers/:id/approve` | Approve a driver application |
| PATCH | `/admin/drivers/:id/reject` | Reject a driver application |

*All protected endpoints require the appropriate authentication and authorization.*

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
