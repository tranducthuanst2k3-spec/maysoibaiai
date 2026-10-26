import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute({ children, allowGuestWithRoom = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <p className="text-slate-300 font-medium text-sm">Đang tải thông tin tài khoản...</p>
      </div>
    );
  }

  // Cho phép quét mã QR vào thẳng giao diện quay/soi bài khi có mã phòng hợp lệ trong URL
  if (allowGuestWithRoom) {
    const params = new URLSearchParams(location.search);
    const roomParam = params.get('room') || params.get('roomId');
    if (roomParam && roomParam.trim().length > 0) {
      return children;
    }
  }

  if (!user) {
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${returnUrl}`} replace />;
  }

  return children;
}
