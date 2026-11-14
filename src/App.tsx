import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { NotificationProvider } from './context/NotificationContext.tsx';
import Navbar from './components/Navbar.tsx';
import Footer from './components/Footer.tsx';
import ProtectedRoute from './components/ProtectedRoute.tsx';
import Spinner from './components/Spinner.tsx';

// Code-split Pages
const LandingPage = lazy(() => import('./pages/LandingPage.tsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.tsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.tsx'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage.tsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.tsx'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage.tsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.tsx'));
const SearchRidesPage = lazy(() => import('./pages/SearchRidesPage.tsx'));
const RideDetailsPage = lazy(() => import('./pages/RideDetailsPage.tsx'));
const PostRidePage = lazy(() => import('./pages/PostRidePage.tsx'));
const MyRidesPage = lazy(() => import('./pages/MyRidesPage.tsx'));
const MyRequestsPage = lazy(() => import('./pages/MyRequestsPage.tsx'));
const BecomeDriverPage = lazy(() => import('./pages/BecomeDriverPage.tsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.tsx'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.tsx'));
const MessagesPage = lazy(() => import('./pages/MessagesPage.tsx'));
const SafetyPage = lazy(() => import('./pages/SafetyPage.tsx'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage.tsx'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage.tsx'));
const AdminDriverApprovalsPage = lazy(() => import('./pages/AdminDriverApprovalsPage.tsx'));
const AdminRidesPage = lazy(() => import('./pages/AdminRidesPage.tsx'));
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage.tsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.tsx'));

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isDashboardRoute =
    location.pathname.startsWith('/dashboard') ||
    location.pathname.startsWith('/requests') ||
    location.pathname.startsWith('/become-driver') ||
    location.pathname.startsWith('/profile') ||
    location.pathname.startsWith('/rides/create') ||
    location.pathname.startsWith('/my-rides') ||
    location.pathname.startsWith('/messages') ||
    location.pathname.startsWith('/notifications') ||
    location.pathname.startsWith('/safety') ||
    location.pathname.startsWith('/admin');

  if (isDashboardRoute) {
    return (
      <div className="min-h-screen bg-[#E8ECF4] dark:bg-[#111827] text-[#222B42] dark:text-[#F1F4FC] font-sans antialiased selection:bg-[#515FC5] selection:text-white">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#E8ECF4] dark:bg-[#111827] text-[#222B42] dark:text-[#F1F4FC] selection:bg-[#515FC5] dark:selection:bg-[#818CF8] selection:text-white font-sans antialiased">
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
          <NotificationProvider>
            <BrowserRouter>
              <AppLayout>
                <Suspense
                  fallback={
                    <div className="min-h-[60vh] flex items-center justify-center">
                      <Spinner size="lg" />
                    </div>
                  }
                >
                  <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/verify-email" element={<VerifyEmailPage />} />
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
                    <Route
                      path="/notifications"
                      element={
                        <ProtectedRoute>
                          <NotificationsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/messages"
                      element={
                        <ProtectedRoute>
                          <MessagesPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/safety"
                      element={
                        <ProtectedRoute>
                          <SafetyPage />
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
                    <Route
                      path="/admin/rides"
                      element={
                        <ProtectedRoute requireAdmin={true}>
                          <AdminRidesPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/reports"
                      element={
                        <ProtectedRoute requireAdmin={true}>
                          <AdminReportsPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* 404 Route */}
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </AppLayout>
            </BrowserRouter>
          </NotificationProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
