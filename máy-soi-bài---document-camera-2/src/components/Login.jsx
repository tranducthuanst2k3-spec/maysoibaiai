import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Camera, 
  Monitor, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldAlert, 
  HelpCircle,
  RefreshCw
} from 'lucide-react';

export default function Login() {
  const { user, signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const navigate = useNavigate();

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const alternateHostname = currentHostname.includes('-dev-') 
    ? currentHostname.replace('-dev-', '-pre-')
    : currentHostname.includes('-pre-') 
      ? currentHostname.replace('-pre-', '-dev-') 
      : null;

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleCopyDomain = async (domainToCopy = currentHostname) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(domainToCopy);
      } else {
        const input = document.createElement('input');
        input.value = domainToCopy;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.warn('Không thể sao chép domain:', err);
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      setIsUnauthorizedDomain(false);
      await signInWithGoogle();
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect');
      navigate(redirect ? decodeURIComponent(redirect) : '/');
    } catch (err) {
      const isDomainError = 
        err?.code === 'auth/unauthorized-domain' ||
        (err instanceof Error && err.message.includes('auth/unauthorized-domain')) ||
        (err instanceof Error && err.message.includes('unauthorized-domain'));

      if (isDomainError) {
        setIsUnauthorizedDomain(true);
        setError('Tên miền của website chưa được cấp quyền trong Firebase Console.');
        console.warn('Yêu cầu cấu hình Firebase: Hãy thêm tên miền hiện tại vào Authorized Domains trong Firebase Console.');
      } else {
        console.warn('Đăng nhập thất bại:', err?.message || err);
        const message = err instanceof Error ? err.message : 'Đăng nhập không thành công. Vui lòng thử lại!';
        setError(message.includes('popup-closed-by-user') ? 'Hộp thoại đăng nhập đã bị đóng.' : message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 md:p-8">
      {/* Header */}
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Máy Soi Bài
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                WebRTC Live
              </span>
            </h1>
            <p className="text-xs text-slate-400">Biến điện thoại thành máy chiếu vật thể giảng dạy</p>
          </div>
        </div>

        <button
          onClick={() => setShowGuide(!showGuide)}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800/60 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
          <span>Cấu hình Domain</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-6">
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            Trực tiếp qua WebRTC P2P • Không độ trễ
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-tight">
            Trình chiếu bài làm <br />
            <span className="bg-gradient-to-r from-indigo-400 via-sky-300 to-emerald-400 bg-clip-text text-transparent">
              Trực tiếp từ Điện thoại
            </span>
          </h2>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Sử dụng camera sau của điện thoại truyền video thời gian thực lên máy tính / máy chiếu lớp học. Không lưu trữ ảnh trung gian, bảo mật tuyệt đối theo mã định danh tài khoản Google cá nhân.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm flex items-start gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Camera độ nét cao</h4>
                <p className="text-xs text-slate-400 mt-0.5">Tự động lấy nét chữ viết học sinh, hỗ trợ bật đèn Flash soi bài.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
                <Monitor className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Chiếu Full màn hình</h4>
                <p className="text-xs text-slate-400 mt-0.5">Xem chữ viết trên màn hình lớn, xoay 90°, tăng tương phản rõ nét.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> Phòng riêng theo Google UID
            </span>
            <span className="flex items-center gap-1.5 text-sky-400">
              <CheckCircle2 className="w-4 h-4" /> Kết nối ngang hàng WebRTC
            </span>
          </div>
        </div>

        {/* Login Box */}
        <div className="lg:col-span-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md relative overflow-hidden">
            <div className="text-center space-y-2 mb-6">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-white">Đăng nhập tài khoản</h3>
              <p className="text-xs text-slate-400">
                Đăng nhập bằng tài khoản Google để sử dụng Room ID riêng biệt.
              </p>
            </div>

            {/* Error / Unauthorized Domain Banner */}
            {isUnauthorizedDomain ? (
              <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-semibold text-amber-300 text-sm">
                      Domain chưa được cấp quyền (auth/unauthorized-domain)
                    </h5>
                    <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                      Firebase yêu cầu bạn thêm tên miền hiện tại vào danh sách <strong>Authorized domains</strong> trong dự án Firebase <strong>soibai</strong>:
                    </p>
                  </div>
                </div>

                {/* Domain display + Copy button */}
                <div className="space-y-2">
                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                    <div className="truncate min-w-0">
                      <span className="text-[10px] text-slate-400 block">Miền phát triển hiện tại:</span>
                      <span className="font-mono text-xs text-emerald-400 truncate select-all block">
                        {currentHostname}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopyDomain(currentHostname)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Đã copy!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>

                  {alternateHostname && (
                    <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                      <div className="truncate min-w-0">
                        <span className="text-[10px] text-slate-400 block">Miền chia sẻ (khuyên thêm cùng lúc):</span>
                        <span className="font-mono text-xs text-sky-400 truncate select-all block">
                          {alternateHostname}
                        </span>
                      </div>
                      <button
                        onClick={() => handleCopyDomain(alternateHostname)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer border border-slate-700"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Sao chép</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="space-y-1.5 pt-1">
                  <p className="font-medium text-amber-300">Cách sửa trong 30 giây:</p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-300">
                    <li>Nhấn nút <strong>Sao chép</strong> tên miền ở trên</li>
                    <li>Mở Firebase Console bằng nút bên dưới</li>
                    <li>Vào <strong>Settings</strong> → <strong>Authorized domains</strong> → <strong>Add domain</strong> và dán vào</li>
                  </ol>
                </div>

                <a
                  href="https://console.firebase.google.com/project/soibai/authentication/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Mở Cài đặt Firebase Authentication</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : error ? (
              <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : null}

            {/* Guide card when toggled */}
            {showGuide && !isUnauthorizedDomain && (
              <div className="mb-5 p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 text-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" /> Cấu hình Authorized Domains
                  </span>
                  <button
                    onClick={() => setShowGuide(false)}
                    className="text-slate-400 hover:text-white text-xs"
                  >
                    Đóng
                  </button>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Tên miền máy chủ hiện tại:
                </p>
                <div className="p-2 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-sky-300 truncate select-all">
                    {currentHostname}
                  </span>
                  <button
                    onClick={handleCopyDomain}
                    className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Đã copy' : 'Copy'}</span>
                  </button>
                </div>
                <a
                  href="https://console.firebase.google.com/project/soibai/authentication/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200 underline mt-1"
                >
                  <span>Mở Firebase Console Settings</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              ) : isUnauthorizedDomain ? (
                <RefreshCw className="w-5 h-5 text-indigo-600" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>
                {loading 
                  ? 'Đang kết nối Google...' 
                  : isUnauthorizedDomain 
                    ? 'Thử đăng nhập lại' 
                    : 'Đăng nhập bằng Google'}
              </span>
            </button>

            <div className="mt-6 pt-5 border-t border-slate-800 text-center">
              <p className="text-xs text-slate-400">
                Dùng cùng tài khoản Google trên cả điện thoại và máy tính để kết nối ngay.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto w-full text-center py-4 border-t border-slate-800/60 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>© 2026 Máy Soi Bài • Ứng dụng Document Camera WebRTC</p>
        <p className="text-slate-400">Giao thức WebRTC P2P • Firestore Signaling</p>
      </footer>
    </div>
  );
}
