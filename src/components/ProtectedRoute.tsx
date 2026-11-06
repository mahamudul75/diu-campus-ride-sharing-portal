import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import Spinner from './Spinner.tsx';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireDriver?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
  requireDriver = false
}) => {
  const { user, loading, isAdmin, isApprovedDriver } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Verifying DIU student session...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (user.is_blocked === 1) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-rose-50 border border-rose-200 rounded-2xl text-center">
        <h2 className="text-lg font-bold text-rose-900 mb-2">Account Suspended</h2>
        <p className="text-xs text-rose-700 leading-relaxed mb-4">
          Your DIU Ride Sharing account has been suspended by the campus proctor office. Please
          contact transport administration at <span className="font-mono">rideshare@diu.edu.bd</span>.
        </p>
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireDriver && !isApprovedDriver) {
    return <Navigate to="/become-driver" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
