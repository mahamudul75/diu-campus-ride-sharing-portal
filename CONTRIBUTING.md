# Contributing to Campus Ride Sharing Portal — DIU

Thank you for contributing to the **Campus Ride Sharing Portal — Daffodil International University (DIU)**, a university-based ride-sharing platform developed as a Software Engineering capstone project.

This document defines our team responsibilities, Git collaboration workflow, coding standards, and contribution guidelines for all three student developers.

---

## 👥 Team Roles & Responsibilities

### 1. Main Developer (Project Lead & Core System Development)

- Overall system architecture and full-stack development.
- Database schema design, migrations, and backend configuration.
- Authentication and authorization using JWT and bcrypt.
- Core backend APIs using Node.js and Express.js.
- Ride management, booking integration, and business logic.
- OpenStreetMap, Leaflet, geolocation, and route integration.
- Security implementation and database consistency.
- Final integration, debugging, and system testing.

### 2. Teammate 2 (Booking System, Backend Validation & Testing)

- Review and improve the ride request workflow.
- Verify ride request state transitions: `pending`, `accepted`, `rejected`, and `cancelled`.
- Test booking operations and seat availability consistency.
- Identify and test concurrency-related booking issues.
- Improve validation for DIU Student ID and phone number formats.
- Perform backend API testing and edge-case testing.
- Report bugs and suggest backend improvements.

### 3. Teammate 3 (Frontend UI/UX, Dashboard & Documentation)

- Improve responsive UI across desktop, tablet, and mobile devices.
- Enhance student dashboards and profile interfaces.
- Improve ride search, ride details, and booking interfaces.
- Improve admin dashboard usability and visual consistency.
- Maintain accessibility, readable typography, and consistent UI components.
- Perform manual user workflow testing.
- Update project documentation and report UI-related issues.

---

## 🚀 Git & GitHub Collaboration Workflow

All team members must follow the same Git workflow to maintain a clean and organized project history.

### Step 1: Clone the Repository

```bash
git clone https://github.com/<your-username>/diu-campus-ride-sharing-portal.git
cd diu-campus-ride-sharing-portal
```

### Step 2: Install Dependencies

```bash
npm install
```

If the project has separate frontend and backend dependencies, install them according to the existing project configuration.

### Step 3: Create a Dedicated Feature Branch

Never commit directly to the `main` branch. Always create a separate branch for your assigned task.

```bash
git checkout main
git pull origin main
git checkout -b feature/<feature-name>
```

Examples:

```bash
git checkout -b feature/booking-validation
git checkout -b feature/dashboard-ui-improvements
git checkout -b fix/seat-availability
git checkout -b test/booking-api-tests
```

### Step 4: Make Code Changes and Test Locally

- Work only on your assigned responsibilities.
- Follow the existing project architecture and coding conventions.
- Avoid modifying unrelated files.
- Do not introduce unnecessary dependencies.
- Test your changes before committing.

Run the available project checks when applicable:

```bash
npm run build
npm test
npm run lint
```

Only run scripts that actually exist in the project's `package.json`.

### Step 5: Commit Your Changes

Use clear and meaningful commit messages.

```bash
git add <specific-file-or-folder>
git commit -m "feat(booking): improve ride request validation"
```

Other examples:

```bash
git commit -m "fix(booking): prevent invalid seat allocation"
git commit -m "style(dashboard): improve responsive layout"
git commit -m "test(backend): add booking edge case tests"
git commit -m "docs: update project contribution guidelines"
```

### Step 6: Push Your Branch to GitHub

```bash
git push -u origin feature/<feature-name>
```

After pushing:

1. Open the project repository on GitHub.
2. Select your feature branch.
3. Create a Pull Request (PR) targeting `main`.
4. Include a summary of your changes.
5. Mention the related feature or requirement ID.
6. Describe the tests performed.
7. Request review from another teammate.

### Step 7: Code Review and Merging

- Review code changes before merging.
- Check for errors, security issues, and compatibility problems.
- Resolve merge conflicts carefully.
- Keep the `main` branch stable.
- Use Pull Requests for organized collaboration.

To update your feature branch with the latest main branch:

```bash
git checkout main
git pull origin main
git checkout feature/<feature-name>
git merge main
```

Use Squash and Merge or Rebase and Merge when appropriate.

---

## 🧪 Code Quality & Project Standards

All contributors must follow these project-specific rules.

### 1. Database Integrity
- Use the existing MySQL database architecture.
- Follow the existing schema and migration conventions.
- Do not introduce unnecessary or duplicate database tables.
- Maintain proper foreign key relationships and constraints.
- Never execute destructive database operations without approval.

### 2. Authentication & Authorization
- All platform users must be DIU students.
- Use the existing JWT-based authentication system.
- Follow existing password hashing and security practices.
- Protect private API endpoints using appropriate authorization middleware.
- Only approved drivers can publish rides.

### 3. Ride Booking & Seat Management
- Maintain the correct ride request lifecycle.
- Prevent duplicate or invalid booking requests.
- Available seats must never become negative.
- Available seats must never exceed the total seat capacity.
- Prevent overbooking through proper database-level concurrency protection.
- Restore seat availability correctly when an accepted booking is cancelled.

### 4. User Privacy (F17)
- Never expose driver phone numbers or vehicle registration details publicly.
- Protect sensitive driver information.
- Only reveal restricted driver information after the applicable booking request has been accepted, following the existing privacy rules.

### 5. Map & Routing
- Maintain the existing Leaflet-based map integration.
- Use OpenStreetMap-compatible mapping services.
- Preserve existing location search, map markers, and route functionality.
- Do not introduce paid map APIs or unnecessary external dependencies without team approval.

### 6. Code Quality
- Follow the existing React, TypeScript, Node.js, and Express.js coding conventions.
- Keep frontend and backend responsibilities separated.
- Write reusable and maintainable components.
- Handle API errors and invalid user inputs properly.
- Avoid mock data in production functionality.
- Do not commit environment files, passwords, API secrets, or private credentials.

---

## 🤝 Team Collaboration Rules

1. Every teammate should contribute through their own GitHub account.
2. Each teammate should work on assigned tasks.
3. Commit messages must accurately describe actual code changes.
4. Do not copy another developer's commits or claim someone else's work.
5. Avoid unnecessary changes to files outside your assigned scope.
6. Communicate before modifying shared backend or database components.
7. Test changes before pushing them to GitHub.
8. Maintain a clean and understandable commit history.

---

## 🎯 Project Objective

The primary objective of this project is to develop a secure, reliable, and user-friendly ride-sharing platform exclusively for Daffodil International University students.

The system aims to connect students travelling along similar routes, improve transportation convenience, reduce individual travel costs, and provide a structured university-based ride-sharing experience.

**Thank you for contributing to Campus Ride Sharing Portal — DIU!**
