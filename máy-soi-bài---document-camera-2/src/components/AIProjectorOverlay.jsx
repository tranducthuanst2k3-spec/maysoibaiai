import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  MessageSquare,
  Award,
  AlertCircle
} from 'lucide-react';

export default function AIProjectorOverlay({
  isOpen,
  onClose,
  teacherFeedback,
  acceptedErrors = [], // Mảng các lỗi đã được chấp nhận
  onOpenReviewPanel,
}) {
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isOpen || (acceptedErrors.length === 0 && !teacherFeedback)) {
    return null;
  }

  return (
    <div className="absolute top-20 right-6 z-40 max-w-sm sm:max-w-md w-full transition-all duration-300">
      {isMinimized ? (
        <button
          onClick={() => setIsMinimized(false)}
          className="ml-auto px-4 py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-emerald-500/50 text-white shadow-2xl backdrop-blur-md flex items-center gap-2.5 transition-transform hover:scale-105 cursor-pointer"
        >
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-left">
            <span className="text-xs font-bold block text-emerald-300">Nhận xét bài làm</span>
            <span className="text-[10px] text-slate-300">
              {acceptedErrors.length} góp ý đã duyệt
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
        </button>
      ) : (
        <div className="bg-slate-950/95 border-2 border-emerald-500/40 rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl text-slate-100 space-y-3.5 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm sm:text-base flex items-center gap-1.5">
                  Nhận xét của Giáo viên
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Đã duyệt
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400">Hiển thị cho cả lớp cùng theo dõi</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(true)}
                title="Thu nhỏ nhận xét"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                title="Ẩn bảng nhận xét khỏi màn hình chiếu"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lời nhận xét sư phạm khích lệ */}
          {teacherFeedback && (
            <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Lời cô nhắn nhủ:</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-100 font-medium leading-relaxed italic">
                "{teacherFeedback}"
              </p>
            </div>
          )}

          {/* Danh sách lỗi đã được giáo viên phê duyệt */}
          {acceptedErrors.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-300 font-semibold px-0.5">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Điểm cần lưu ý & cách sửa:</span>
                </span>
                <span className="text-[11px] text-emerald-400">{acceptedErrors.length} điểm</span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {acceptedErrors.map((err, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-amber-300 text-xs">
                        {err.customViTri || err.vi_tri || `Vị trí #${idx + 1}`}
                      </span>
                    </div>

                    <p className="text-slate-300 font-medium leading-relaxed">
                      {err.customMoTa || err.mo_ta}
                    </p>

                    {(err.customGoiY || err.goi_y_sua) && (
                      <div className="pt-1 flex items-start gap-1.5 text-emerald-300 font-semibold">
                        <span className="text-emerald-400 shrink-0">➜ Sửa đúng:</span>
                        <span>{err.customGoiY || err.goi_y_sua}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer nút mở bảng chi tiết */}
          <div className="pt-1 flex items-center justify-between border-t border-slate-800/80 text-[11px] text-slate-400">
            <span>Giáo viên làm chủ đánh giá</span>
            <button
              onClick={onOpenReviewPanel}
              className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer underline flex items-center gap-1"
            >
              <MessageSquare className="w-3 h-3" />
              <span>Chỉnh sửa các lỗi</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
