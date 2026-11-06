import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import Navbar from './components/Navbar.tsx';
import Footer from './components/Footer.tsx';
import ProtectedRoute from './components/ProtectedRoute.tsx';

// Pages
import LandingPage from './pages/LandingPage.tsx';
import RegisterPage from './pages/RegisterPage.tsx';
import LoginPage from './pages/LoginPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import SearchRidesPage from './pages/SearchRidesPage.tsx';
import RideDetailsPage from './pages/RideDetailsPage.tsx';
import PostRidePage from './pages/PostRidePage.tsx';
import MyRidesPage from './pages/MyRidesPage.tsx';
import MyRequestsPage from './pages/MyRequestsPage.tsx';
import BecomeDriverPage from './pages/BecomeDriverPage.tsx';
import ProfilePage from './pages/ProfilePage.tsx';
import AdminDashboardPage from './pages/AdminDashboardPage.tsx';
import AdminUsersPage from './pages/AdminUsersPage.tsx';
import AdminDriverApprovalsPage from './pages/AdminDriverApprovalsPage.tsx';
import NotFoundPage from './pages/NotFoundPage.tsx';

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isDashboardRoute =
    location.pathname.startsWith('/dashboard') ||
    location.pathname.startsWith('/requests') ||
    location.pathname.startsWith('/become-driver') ||
    location.pathname.startsWith('/profile') ||
    location.pathname.startsWith('/rides/create') ||
    location.pathname.startsWith('/my-rides') ||
    location.pathname.startsWith('/admin');

  if (isDashboardRoute) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans antialiased">{children}</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 selection:bg-teal-500 selection:text-white font-sans antialiased">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppLayout>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/search" element={<SearchRidesPage />} />
                <Route path="/rides/:id" element={<RideDetailsPage />} />

                {/* Authenticated Student Routes */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/requests"
                  element={
                    <ProtectedRoute>
                      <MyRequestsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/become-driver"
                  element={
                    <ProtectedRoute>
                      <BecomeDriverPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />

                {/* Approved Driver Gated Routes */}
                <Route
                  path="/rides/create"
                  element={
                    <ProtectedRoute requireDriver={true}>
                      <PostRidePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/my-rides"
                  element={
                    <ProtectedRoute requireDriver={true}>
                      <MyRidesPage />
                    </ProtectedRoute>
                  }
                />

                {/* Admin Role Gated Routes */}
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute requireAdmin={true}>
                      <AdminDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <ProtectedRoute requireAdmin={true}>
                      <AdminUsersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/drivers"
                  element={
                    <ProtectedRoute requireAdmin={true}>
                      <AdminDriverApprovalsPage />
                    </ProtectedRoute>
                  }
                />

                {/* 404 Route */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </AppLayout>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
