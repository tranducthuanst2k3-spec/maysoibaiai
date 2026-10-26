import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Smartphone,
  MonitorPlay,
  LogOut,
  QrCode,
  Copy,
  Check,
  Video,
  Camera,
  ExternalLink,
  Info
} from 'lucide-react';
import QRCode from 'qrcode';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export default function Home() {
  const { user, roomId, logout } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [roomMode, setRoomMode] = useState('idle');

  const mobileUrl = roomId
    ? `${window.location.origin}/mobile?room=${encodeURIComponent(roomId)}`
    : `${window.location.origin}/mobile`;
  const pcUrl = `${window.location.origin}/pc`;

  useEffect(() => {
    // Tạo mã QR cho link mở trên điện thoại
    QRCode.toDataURL(mobileUrl, {
      width: 200,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.warn('Lỗi tạo QR code:', err));
  }, [mobileUrl]);

  useEffect(() => {
    if (!roomId) return;
    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(
      roomRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data?.mode) {
            setRoomMode(data.mode);
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
      }
    );

    return () => unsubscribe();
  }, [roomId]);

  const copyMobileLink = async () => {
    try {
      await navigator.clipboard.writeText(mobileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Không thể sao chép link:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center shadow-md">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">Máy Soi Bài</h1>
              <p className="text-xs text-slate-400">WebRTC Document Camera • Trực tiếp không độ trễ</p>
            </div>
          </div>

          {/* User profile & Logout */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700/60">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Avatar'}
                  className="w-6 h-6 rounded-full object-cover ring-1 ring-indigo-400"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                  {user?.displayName ? user.displayName[0] : 'U'}
                </div>
              )}
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-slate-200 truncate max-w-[140px]">
                  {user?.displayName || 'Người dùng'}
                </p>
              </div>
            </div>

            <button
              onClick={logout}
              className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full flex-1">
        {/* Welcome Banner */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Trạng thái phòng: {roomMode === 'video' ? 'Đang phát video trực tiếp' : 'Sẵn sàng kết nối'}
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Chọn vai trò thiết bị này
          </h2>
          <p className="text-sm sm:text-base text-slate-400 mt-2">
            Mở trên <strong>Điện thoại</strong> (làm máy quay soi bài) và <strong>Máy tính</strong> (kết nối máy chiếu).
          </p>
        </div>

        {/* Two Main Cards: Mobile vs PC */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-4xl mx-auto">
          {/* Option 1: Mobile Scanner */}
          <div
            onClick={() => navigate('/mobile')}
            className="group relative rounded-3xl p-6 sm:p-8 bg-gradient-to-b from-slate-900 to-slate-900/80 border border-slate-800 hover:border-indigo-500/60 shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all" />
            <div>
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Smartphone className="w-7 h-7" />
              </div>

              <div className="inline-block px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2">
                Thiết bị phát
              </div>
              <h3 className="text-2xl font-bold text-white group-hover:text-indigo-300 transition-colors">
                Điện thoại quay
              </h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Dành cho smartphone. Sử dụng camera sau để livestream trực tiếp bài làm của học sinh lên máy tính.
              </p>

              <ul className="mt-5 space-y-2 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  Phát luồng WebRTC thời gian thực độ trễ cực thấp
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  Bật đèn Flash soi rõ chữ viết học sinh
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  Lưới căn chỉnh trang bài tập ngay ngắn
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-800 flex items-center justify-between text-indigo-400 font-semibold text-sm">
              <span>Mở giao diện Điện thoại</span>
              <ExternalLink className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Option 2: PC Projector */}
          <div
            onClick={() => navigate('/pc')}
            className="group relative rounded-3xl p-6 sm:p-8 bg-gradient-to-b from-slate-900 to-slate-900/80 border border-slate-800 hover:border-emerald-500/60 shadow-xl hover:shadow-emerald-500/10 transition-all duration-300 cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
            <div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <MonitorPlay className="w-7 h-7" />
              </div>

              <div className="inline-block px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-2">
                Thiết bị nhận
              </div>
              <h3 className="text-2xl font-bold text-white group-hover:text-emerald-300 transition-colors">
                Máy tính nhận
              </h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Dành cho Laptop / Máy tính để bàn kết nối màn hình lớn hoặc máy chiếu lớp học.
              </p>

              <ul className="mt-5 space-y-2 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Hiển thị video full màn hình nền đen chuyên nghiệp
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Phóng to, xoay 90°, tăng độ tương phản rõ chữ bút chì
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Chế độ bảng đen (đảo màu) bảo vệ mắt và dễ nhìn
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-800 flex items-center justify-between text-emerald-400 font-semibold text-sm">
              <span>Mở giao diện Máy chiếu (PC)</span>
              <ExternalLink className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>

        {/* Quick QR Connect Helper */}
        <div className="mt-12 max-w-4xl mx-auto rounded-3xl bg-slate-900/50 border border-slate-800/80 p-6 sm:p-8 backdrop-blur-sm">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-3 text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 text-xs font-medium border border-sky-500/20">
                <QrCode className="w-3.5 h-3.5" /> Quét mã kết nối nhanh
              </div>
              <h4 className="text-lg font-bold text-white">
                Mở nhanh trên Điện thoại của bạn
              </h4>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md">
                Dùng camera điện thoại quét mã QR bên cạnh để mở ngay trang quay chụp. Đảm bảo bạn đăng nhập cùng tài khoản Google này trên cả 2 thiết bị.
              </p>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-2">
                <button
                  onClick={copyMobileLink}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-2 border border-slate-700 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" /> Đã sao chép link điện thoại
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-400" /> Sao chép liên kết cho điện thoại
                    </>
                  )}
                </button>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 justify-center md:justify-start">
                <Info className="w-3.5 h-3.5 text-slate-400" /> Mã phòng đồng bộ (UID): <span className="font-mono text-slate-300">{roomId?.slice(0, 10)}...</span>
              </div>
            </div>

            {/* QR Code Container */}
            <div className="p-3 bg-white rounded-2xl shadow-xl shrink-0 flex flex-col items-center">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code điện thoại" className="w-36 h-36 rounded-lg" />
              ) : (
                <div className="w-36 h-36 bg-slate-200 animate-pulse rounded-lg flex items-center justify-center text-slate-500 text-xs">
                  Đang tạo QR...
                </div>
              )}
              <span className="text-[11px] font-bold text-slate-800 mt-1">Quét bằng Camera</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-400">
        Máy Soi Bài • Sử dụng tài khoản Google để đồng bộ tự động giữa các thiết bị • WebRTC P2P
      </footer>
    </div>
  );
}
