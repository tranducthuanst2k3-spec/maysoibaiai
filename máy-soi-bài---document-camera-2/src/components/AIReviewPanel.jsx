import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Edit3,
  RefreshCw,
  X,
  FileText,
  ThumbsUp,
  Tv,
  Check,
  ChevronDown,
  ChevronUp,
  Shield,
  HelpCircle,
  Copy,
  Info
} from 'lucide-react';

export default function AIReviewPanel({
  isOpen,
  onClose,
  isLoading,
  error,
  aiResult,
  onAnalyze, // Hàm gọi phân tích / đọc lại
  errorDecisions, // Map: { [errorIndex]: { status: 'pending'|'accepted'|'edited'|'rejected', customMoTa, customGoiY, customViTri } }
  onErrorDecisionChange,
  showOnProjector,
  onToggleShowOnProjector,
  teacherFeedback,
  onTeacherFeedbackChange,
  isMobile = false,
}) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editForm, setEditForm] = useState({ vi_tri: '', mo_ta: '', goi_y_sua: '' });
  const [showOcrText, setShowOcrText] = useState(false);
  const [copiedOcr, setCopiedOcr] = useState(false);

  if (!isOpen) return null;

  const loiList = aiResult?.loi || [];

  // Đếm số lỗi đã chấp nhận (được phép hiện trên màn hình chiếu)
  const acceptedCount = loiList.filter((_, idx) => {
    const decision = errorDecisions[idx]?.status;
    return decision === 'accepted' || decision === 'edited';
  }).length;

  const handleStartEdit = (idx, item) => {
    const decision = errorDecisions[idx];
    setEditingIndex(idx);
    setEditForm({
      vi_tri: decision?.customViTri ?? item.vi_tri ?? '',
      mo_ta: decision?.customMoTa ?? item.mo_ta ?? '',
      goi_y_sua: decision?.customGoiY ?? item.goi_y_sua ?? '',
    });
  };

  const handleSaveEdit = (idx) => {
    onErrorDecisionChange(idx, {
      status: 'edited',
      customViTri: editForm.vi_tri.trim(),
      customMoTa: editForm.mo_ta.trim(),
      customGoiY: editForm.goi_y_sua.trim(),
    });
    setEditingIndex(null);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  const handleCopyOcr = async () => {
    if (!aiResult?.noi_dung_doc_duoc) return;
    try {
      await navigator.clipboard.writeText(aiResult.noi_dung_doc_duoc);
      setCopiedOcr(true);
      setTimeout(() => setCopiedOcr(false), 2000);
    } catch (e) {
      console.warn('Lỗi copy OCR:', e);
    }
  };

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${
        isMobile
          ? 'inset-x-0 bottom-0 max-h-[85vh] bg-slate-900 border-t border-slate-700 rounded-t-3xl shadow-2xl flex flex-col'
          : 'top-4 right-4 bottom-4 w-full max-w-lg bg-slate-900/95 border border-slate-700/80 rounded-3xl shadow-2xl backdrop-blur-xl flex flex-col'
      }`}
    >
      {/* 1. Header Bảng Nhận xét */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/60 rounded-t-3xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-base sm:text-lg">AI Nhận xét bài làm</h3>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Gemini Vision
              </span>
            </div>
            <p className="text-xs text-slate-400">Trợ lý sư phạm đọc chữ viết tay & phép tính</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Nút Đọc lại */}
          {!isLoading && (
            <button
              onClick={() => onAnalyze()}
              title="Đọc lại và phân tích lại ảnh bài làm"
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Đọc lại</span>
            </button>
          )}

          {/* Nút Đóng */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Đóng bảng nhận xét"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. DÒNG CỐ ĐỊNH QUAN TRỌNG: "Gợi ý của AI, giáo viên là người quyết định" */}
      <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-xs flex items-center gap-2.5 shrink-0">
        <Shield className="w-4 h-4 text-amber-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-300 text-xs sm:text-sm">
            Gợi ý của AI, giáo viên là người quyết định
          </p>
          <p className="text-[11px] text-amber-200/80 truncate sm:whitespace-normal">
            Chỉ những lỗi thầy cô bấm <strong>Chấp nhận</strong> mới được chiếu lên màn hình.
          </p>
        </div>
      </div>

      {/* 3. Thân nội dung (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-slate-200 text-sm">
        {/* Đang tải */}
        {isLoading && (
          <div className="py-12 px-4 text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <div className="absolute inset-2 rounded-full border-4 border-emerald-500/20 border-b-emerald-400 animate-spin animate-reverse" />
              <div className="absolute inset-0 flex items-center justify-center text-indigo-400">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
            </div>
            <div className="space-y-1.5">
              <h4 className="font-bold text-white text-base">Đang đọc bài làm của học sinh...</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                Gemini đang nhận diện chữ viết tay, kiểm tra các phép tính và tìm lỗi chính tả/ngữ pháp tiếng Việt.
              </p>
            </div>
          </div>
        )}

        {/* Lỗi mạng hoặc lỗi server */}
        {!isLoading && error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-semibold text-rose-300 text-sm">Hệ thống AI đang bận</h5>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {error.includes('{') || error.includes('503') || error.includes('UNAVAILABLE')
                    ? 'Hệ thống AI đang xử lý quá nhiều bài cùng lúc. Thầy/cô vui lòng đợi 3-5 giây rồi bấm thử lại nhé!'
                    : error}
                </p>
              </div>
            </div>
            <div className="pt-1 flex gap-2">
              <button
                onClick={() => onAnalyze()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử đọc lại bài</span>
              </button>
            </div>
          </div>
        )}

        {/* Kết quả phân tích */}
        {!isLoading && !error && aiResult && (
          <>
            {/* Nhận xét ngắn khuyến khích */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/60 to-slate-900 border border-indigo-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
                  <ThumbsUp className="w-4 h-4 text-emerald-400" /> Lời nhận xét khích lệ
                </span>
                <span className="text-[10px] text-slate-400">Giọng sư phạm tiểu học</span>
              </div>
              <textarea
                value={teacherFeedback}
                onChange={(e) => onTeacherFeedbackChange(e.target.value)}
                placeholder="Nhận xét của giáo viên..."
                rows={2}
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl p-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />
              <p className="text-[11px] text-slate-400 italic">
                * Thầy cô có thể sửa trực tiếp câu nhận xét này trước khi hiển thị lên màn hình.
              </p>
            </div>

            {/* Nội dung đọc được (OCR) có thể thu gọn */}
            <div className="rounded-2xl bg-slate-950/60 border border-slate-800 overflow-hidden">
              <button
                onClick={() => setShowOcrText(!showOcrText)}
                className="w-full p-3.5 flex items-center justify-between text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <span className="font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-400" />
                  <span>Nội dung đọc được từ bài làm</span>
                </span>
                <div className="flex items-center gap-2">
                  {showOcrText ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {showOcrText && (
                <div className="p-3.5 pt-0 border-t border-slate-800/80 space-y-2">
                  <div className="p-3 bg-slate-900/90 rounded-xl text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    {aiResult.noi_dung_doc_duoc || 'Không nhận diện được nội dung chữ.'}
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleCopyOcr}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedOcr ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedOcr ? 'Đã sao chép' : 'Sao chép nội dung'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Danh sách lỗi phát hiện */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-white text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Danh sách phát hiện ({loiList.length})</span>
                </h4>
                <span className="text-xs text-emerald-400 font-medium">
                  {acceptedCount} lỗi đã được duyệt chiếu
                </span>
              </div>

              {loiList.length === 0 ? (
                <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-center space-y-1.5">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
                  <p className="font-semibold text-sm">Bài làm rất tốt!</p>
                  <p className="text-xs text-slate-300">
                    AI không phát hiện thấy lỗi sai về số học, chính tả hoặc ngữ pháp.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {loiList.map((item, idx) => {
                    const decision = errorDecisions[idx] || { status: 'pending' };
                    const isEditing = editingIndex === idx;

                    const effectiveViTri = decision.customViTri ?? item.vi_tri ?? 'Vị trí';
                    const effectiveMoTa = decision.customMoTa ?? item.mo_ta ?? '';
                    const effectiveGoiY = decision.customGoiY ?? item.goi_y_sua ?? '';

                    const isAccepted = decision.status === 'accepted' || decision.status === 'edited';
                    const isRejected = decision.status === 'rejected';

                    return (
                      <div
                        key={idx}
                        className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                          isAccepted
                            ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
                            : isRejected
                            ? 'bg-slate-900/40 border-slate-800/80 opacity-60'
                            : 'bg-slate-950/70 border-slate-800'
                        }`}
                      >
                        {/* Header lỗi */}
                        <div className="p-3.5 pb-2 flex items-center justify-between gap-2 border-b border-slate-800/60">
                          <span className="font-semibold text-xs text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/20">
                            {effectiveViTri}
                          </span>

                          <div className="flex items-center gap-1.5">
                            {isAccepted && (
                              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                {decision.status === 'edited' ? 'Đã sửa & Duyệt' : 'Đã duyệt chiếu'}
                              </span>
                            )}
                            {isRejected && (
                              <span className="text-[11px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                                <XCircle className="w-3 h-3 text-slate-400" /> Bỏ qua
                              </span>
                            )}
                            {decision.status === 'pending' && (
                              <span className="text-[11px] font-medium text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-md">
                                Chờ duyệt
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Thân lỗi (hoặc Form sửa) */}
                        <div className="p-3.5 space-y-2 text-xs">
                          {isEditing ? (
                            <div className="space-y-2 pt-1">
                              <div>
                                <label className="text-[11px] text-slate-400 block mb-1">Vị trí:</label>
                                <input
                                  type="text"
                                  value={editForm.vi_tri}
                                  onChange={(e) => setEditForm({ ...editForm, vi_tri: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:border-indigo-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-400 block mb-1">Mô tả lỗi:</label>
                                <textarea
                                  value={editForm.mo_ta}
                                  onChange={(e) => setEditForm({ ...editForm, mo_ta: e.target.value })}
                                  rows={2}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs focus:border-indigo-500 focus:outline-none resize-none"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-400 block mb-1">Gợi ý sửa:</label>
                                <input
                                  type="text"
                                  value={editForm.goi_y_sua}
                                  onChange={(e) => setEditForm({ ...editForm, goi_y_sua: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:border-indigo-500 focus:outline-none"
                                />
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                                >
                                  Hủy
                                </button>
                                <button
                                  onClick={() => handleSaveEdit(idx)}
                                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Lưu & Chấp nhận</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div>
                                <span className="text-slate-400 block text-[11px]">Lỗi phát hiện:</span>
                                <p className="text-slate-200 mt-0.5 leading-relaxed font-medium">
                                  {effectiveMoTa}
                                </p>
                              </div>

                              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200">
                                <span className="text-indigo-400 text-[10px] font-semibold block uppercase tracking-wider">
                                  Gợi ý sửa:
                                </span>
                                <p className="text-xs font-semibold text-emerald-300 mt-0.5">
                                  {effectiveGoiY}
                                </p>
                              </div>

                              {/* 3 NÚT HÀNH ĐỘNG LỚN: Chấp nhận / Sửa / Bỏ qua */}
                              <div className="pt-2 flex items-center gap-2">
                                <button
                                  onClick={() =>
                                    onErrorDecisionChange(idx, {
                                      status: 'accepted',
                                      customViTri: item.vi_tri,
                                      customMoTa: item.mo_ta,
                                      customGoiY: item.goi_y_sua,
                                    })
                                  }
                                  className={`flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                    isAccepted && decision.status !== 'edited'
                                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400/50'
                                      : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                                  }`}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Chấp nhận</span>
                                </button>

                                <button
                                  onClick={() => handleStartEdit(idx, item)}
                                  className="py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 transition-all cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Sửa</span>
                                </button>

                                <button
                                  onClick={() =>
                                    onErrorDecisionChange(idx, {
                                      status: 'rejected',
                                      customViTri: item.vi_tri,
                                      customMoTa: item.mo_ta,
                                      customGoiY: item.goi_y_sua,
                                    })
                                  }
                                  className={`py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                    isRejected
                                      ? 'bg-slate-700 text-slate-200 ring-2 ring-slate-500'
                                      : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700'
                                  }`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Bỏ qua</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 4. Footer Bảng Nhận xét: Bật/Tắt chiếu lên màn hình */}
      {!isLoading && aiResult && (
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 rounded-b-3xl shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-white block">
                Chiếu nhận xét lên màn hình
              </span>
              <span className="text-[11px] text-slate-400 truncate block">
                {acceptedCount > 0
                  ? `Đang chiếu ${acceptedCount} lỗi đã duyệt`
                  : 'Chưa có lỗi nào được chọn chiếu'}
              </span>
            </div>

            <button
              onClick={onToggleShowOnProjector}
              className={`py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
                showOnProjector
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>{showOnProjector ? 'Đang bật chiếu' : 'Đang tắt chiếu'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
