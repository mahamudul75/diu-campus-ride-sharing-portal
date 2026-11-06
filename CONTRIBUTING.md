# Contributing to Campus Ride Sharing Portal — DIU

Thank you for contributing to the **Campus Ride Sharing Portal — Daffodil International University (DIU)** capstone engineering project!

This guide outlines our team Git workflow, branch naming standards, code review procedures, and responsibilities for all 3 student teammates.

---

## 👥 Team Roles & Responsibilities

### **1. Main Developer (Architecture & Core Systems)**
- Overall system architecture, database schema design, and server configuration.
- Full-stack authentication (JWT + bcrypt), authorization middleware, and security headers.
- OpenStreetMap + Leaflet integration, geolocation search, and route plotting.
- End-to-end integration and final system testing.

### **2. Teammate 2 (Booking Engine, Validation & Backend Testing)**
- Review and refine ride request state machine transitions (`pending` → `accepted` / `rejected` / `cancelled`).
- Concurrency protection and seat consistency verification during booking cancellations.
- Form validation hardening for DIU Student ID (`000-00-000`) and phone formats.
- Expanding automated backend tests and edge-case test cases.

### **3. Teammate 3 (UI/UX, Dashboards & Documentation)**
- Polish responsive UI across mobile, tablet, and desktop viewports.
- Enhance student dashboard, profile settings, and admin oversight interfaces.
- Accessibility compliance (contrast ratios, keyboard navigation, readable badges).
- User workflow testing, manual test execution, and documentation upkeep.

---

## 🚀 Git & GitHub Collaboration Workflow

### **Step 1: Clone the Repository**
```bash
git clone https://github.com/<your-username>/campus-ride-sharing.git
cd campus-ride-sharing
```

### **Step 2: Install Dependencies**
```bash
npm install
```

### **Step 3: Create a Dedicated Feature Branch**
Never commit directly to the `main` branch. Always branch off the latest `main`:
```bash
git checkout main
git pull origin main
git checkout -b feature/<feature-name>

# Examples:
# git checkout -b feature/booking-validation
# git checkout -b feature/dashboard-ui-polish
# git checkout -b fix/seat-restoration-edge-case
```

### **Step 4: Make Real Code Changes & Test Locally**
Make your changes, ensure TypeScript compiles without errors, and run the automated test suite:
```bash
npm test
npm run lint
```

### **Step 5: Commit Your Work**
Write clear, descriptive commit messages describing the *why* and *what*:
```bash
git add .
git commit -m "feat(booking): add atomic seat count validation on request accept"
```

### **Step 6: Push to Your Branch & Open a Pull Request (PR)**
```bash
git push -u origin feature/<feature-name>
```

1. Navigate to the repository on GitHub.
2. Click **"Compare & pull request"**.
3. Fill in the PR template:
   - **Summary of changes**
   - **Feature ID affected (e.g. F11, F16)**
   - **How it was tested**
4. Request review from teammates.

### **Step 7: Code Review & Merging**
- At least one teammate review is recommended prior to merge.
- Resolve any merge conflicts locally:
  ```bash
  git checkout main
  git pull origin main
  git checkout feature/<feature-name>
  git merge main
  ```
- Use **Squash and Merge** or **Rebase and Merge** to keep git history clean and legible.

---

## 🧪 Code Quality Standards
- **Strictly No Mock Data**: Use database queries and real endpoints.
- **Privacy First (F17)**: Never expose driver phone number or vehicle registration plate until a booking request is accepted.
- **Seat Invariant**: Available seats must never drop below `0` or exceed `seats_total`.
- **All users are DIU students**: Do not separate driver and student models; every driver is a verified student.
