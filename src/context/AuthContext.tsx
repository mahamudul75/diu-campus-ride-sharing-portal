import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api.ts';
import { User } from '../types/index.ts';
import { useToast } from './ToastContext.tsx';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (formData: any) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
  isApprovedDriver: boolean;
  isPendingDriver: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem('diu_user');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(true);
  const { showToast } = useToast();

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      if (res.data?.success && res.data.user) {
        setUser(res.data.user);
        localStorage.setItem('diu_user', JSON.stringify(res.data.user));
      }
    } catch {
      // Not logged in or expired
      setUser(null);
      localStorage.removeItem('diu_user');
      localStorage.removeItem('diu_token');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data.success) {
        setUser(res.data.user);
        if (res.data.token) {
          localStorage.setItem('diu_token', res.data.token);
        }
        localStorage.setItem('diu_user', JSON.stringify(res.data.user));
        showToast(res.data.message || 'Login successful', 'success');
        return { success: true };
      }
      return { success: false, message: res.data.message || 'Login failed' };
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Login failed. Please check your credentials.';
      showToast(msg, 'error');
      return { success: false, message: msg };
    }
  };

  const register = async (formData: any) => {
    try {
      const res = await api.post('/auth/register', formData);
      if (res.data.success) {
        setUser(res.data.user);
        if (res.data.token) {
          localStorage.setItem('diu_token', res.data.token);
        }
        localStorage.setItem('diu_user', JSON.stringify(res.data.user));
        showToast(res.data.message || 'Registration successful', 'success');
        return { success: true };
      }
      return { success: false, message: res.data.message || 'Registration failed' };
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Registration failed.';
      showToast(msg, 'error');
      return { success: false, message: msg };
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.warn('Logout error ignored:', e);
    } finally {
      setUser(null);
      localStorage.removeItem('diu_user');
      localStorage.removeItem('diu_token');
      showToast('Logged out of DIU Ride Sharing Portal.', 'info');
    }
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('diu_user', JSON.stringify(updatedUser));
  };

  const isAdmin = user?.role === 'admin';
  const isApprovedDriver = user?.driver_status === 'approved';
  const isPendingDriver = user?.driver_status === 'pending';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        updateUser,
        refreshUser,
        isAdmin,
        isApprovedDriver,
        isPendingDriver
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
