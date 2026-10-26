import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Maximize,
  Minimize,
  RotateCw,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  ArrowLeft,
  Sliders,
  Sun,
  Contrast,
  PenTool,
  Eraser,
  Play,
  Download,
  Expand,
  Shrink,
  Trash2,
  Grid,
  Target,
  ChevronUp,
  ChevronDown,
  Sparkles,
  FlipHorizontal,
  Moon,
  Minus,
  Plus,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Wifi,
  Smartphone,
  Tv,
  RotateCcw,
  Compass,
  Move,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  doc,
  setDoc,
  collection,
  addDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import AIReviewPanel from './AIReviewPanel.jsx';
import AIProjectorOverlay from './AIProjectorOverlay.jsx';

export default function PCProjector() {
  const { roomId } = useAuth();
  const navigate = useNavigate();

  // Video stream & WebRTC
  const videoRef = useRef(null);
  // Kiến trúc 2 Canvas: bgCanvasRef (ảnh đóng băng) & drawCanvasRef (nét vẽ trong suốt)
  const bgCanvasRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const containerRef = useRef(null); // Container có overflow: auto bao bọc video và 2 canvas
  const pcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const lastRemotePosRef = useRef({ x: 0, y: 0 });
  const unsubsRef = useRef([]);
  const lastHandledOfferSdpRef = useRef(null);

  // Trạng thái kết nối
  const [connectionStatus, setConnectionStatus] = useState('Đang đợi tín hiệu từ điện thoại...');
  const [hasStream, setHasStream] = useState(false);

  // Trạng thái Chấm bài (Đóng băng hình ảnh trên Canvas)
  const [isMarkingMode, setIsMarkingMode] = useState(false);
  const isMarkingModeRef = useRef(isMarkingMode);
  isMarkingModeRef.current = isMarkingMode;

  // Nút ẩn/hiện riêng (không chung) cho:
  // 1) Thanh công cụ vẽ (Bút, Tẩy, Bảng màu, Cỡ nét)
  // 2) Thanh điều khiển chiếu phía dưới
  const [showDrawingTools, setShowDrawingTools] = useState(true);
  const [showBottomControls, setShowBottomControls] = useState(true);

  // Tính năng "AI nhận xét bài làm"
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [errorDecisions, setErrorDecisions] = useState({});
  const [showOnProjector, setShowOnProjector] = useState(true);
  const [teacherFeedback, setTeacherFeedback] = useState('');

  // Công cụ vẽ cục bộ trên PC
  const [drawTool, setDrawTool] = useState('pen');
  const [penColor, setPenColor] = useState('#ff0000');
  const [penSize, setPenSize] = useState(3);
  const [eraserSize, setEraserSize] = useState(20);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const drawToolRef = useRef(drawTool);
  drawToolRef.current = drawTool;
  const penColorRef = useRef(penColor);
  penColorRef.current = penColor;
  const penSizeRef = useRef(penSize);
  penSizeRef.current = penSize;
  const eraserSizeRef = useRef(eraserSize);
  eraserSizeRef.current = eraserSize;

  // Tính năng sư phạm & hiển thị
  const [showGrid, setShowGrid] = useState(false);
  const [laserMode, setLaserMode] = useState(false);
  const [laserPos, setLaserPos] = useState({ x: -100, y: -100 });

  // Công cụ chỉnh sửa hình ảnh & Thu phóng
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const [panRatio, setPanRatio] = useState({ x: 0, y: 0 });
  const panRatioRef = useRef(panRatio);
  panRatioRef.current = panRatio;
  const [showCornerMenu, setShowCornerMenu] = useState(false);

  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isInverted, setIsInverted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFill, setIsFill] = useState(false); // object-fit contain / cover
  const [showAdjustPanel, setShowAdjustPanel] = useState(false);

  // Thông tin độ phân giải 2K QHD (2560x1440)
  const [streamResolution, setStreamResolution] = useState(null);
  const [streamQualityLabel, setStreamQualityLabel] = useState('2K QHD (2560×1440)');
  const [sharpnessBoost, setSharpnessBoost] = useState(true); // Bật tối ưu độ nét văn bản mặc định

  // Tối ưu hóa SDP cho chuẩn 2K QHD: Cấp băng thông tối đa 14 Mbps
  const optimizeSdpFor2K = useCallback((sdp) => {
    if (!sdp) return sdp;
    let modified = sdp;
    if (modified.includes('m=video')) {
      modified = modified.replace(
        /m=video ([^\r\n]+)\r\n/,
        'm=video $1\r\nb=AS:14000\r\nb=TIAS:14000000\r\n'
      );
    }
    modified = modified.replace(
      /(a=fmtp:\d+ [^\r\n]+)/g,
      '$1;x-google-min-bitrate=4000;x-google-max-bitrate=14000;x-google-start-bitrate=8000'
    );
    return modified;
  }, []);

  // QR Code kết nối nhanh
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const mobileUrl = `${window.location.origin}/mobile`;
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(mobileUrl, { width: 260, margin: 1 })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.warn('Lỗi tạo mã QR:', err));
  }, [mobileUrl]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.defaultMuted = true;
    }
  }, []);

  const handleCopyLink = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(mobileUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // ==========================================
  // 1. CHẾ ĐỘ 'CAPTURE' & 'STREAM' TRÊN PC (CHUẨN 2K QHD)
  // Kiến trúc 2 Canvas:
  // bgCanvasRef: ảnh chụp video frame 2K siêu sắc nét
  // drawCanvasRef: nét vẽ mực đỏ / con dấu / tẩy
  // ==========================================
  const captureCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!video || !bgCanvas || !drawCanvas) return;

    let videoW = video.videoWidth;
    let videoH = video.videoHeight;
    if (!videoW || !videoH) {
      videoW = 2560;
      videoH = 1440;
    }

    bgCanvas.width = videoW;
    bgCanvas.height = videoH;
    drawCanvas.width = videoW;
    drawCanvas.height = videoH;

    const bgCtx = bgCanvas.getContext('2d');
    if (bgCtx) {
      bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
      bgCtx.imageSmoothingEnabled = true;
      bgCtx.imageSmoothingQuality = 'high';
      try {
        bgCtx.drawImage(video, 0, 0, bgCanvas.width, bgCanvas.height);
        console.log(`[PC Capture 2K] Đã chụp thành công khung hình 2K vào bgCanvas: ${bgCanvas.width}x${bgCanvas.height}`);
      } catch (drawErr) {
        console.error('[PC Capture] Lỗi khi gọi drawImage:', drawErr);
      }
    }

    const drawCtx = drawCanvas.getContext('2d');
    if (drawCtx) {
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }

    try {
      video.pause();
    } catch (e) {
      console.warn('[PC] Pause video cảnh báo:', e);
    }

    setIsMarkingMode(true);
    setConnectionStatus('Chế độ chấm bài 2K (Đã đóng băng hình ảnh siêu nét)');
  }, []);

  const captureCurrentFrameRef = useRef(captureCurrentFrame);
  captureCurrentFrameRef.current = captureCurrentFrame;

  const resumeStreamingVideo = useCallback(() => {
    setIsMarkingMode(false);
    setShowOnProjector(false);
    setIsAiPanelOpen(false);

    const bgCanvas = bgCanvasRef.current;
    if (bgCanvas) {
      const bgCtx = bgCanvas.getContext('2d');
      if (bgCtx) bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    }

    const drawCanvas = drawCanvasRef.current;
    if (drawCanvas) {
      const drawCtx = drawCanvas.getContext('2d');
      if (drawCtx) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }

    const video = videoRef.current;
    if (video) {
      video.play().catch((err) => console.warn('[PC] Play video cảnh báo:', err));
    }

    setConnectionStatus('Đang chiếu trực tiếp');
    console.log('[PC] Đã dọn dẹp 2 Canvas và tiếp tục luồng video WebRTC');
  }, []);

  // Chụp khung hình đang đóng băng (chưa kèm nét vẽ của giáo viên)
  const captureFrozenFrameForAi = useCallback(() => {
    const bgCanvas = bgCanvasRef.current;
    if (bgCanvas && bgCanvas.width > 0 && bgCanvas.height > 0) {
      // bgCanvas chứa chính xác ảnh đóng băng chưa kèm nét vẽ của giáo viên
      return bgCanvas.toDataURL('image/jpeg', 0.85);
    }
    const video = videoRef.current;
    if (video && video.videoWidth > 0) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        return tempCanvas.toDataURL('image/jpeg', 0.85);
      }
    }
    return null;
  }, []);

  // Gửi ảnh tới Gemini để nhận xét bài làm
  const handleAiAnalyze = useCallback(async () => {
    setIsAiLoading(true);
    setAiError(null);
    setIsAiPanelOpen(true);
    try {
      const imageBase64 = captureFrozenFrameForAi();
      if (!imageBase64) {
        throw new Error('Chưa có ảnh bài làm để phân tích. Hãy đảm bảo bài làm đang được đóng băng.');
      }
      const res = await fetch('/api/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || 'Hệ thống AI đang xử lý quá nhiều bài cùng lúc. Thầy/cô vui lòng đợi 3-5 giây rồi bấm thử lại nhé!');
      }
      setAiResult(data.data);
      const initFeedback = data.data.nhan_xet_ngan || '';
      setTeacherFeedback(initFeedback);

      const initDecisions = {};
      (data.data.loi || []).forEach((item, idx) => {
        initDecisions[idx] = {
          status: 'pending',
          customViTri: item.vi_tri,
          customMoTa: item.mo_ta,
          customGoiY: item.goi_y_sua,
        };
      });
      setErrorDecisions(initDecisions);
      setShowOnProjector(true);

      // Đồng bộ kết quả sang Mobile qua DataChannel
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        try {
          dataChannelRef.current.send(
            JSON.stringify({
              type: 'ai_review_sync',
              aiResult: data.data,
              errorDecisions: initDecisions,
              teacherFeedback: initFeedback,
              showOnProjector: true,
            })
          );
        } catch (e) {
          console.warn('Lỗi đồng bộ ai_review_sync sang Mobile:', e);
        }
      }
    } catch (err) {
      console.error('[AI Review PC] Lỗi phân tích:', err);
      // Tuyệt đối không in chuỗi JSON raw ra giao diện
      const rawMsg = err instanceof Error ? err.message : String(err);
      const isJsonOrHttpError = rawMsg.includes('{') || rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE') || rawMsg.includes('status');
      setAiError(
        isJsonOrHttpError
          ? 'Hệ thống AI đang xử lý quá nhiều bài cùng lúc. Thầy/cô vui lòng đợi 3-5 giây rồi bấm thử lại nhé!'
          : rawMsg
      );
    } finally {
      setIsAiLoading(false);
    }
  }, [captureFrozenFrameForAi]);

  // Xử lý thay đổi quyết định duyệt từng lỗi
  const handleErrorDecisionChange = useCallback((idx, decisionUpdate) => {
    setErrorDecisions((prev) => {
      const next = {
        ...prev,
        [idx]: {
          ...(prev[idx] || {}),
          ...decisionUpdate,
        },
      };
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        try {
          dataChannelRef.current.send(
            JSON.stringify({
              type: 'ai_decision_sync',
              errorDecisions: next,
            })
          );
        } catch (e) {}
      }
      return next;
    });
  }, []);

  // ==========================================
  // 2. XỬ LÝ DỮ LIỆU NHẬN TỪ MOBILE QUA DATA CHANNEL
  // - Nhận data sync_view để tự động set zoom và cuộn màn hình khớp 100% với Mobile
  // - Nhận data vẽ: type ('start', 'draw', 'stamp', 'clear', 'eraser'), x, y, color, size
  // - console.log("PC nhận nét vẽ: ", data)
  // - Lấy trực tiếp: ctx = drawCanvasRef.current.getContext('2d')
  // - Dịch ngược tọa độ: X = data.x * drawCanvasRef.current.width, Y = data.y * drawCanvasRef.current.height
  // - Dùng ctx.lineTo, ctx.stroke() để vẽ mực đỏ tương ứng
  // ==========================================
  const handleReceiveData = useCallback((eventOrData) => {
    let data = eventOrData;
    if (eventOrData && typeof eventOrData === 'object' && 'data' in eventOrData) {
      data = eventOrData.data;
    }
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (err) {
        console.error('[PC DataChannel] Lỗi phân tích dữ liệu JSON:', err);
        return;
      }
    }

    if (!data) return;

    // BẮT BUỘC: Log đúng cú pháp để debug
    console.log("PC nhận nét vẽ: ", data);

    // Đồng bộ nhận xét AI từ Mobile sang PC
    if (data.type === 'ai_review_sync') {
      if (data.aiResult) setAiResult(data.aiResult);
      if (data.errorDecisions) setErrorDecisions(data.errorDecisions);
      if (data.teacherFeedback !== undefined) setTeacherFeedback(data.teacherFeedback);
      if (data.showOnProjector !== undefined) setShowOnProjector(data.showOnProjector);
      setIsAiPanelOpen(true);
      return;
    }

    if (data.type === 'ai_decision_sync') {
      if (data.errorDecisions) setErrorDecisions(data.errorDecisions);
      if (data.teacherFeedback !== undefined) setTeacherFeedback(data.teacherFeedback);
      if (data.showOnProjector !== undefined) setShowOnProjector(data.showOnProjector);
      return;
    }

    // 1. Đồng bộ góc nhìn (Zoom & Vị trí góc ảnh panRatio)
    if (data.type === 'sync_view') {
      if (data.zoom !== undefined) {
        const nextZoom = Math.max(1, Math.min(5, Number(data.zoom) || 1));
        setZoom(nextZoom);
        zoomRef.current = nextZoom;
      }
      const pX = data.panRatioX !== undefined ? Number(data.panRatioX) : (data.scrollX !== undefined ? (Number(data.scrollX) * 2 - 1) : 0);
      const pY = data.panRatioY !== undefined ? Number(data.panRatioY) : (data.scrollY !== undefined ? (Number(data.scrollY) * 2 - 1) : 0);
      const newPan = { x: pX, y: pY };
      setPanRatio(newPan);
      panRatioRef.current = newPan;
      return;
    }

    // Nhận thông tin độ phân giải 2K từ camera điện thoại
    if (data.type === 'resolution_info' && data.resolution) {
      setStreamResolution(data.resolution);
      if (data.resolution.label) setStreamQualityLabel(data.resolution.label);
      return;
    }

    if (!drawCanvasRef.current) return;
    // Tự động gán kích thước canvas bằng độ phân giải video nếu chưa gán
    if (videoRef.current && videoRef.current.videoWidth && (!drawCanvasRef.current.width || drawCanvasRef.current.width <= 300)) {
      drawCanvasRef.current.width = videoRef.current.videoWidth;
      drawCanvasRef.current.height = videoRef.current.videoHeight;
    }

    // BẮT BUỘC: Lấy trực tiếp context mới nhất của thẻ Canvas
    const ctx = drawCanvasRef.current.getContext('2d');
    if (!ctx) return;

    // Dịch ngược tọa độ: Nhân tọa độ % nhận được với kích thước thật của PC
    const canvasWidth = drawCanvasRef.current.width || 1920;
    const canvasHeight = drawCanvasRef.current.height || 1080;
    const normX = data.x !== undefined ? Number(data.x) : (data.ratioX !== undefined ? Number(data.ratioX) : 0);
    const normY = data.y !== undefined ? Number(data.y) : (data.ratioY !== undefined ? Number(data.ratioY) : 0);
    const pcX = normX * canvasWidth;
    const pcY = normY * canvasHeight;

    // Tính toán nét vẽ chuẩn xác theo tỷ lệ tài liệu
    let strokeSize;
    if (data.normSize !== undefined && Number(data.normSize) > 0) {
      strokeSize = Number(data.normSize) * canvasWidth;
    } else {
      const rawSize = Number(data.size) || 4;
      strokeSize = Math.max(1, (rawSize / 400) * (canvasWidth / 2));
    }

    if (data.type === 'start') {
      lastRemotePosRef.current = { x: pcX, y: pcY };
      ctx.save();
      if (data.tool === 'eraser' || data.type === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(pcX, pcY, Math.max(1, strokeSize / 2), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = data.color || '#ff0000';
        ctx.beginPath();
        ctx.arc(pcX, pcY, Math.max(1, strokeSize / 2), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (data.type === 'draw') {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (data.tool === 'eraser' || data.type === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = strokeSize;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = data.color || '#ff0000';
        ctx.lineWidth = strokeSize;
      }
      ctx.beginPath();
      const prevX = lastRemotePosRef.current.x !== undefined ? lastRemotePosRef.current.x : pcX;
      const prevY = lastRemotePosRef.current.y !== undefined ? lastRemotePosRef.current.y : pcY;
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(pcX, pcY);
      ctx.stroke();
      ctx.restore();
      lastRemotePosRef.current = { x: pcX, y: pcY };
    } else if (data.type === 'eraser') {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = strokeSize;
      ctx.beginPath();
      const prevX = lastRemotePosRef.current.x !== undefined ? lastRemotePosRef.current.x : pcX;
      const prevY = lastRemotePosRef.current.y !== undefined ? lastRemotePosRef.current.y : pcY;
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(pcX, pcY);
      ctx.stroke();
      ctx.restore();
      lastRemotePosRef.current = { x: pcX, y: pcY };
    } else if (data.type === 'stamp') {
      const stampFontSize = data.normSize !== undefined
        ? Number(data.normSize) * canvasWidth
        : (data.size || 50);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = `${stampFontSize}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(data.emoji || '💯', pcX, pcY);
      ctx.restore();
    } else if (data.type === 'clear') {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      console.log('[PC] Đã xóa toàn bộ nét vẽ theo lệnh từ Mobile');
    }
  }, []);

  const handleReceiveDataRef = useRef(handleReceiveData);
  handleReceiveDataRef.current = handleReceiveData;

  // ==========================================
  // 3. XỬ LÝ TẠO KẾT NỐI WEBRTC CALLEE (MÁY TÍNH)
  // BẮT BUỘC: Gắn pc.ondatachannel = (e) => { e.channel.onmessage = handleReceiveData }
  // NGAY KHI khởi tạo RTCPeerConnection (khi nhận được offer)
  // ==========================================
  const handleOffer = useCallback(async (offerData) => {
    if (!roomId || !offerData || !offerData.sdp) return;

    if (lastHandledOfferSdpRef.current === offerData.sdp) {
      return;
    }
    lastHandledOfferSdpRef.current = offerData.sdp;

    try {
      setConnectionStatus('Nhận được tín hiệu! Đang thiết lập WebRTC...');

      if (pcRef.current) {
        pcRef.current.close();
      }

      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ],
        iceCandidatePoolSize: 10,
      };

      const pc = new RTCPeerConnection(configuration);
      pcRef.current = pc;

      // ========================================================
      // BẮT BUỘC: LẮNG NGHE WEBRTC DATA CHANNEL NGAY KHI KHỞI TẠO PC
      // ========================================================
      pc.ondatachannel = (event) => {
        console.log('[PC WebRTC] Nhận DataChannel từ điện thoại:', event.channel.label);
        dataChannelRef.current = event.channel;

        event.channel.onopen = () => {
          console.log('[PC DataChannel] drawChannel đã MỞ trên PC! Sẵn sàng nhận nét vẽ.');
        };
        event.channel.onmessage = (e) => {
          if (handleReceiveDataRef.current) {
            handleReceiveDataRef.current(e.data);
          }
        };
        event.channel.onclose = () => {
          console.log('[PC DataChannel] drawChannel phía PC đã đóng');
        };
        event.channel.onerror = (err) => {
          console.error('[PC DataChannel] Lỗi drawChannel trên PC:', err);
        };
      };

      const pendingCallerCandidates = [];
      let isRemoteOfferSet = false;

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setConnectionStatus('Đã kết nối mượt mà');
          setHasStream(true);
        } else if (pc.iceConnectionState === 'failed') {
          setConnectionStatus('Kết nối WebRTC thất bại.');
        } else if (pc.iceConnectionState === 'disconnected') {
          setConnectionStatus('Mất kết nối tạm thời với điện thoại.');
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setConnectionStatus('Đang chiếu trực tiếp');
          setHasStream(true);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setConnectionStatus('Mất kết nối với điện thoại.');
          setHasStream(false);
        }
      };

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch((err) => console.warn('[PC WebRTC] video.play() cảnh báo:', err));
          setHasStream(true);
          setConnectionStatus('Đang chiếu trực tiếp');
        } else if (videoRef.current && event.track) {
          let stream = videoRef.current.srcObject;
          if (!stream || !(stream instanceof MediaStream)) {
            stream = new MediaStream();
            videoRef.current.srcObject = stream;
          }
          stream.addTrack(event.track);
          videoRef.current.play().catch((err) => console.warn('[PC WebRTC] video.play() cảnh báo:', err));
          setHasStream(true);
          setConnectionStatus('Đang chiếu trực tiếp');
        }
      };

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          try {
            const calleeCandidateCol = collection(db, 'rooms', roomId, 'calleeCandidates');
            await addDoc(calleeCandidateCol, event.candidate.toJSON());
          } catch (err) {
            console.error('[PC WebRTC] Lỗi lưu callee ICE candidate:', err);
          }
        }
      };

      const offerDesc = new RTCSessionDescription(offerData);
      await pc.setRemoteDescription(offerDesc);
      isRemoteOfferSet = true;

      while (pendingCallerCandidates.length > 0) {
        const queuedCand = pendingCallerCandidates.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(queuedCand));
        } catch (candErr) {
          console.error('[PC WebRTC] Lỗi nạp queued caller candidate:', candErr);
        }
      }

      const answer = await pc.createAnswer();
      const optimizedAnswer = {
        type: answer.type,
        sdp: optimizeSdpFor2K(answer.sdp),
      };
      await pc.setLocalDescription(optimizedAnswer);

      const roomRef = doc(db, 'rooms', roomId);
      await setDoc(
        roomRef,
        {
          answer: {
            type: optimizedAnswer.type,
            sdp: optimizedAnswer.sdp,
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('[PC WebRTC] Lỗi thiết lập kết nối Offer:', err);
      setConnectionStatus('Không thể kết nối WebRTC.');
    }
  }, [roomId, optimizeSdpFor2K]);

  // ==========================================
  // 4. LẮNG NGHE FIRESTORE ROOM STATE & ACTION
  // CHỈ dùng Firestore để đồng bộ action ('stream'|'capture') và rotation!
  // TUYỆT ĐỐI KHÔNG dùng Firestore để truyền nét vẽ!
  // ==========================================
  useEffect(() => {
    if (!roomId) return;

    const roomRef = doc(db, 'rooms', roomId);
    let lastHandledActionTs = 0;

    const roomUnsub = onSnapshot(
      roomRef,
      (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        // Xử lý thông tin chất lượng 2K từ camera
        if (data.resolution) {
          setStreamResolution(data.resolution);
          if (data.resolution.label) setStreamQualityLabel(data.resolution.label);
        }

        // Xử lý góc xoay
        if (data.rotation !== undefined && data.rotation !== rotation) {
          setRotation(data.rotation);
        }

        // Xử lý Offer từ điện thoại
        if (data.offer && data.offer.sdp) {
          handleOffer(data.offer);
        }

        // Xử lý action: 'capture' | 'stream'
        if (data.action && data.timestamp && data.timestamp !== lastHandledActionTs) {
          lastHandledActionTs = data.timestamp;
          if (data.action === 'capture' && !isMarkingModeRef.current) {
            captureCurrentFrame();
          } else if (data.action === 'stream' && isMarkingModeRef.current) {
            resumeStreamingVideo();
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
      }
    );
    unsubsRef.current.push(roomUnsub);

    // Lắng nghe callerCandidates từ điện thoại
    const callerCandidatesCol = collection(db, 'rooms', roomId, 'callerCandidates');
    const callerUnsub = onSnapshot(
      callerCandidatesCol,
      (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            try {
              const data = change.doc.data();
              if (data?.candidate && pcRef.current) {
                if (pcRef.current.remoteDescription) {
                  await pcRef.current.addIceCandidate(new RTCIceCandidate(data));
                }
              }
            } catch (err) {
              console.error('[PC WebRTC] Lỗi nạp caller candidate:', err);
            }
          }
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `rooms/${roomId}/callerCandidates`);
      }
    );
    unsubsRef.current.push(callerUnsub);

    return () => {
      unsubsRef.current.forEach((unsub) => unsub());
      unsubsRef.current = [];
    };
  }, [roomId, handleOffer, captureCurrentFrame, resumeStreamingVideo, rotation]);

  // Thao tác phát tín hiệu từ PC
  const triggerCaptureFromPC = async () => {
    captureCurrentFrame();
    if (roomId) {
      try {
        const roomRef = doc(db, 'rooms', roomId);
        await setDoc(
          roomRef,
          {
            action: 'capture',
            timestamp: Date.now(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('Lỗi đồng bộ action capture từ PC:', e);
      }
    }
  };

  const triggerResumeFromPC = async () => {
    resumeStreamingVideo();
    if (roomId) {
      try {
        const roomRef = doc(db, 'rooms', roomId);
        await setDoc(
          roomRef,
          {
            action: 'stream',
            timestamp: Date.now(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('Lỗi đồng bộ action stream từ PC:', e);
      }
    }
  };

  // Xoay 90° từ PC (Không đóng kết nối WebRTC)
  const handleRotate = async () => {
    const nextRotation = (rotation + 90) % 360;
    setRotation(nextRotation);
    if (roomId) {
      try {
        const roomRef = doc(db, 'rooms', roomId);
        await setDoc(
          roomRef,
          {
            rotation: nextRotation,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('Lỗi đồng bộ rotation từ PC:', e);
      }
    }
  };

  // Xóa nét vẽ
  const handleClearDrawings = () => {
    const drawCanvas = drawCanvasRef.current;
    if (drawCanvas) {
      const ctx = drawCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      }
    }
    // Báo qua data channel nếu cần
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        dataChannelRef.current.send(JSON.stringify({ type: 'clear' }));
      } catch (e) {
        console.warn('Lỗi gửi clear:', e);
      }
    }
  };

  // Tải ảnh đã chấm về máy
  const handleDownloadMarkedImage = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!bgCanvas) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bgCanvas.width;
    tempCanvas.height = bgCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCtx.drawImage(bgCanvas, 0, 0);
    if (drawCanvas) {
      tempCtx.drawImage(drawCanvas, 0, 0);
    }

    const link = document.createElement('a');
    link.download = 'bai-cham-hoc-sinh.png';
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
  };

  // Toàn màn hình HTML5
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch((err) => {
        console.warn('Lỗi bật toàn màn hình:', err);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch((err) => {
        console.warn('Lỗi thoát toàn màn hình:', err);
      });
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ==========================================
  // XỬ LÝ CON LĂN CHUỘT (PHÓNG TO / THU NHỎ ZOOM)
  // ==========================================
  const handleWheel = (e) => {
    // Tính toán tỷ lệ zoom, mỗi lần lăn chuột thay đổi 0.1
    setZoom((prevZoom) => {
      const zoomStep = 0.1;
      // e.deltaY < 0 là lăn lên (phóng to), > 0 là lăn xuống (thu nhỏ)
      const newZoom = e.deltaY < 0 ? prevZoom + zoomStep : prevZoom - zoomStep;
      // Giới hạn zoom từ 1x (mặc định) đến 5x (tối đa)
      const clamped = Math.min(Math.max(1, Math.round(newZoom * 10) / 10), 5);
      zoomRef.current = clamped;
      return clamped;
    });
  };

  // ==========================================
  // 5. VẼ CỤC BỘ TRÊN PC (CHUỘT & CẢM ỨNG)
  // Bù trừ ma trận xoay CSS (rotation: 0, 90, 180, 270), zoom và lật gương (isFlipped)
  // Đảm bảo ngòi bút dính chặt đúng vào đầu con trỏ chuột/ngón tay ở mọi góc xoay
  // ==========================================
  const getCanvasCoords = (eOrClientX, maybeClientY) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0, normX: 0, normY: 0, renderedW: 1, cWidth: 1 };

    const clientX = typeof eOrClientX === 'number'
      ? eOrClientX
      : (eOrClientX?.clientX ?? eOrClientX?.touches?.[0]?.clientX ?? 0);
    const clientY = typeof maybeClientY === 'number'
      ? maybeClientY
      : (eOrClientX?.clientY ?? eOrClientX?.touches?.[0]?.clientY ?? 0);

    const rect = canvas.getBoundingClientRect();

    // Tọa độ tâm của canvas trên viewport (tâm xoay CSS 50% 50%)
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // Vector từ tâm canvas tới vị trí trỏ chuột / ngón tay
    const dx = clientX - cx;
    const dy = clientY - cy;

    const currentZoom = zoomRef.current || zoom || 1;
    const currentPan = panRatioRef.current || panRatio || { x: 0, y: 0 };

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxPanX = Math.max(0, (vw * (currentZoom - 1)) / 2);
    const maxPanY = Math.max(0, (vh * (currentZoom - 1)) / 2);
    const panX = currentPan.x * maxPanX;
    const panY = currentPan.y * maxPanY;

    // 1. Bù trừ tịnh tiến (pan) và phóng to (zoom)
    const unpannedDx = dx - panX;
    const unpannedDy = dy - panY;
    const unzoomedDx = unpannedDx / currentZoom;
    const unzoomedDy = unpannedDy / currentZoom;

    // 2. Bù trừ góc xoay CSS transform: rotate(rotation deg)
    const rot = ((rotation % 360) + 360) % 360;
    let unrotX = unzoomedDx;
    let unrotY = unzoomedDy;

    if (rot === 90) {
      unrotX = unzoomedDy;
      unrotY = -unzoomedDx;
    } else if (rot === 180) {
      unrotX = -unzoomedDx;
      unrotY = -unzoomedDy;
    } else if (rot === 270) {
      unrotX = -unzoomedDy;
      unrotY = unzoomedDx;
    } else if (rot !== 0) {
      const rad = -(rot * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      unrotX = cos * unzoomedDx - sin * unzoomedDy;
      unrotY = sin * unzoomedDx + cos * unzoomedDy;
    }

    // 3. Bù trừ lật gương ngang nếu có (scaleX(-1))
    if (isFlipped) {
      unrotX = -unrotX;
    }

    // 4. Kích thước layout box không xoay của Canvas element
    const boxW = canvas.offsetWidth || canvas.clientWidth || window.innerWidth;
    const boxH = canvas.offsetHeight || canvas.clientHeight || window.innerHeight;

    // 5. Kích thước buffer nội bộ của Canvas
    const cWidth = canvas.width || 1920;
    const cHeight = canvas.height || 1080;

    // 6. Bù trừ tỷ lệ hiển thị CSS object-fit: contain / cover
    const scale = isFill
      ? Math.max(boxW / cWidth, boxH / cHeight)
      : Math.min(boxW / cWidth, boxH / cHeight);

    const renderedW = cWidth * (scale || 1);
    const renderedH = cHeight * (scale || 1);

    // 7. Tọa độ chuẩn hóa tỉ lệ (0 -> 1)
    const normX = Math.max(0, Math.min(1, unrotX / (renderedW || 1) + 0.5));
    const normY = Math.max(0, Math.min(1, unrotY / (renderedH || 1) + 0.5));

    // 8. Tọa độ pixel thực tế trên buffer canvas PC
    const x = normX * cWidth;
    const y = normY * cHeight;

    return { x, y, normX, normY, renderedW, renderedH, cWidth, cHeight };
  };

  const handleCanvasMouseDown = (e) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    // Đảm bảo kích thước buffer của drawCanvas khớp với độ phân giải video
    if (videoRef.current && videoRef.current.videoWidth && (!canvas.width || canvas.width <= 300)) {
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
    } else if (!canvas.width || canvas.width <= 300) {
      canvas.width = 1920;
      canvas.height = 1080;
    }

    const { x, y, normX, normY, renderedW, cWidth } = getCanvasCoords(e);
    lastPosRef.current = { x, y };

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (drawToolRef.current.startsWith('stamp_')) {
      const stampMap = {
        stamp_100: '💯',
        stamp_star: '⭐',
        stamp_smile: '😄',
      };
      const emoji = stampMap[drawToolRef.current] || '💯';
      const stampBaseSize = 50;
      const stampFontSize = Math.max(12, stampBaseSize * (cWidth / (renderedW || cWidth)));

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = `${stampFontSize}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, x, y);
      ctx.restore();

      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        try {
          dataChannelRef.current.send(
            JSON.stringify({
              type: 'stamp',
              emoji,
              size: stampBaseSize,
              normSize: stampBaseSize / (renderedW || cWidth),
              x: normX,
              y: normY,
            })
          );
        } catch (err) {
          console.warn('Lỗi gửi stamp sang Mobile:', err);
        }
      }
      return;
    }

    const currentSize = drawToolRef.current === 'eraser' 
      ? (eraserSizeRef.current || Math.max(12, penSizeRef.current * 3)) 
      : penSizeRef.current;

    const scaledStrokeWidth = Math.max(1, currentSize * (cWidth / (renderedW || cWidth)));

    isDrawingRef.current = true;
    ctx.save();
    if (drawToolRef.current === 'pen') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = penColorRef.current;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, scaledStrokeWidth / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, scaledStrokeWidth / 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        dataChannelRef.current.send(
          JSON.stringify({
            type: 'start',
            x: normX,
            y: normY,
            tool: drawToolRef.current,
            color: penColorRef.current,
            size: currentSize,
            normSize: currentSize / (renderedW || cWidth),
          })
        );
      } catch (err) {
        console.warn('Lỗi gửi nét bắt đầu sang Mobile:', err);
      }
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (!isDrawingRef.current) return;
    if (drawToolRef.current.startsWith('stamp_')) return;

    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y, normX, normY, renderedW, cWidth } = getCanvasCoords(e);
    const currentSize = drawToolRef.current === 'eraser' 
      ? (eraserSizeRef.current || Math.max(12, penSizeRef.current * 3)) 
      : penSizeRef.current;

    const scaledStrokeWidth = Math.max(1, currentSize * (cWidth / (renderedW || cWidth)));

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (drawToolRef.current === 'pen') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = penColorRef.current;
      ctx.lineWidth = scaledStrokeWidth;
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = scaledStrokeWidth;
    }

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();

    lastPosRef.current = { x, y };

    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        dataChannelRef.current.send(
          JSON.stringify({
            type: 'draw',
            x: normX,
            y: normY,
            tool: drawToolRef.current,
            color: penColorRef.current,
            size: currentSize,
            normSize: currentSize / (renderedW || cWidth),
          })
        );
      } catch (err) {
        console.warn('Lỗi gửi tọa độ vẽ sang Mobile:', err);
      }
    }
  };

  const handleCanvasMouseUp = () => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        try {
          dataChannelRef.current.send(JSON.stringify({ type: 'end' }));
        } catch (err) {
          console.warn('Lỗi gửi kết thúc nét sang Mobile:', err);
        }
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unsubsRef.current.forEach((unsub) => unsub());
      unsubsRef.current = [];

      if (dataChannelRef.current) {
        dataChannelRef.current.close();
        dataChannelRef.current = null;
      }

      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, []);

  const pcW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const pcH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const maxPcPanX = Math.max(0, (pcW * (zoom - 1)) / 2);
  const maxPcPanY = Math.max(0, (pcH * (zoom - 1)) / 2);
  const pcPanOffset = {
    x: (panRatio?.x || 0) * maxPcPanX,
    y: (panRatio?.y || 0) * maxPcPanY,
  };

  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative select-none text-white flex flex-col items-center justify-center">
      {/* Top Header: Thanh công cụ vẽ (Bút, Tẩy, Bảng màu, Cỡ nét) - Có nút ẩn/hiện riêng biệt */}
      {(hasStream || isMarkingMode) && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1 pointer-events-auto select-none max-w-[95vw]">
          {showDrawingTools ? (
            <header className="px-3 sm:px-4 py-2 rounded-2xl bg-slate-900/95 border border-amber-500/40 shadow-2xl backdrop-blur-xl flex items-center gap-1.5 sm:gap-2 flex-wrap max-w-full animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Nút Bút */}
              <button
                type="button"
                onClick={() => setDrawTool('pen')}
                className={`py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  drawTool === 'pen'
                    ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Bút</span>
              </button>

              {/* Nút Tẩy */}
              <button
                type="button"
                onClick={() => setDrawTool('eraser')}
                className={`py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  drawTool === 'eraser'
                    ? 'bg-rose-500 text-white shadow-md ring-2 ring-rose-300'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Tẩy</span>
              </button>

              {/* Màu sắc bút: Chọn vô hạn màu + 5 nút màu cơ bản (Đỏ, Xanh dương, Vàng, Đen, Trắng) */}
              {drawTool === 'pen' && (
                <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-xl border border-slate-700">
                  <input
                    type="color"
                    value={penColor}
                    onChange={(e) => {
                      setPenColor(e.target.value);
                      penColorRef.current = e.target.value;
                    }}
                    className="w-5 h-5 rounded-md cursor-pointer border border-white/40 bg-transparent p-0"
                    title="Chọn vô hạn màu sắc"
                  />
                  {[
                    { label: 'Đỏ', hex: '#ef4444' },
                    { label: 'Xanh dương', hex: '#3b82f6' },
                    { label: 'Vàng', hex: '#eab308' },
                    { label: 'Đen', hex: '#000000' },
                    { label: 'Trắng', hex: '#ffffff' },
                  ].map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => {
                        setPenColor(c.hex);
                        penColorRef.current = c.hex;
                      }}
                      className={`w-4 h-4 rounded-full transition-transform cursor-pointer border border-white/20 ${
                        penColor.toLowerCase() === c.hex.toLowerCase()
                          ? 'scale-125 ring-2 ring-amber-400'
                          : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.label}
                    />
                  ))}
                </div>
              )}

              {/* Kích thước Bút / Tẩy: thanh trượt range min="1" max="50" kèm nút Trừ (-) và Cộng (+) */}
              <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-700 text-xs">
                <span className="text-[11px] text-slate-300 whitespace-nowrap">
                  {drawTool === 'eraser' ? 'Tẩy:' : 'Nét:'}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const s = Math.max(1, penSize - 1);
                      setPenSize(s);
                      penSizeRef.current = s;
                      setEraserSize(s * 2);
                      eraserSizeRef.current = s * 2;
                    }}
                    disabled={penSize <= 1}
                    className="w-5 h-5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:pointer-events-none text-slate-200 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
                    title="Giảm kích thước 1px"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={penSize}
                    onChange={(e) => {
                      const s = Number(e.target.value);
                      setPenSize(s);
                      penSizeRef.current = s;
                      setEraserSize(s * 2);
                      eraserSizeRef.current = s * 2;
                    }}
                    className="w-16 sm:w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    title="Độ dày nét bút / tẩy (1 - 50px)"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const s = Math.min(50, penSize + 1);
                      setPenSize(s);
                      penSizeRef.current = s;
                      setEraserSize(s * 2);
                      eraserSizeRef.current = s * 2;
                    }}
                    disabled={penSize >= 50}
                    className="w-5 h-5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:pointer-events-none text-slate-200 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
                    title="Tăng kích thước 1px"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <span className="font-mono text-[11px] font-bold text-amber-300 min-w-[28px] text-right">
                  {penSize}px
                </span>
              </div>

              {/* Nút Xóa nét */}
              <button
                type="button"
                onClick={handleClearDrawings}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-500/30 transition-all cursor-pointer active:scale-95"
                title="Xóa toàn bộ nét vẽ"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {/* Nút Tải bài chấm về máy */}
              <button
                type="button"
                onClick={handleDownloadMarkedImage}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md active:scale-95 cursor-pointer transition-all"
                title="Tải ảnh bài chấm học sinh về máy"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lưu ảnh</span>
              </button>

              {/* Nút Tiếp tục soi trực tiếp (nếu đang ở chế độ chấm bài) */}
              {isMarkingMode && (
                <button
                  type="button"
                  onClick={triggerResumeFromPC}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md active:scale-95 cursor-pointer transition-all"
                  title="Tiếp tục soi bài trực tiếp"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Tiếp tục soi</span>
                </button>
              )}

              {/* Nút Ẩn riêng thanh công cụ vẽ */}
              <button
                type="button"
                onClick={() => setShowDrawingTools(false)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
                title="Ẩn thanh công cụ vẽ"
              >
                <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
                <span>Ẩn vẽ</span>
              </button>
            </header>
          ) : (
            /* Nút riêng hiển thị lại thanh công cụ vẽ khi đang ẩn */
            <button
              type="button"
              onClick={() => setShowDrawingTools(true)}
              className="px-3.5 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-amber-300 hover:text-amber-200 border border-amber-400/50 shadow-2xl backdrop-blur-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 group animate-in fade-in"
              title="Hiện thanh công cụ vẽ (Bút, Tẩy, Bảng màu, Cỡ nét)"
            >
              <PenTool className="w-3.5 h-3.5 text-amber-400" />
              <span>✏️ Hiện công cụ vẽ</span>
            </button>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* RÀNG BUỘC CHUNG:                                         */}
      {/* Các thẻ <video> và <canvas> phải nằm chung trong một     */}
      {/* Container có overflow: auto để có thể cuộn xem khi phóng to */}
      {/* ======================================================== */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="w-full h-full overflow-auto relative bg-black flex items-center justify-center"
        style={{
          overflow: 'auto',
        }}
        onMouseMove={(e) => {
          if (laserMode && !isMarkingMode) {
            setLaserPos({ x: e.clientX, y: e.clientY });
          }
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `translate(${pcPanOffset.x}px, ${pcPanOffset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease-out',
          }}
        >
          {/* 1. Thẻ Video */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onPlaying={() => setHasStream(true)}
            onLoadedData={() => setHasStream(true)}
            onLoadedMetadata={(e) => {
              const v = e.target;
              if (v) {
                v.muted = true;
                v.play().catch(() => {});
                const vw = v.videoWidth || 2560;
                const vh = v.videoHeight || 1440;
                const maxDim = Math.max(vw, vh);
                let label = '2K QHD (2560×1440)';
                if (maxDim >= 3840) label = '4K UHD (3840×2160)';
                else if (maxDim >= 2560) label = '2K QHD (2560×1440)';
                else if (maxDim >= 1920) label = 'Full HD+ (1080p)';
                else label = `${vw}×${vh}`;

                setStreamResolution((prev) => prev || { width: vw, height: vh, label });
                setStreamQualityLabel(label);

                if (drawCanvasRef.current) {
                  drawCanvasRef.current.width = vw;
                  drawCanvasRef.current.height = vh;
                }
                if (bgCanvasRef.current) {
                  bgCanvasRef.current.width = vw;
                  bgCanvasRef.current.height = vh;
                }
              }
            }}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: isFill ? 'cover' : 'contain',
              transform: `scaleX(${isFlipped ? -1 : 1})`,
              transition: 'transform 0.3s ease-out',
              imageRendering: '-webkit-optimize-contrast',
              filter: `brightness(${brightness}%) contrast(${contrast}%) ${
                isInverted ? 'invert(100%) hue-rotate(180deg)' : ''
              } ${sharpnessBoost ? 'contrast(112%) saturate(106%) drop-shadow(0px 0px 0.5px rgba(0,0,0,0.4))' : ''}`,
              display: isMarkingMode ? 'none' : 'block',
            }}
            className="w-full h-full"
          />

          {/* 2. Thẻ Canvas Lớp Dưới (bgCanvasRef): Lưu ảnh chụp video đóng băng */}
          <canvas
            ref={bgCanvasRef}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: isFill ? 'cover' : 'contain',
              transform: `scaleX(${isFlipped ? -1 : 1})`,
              transition: 'transform 0.3s ease-out',
              filter: `brightness(${brightness}%) contrast(${contrast}%) ${
                isInverted ? 'invert(100%) hue-rotate(180deg)' : ''
              }`,
              display: isMarkingMode ? 'block' : 'none',
              pointerEvents: 'none',
            }}
          />

          {/* 3. Lưới nền Ô ly tập vở (Grid Overlay 20x20px) */}
          {showGrid && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 15,
                backgroundImage: `
                  linear-gradient(to right, rgba(56, 189, 248, 0.22) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(56, 189, 248, 0.22) 1px, transparent 1px)
                `,
                backgroundSize: '20px 20px',
              }}
            />
          )}

          {/* 4. Thẻ Canvas Lớp Trên (drawCanvasRef): Bảng vẽ điện tử trong suốt */}
          <canvas
            ref={drawCanvasRef}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: isFill ? 'cover' : 'contain',
              transform: `scaleX(${isFlipped ? -1 : 1})`,
              transition: 'transform 0.3s ease-out',
              filter: `brightness(${brightness}%) contrast(${contrast}%) ${
                isInverted ? 'invert(100%) hue-rotate(180deg)' : ''
              }`,
              display: 'block',
              zIndex: 10,
              cursor: drawTool === 'eraser' ? 'cell' : 'crosshair',
              touchAction: 'none',
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onTouchStart={(e) => {
              if (e.touches[0]) handleCanvasMouseDown(e.touches[0]);
            }}
            onTouchMove={(e) => {
              if (e.touches[0]) handleCanvasMouseMove(e.touches[0]);
            }}
            onTouchEnd={handleCanvasMouseUp}
            onTouchCancel={handleCanvasMouseUp}
          />
        </div>

        {/* Laser Pointer khi đang phát trực tiếp */}
        {laserMode && !isMarkingMode && laserPos.x >= 0 && (
          <div
            className="fixed pointer-events-none z-50 -translate-x-1/2 -translate-y-1/2 transition-transform duration-75"
            style={{ left: `${laserPos.x}px`, top: `${laserPos.y}px` }}
          >
            <div className="w-5 h-5 rounded-full bg-rose-500/80 ring-4 ring-rose-400/40 animate-ping absolute" />
            <div className="w-3.5 h-3.5 rounded-full bg-rose-600 border border-white shadow-lg shadow-rose-600/80" />
          </div>
        )}

        {/* Trạng thái đang đợi kết nối - Giao diện chờ chuyên nghiệp & hiện đại */}
        {!hasStream && !isMarkingMode && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-950/95 backdrop-blur-2xl text-white select-none pointer-events-auto">
            {/* Vòng sáng hào quang mờ nghệ thuật */}
            <div className="absolute w-[500px] h-[500px] bg-gradient-to-tr from-sky-500/10 via-indigo-500/10 to-transparent rounded-full blur-3xl pointer-events-none -translate-y-10" />

            {/* Khối Card Trung Tâm */}
            <div className="relative w-full max-w-xl bg-slate-900/90 border border-slate-700/60 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 flex flex-col items-center text-center backdrop-blur-xl">
              
              {/* Huy hiệu trạng thái đang chờ tín hiệu */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700 text-xs font-semibold text-slate-300 mb-4 shadow-inner">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span>Phòng máy chiếu: <span className="font-mono text-emerald-400 font-bold">{roomId ? roomId.slice(0, 8) : 'Chờ mã'}</span></span>
              </div>

              {/* Tiêu đề chính */}
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-1.5">
                Máy Chiếu Giảng Dạy Trực Tiếp
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mb-5 leading-relaxed">
                Biến camera điện thoại thành máy chiếu vật thể không dây sắc nét 2K, hỗ trợ viết vẽ và chấm bài trực tiếp lên màn hình.
              </p>

              {/* Khung Mã QR hiện đại */}
              <div className="relative p-3.5 bg-white rounded-2xl shadow-xl shadow-sky-950/20 mb-4 group transition-transform hover:scale-[1.02]">
                {qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="Mã QR kết nối điện thoại"
                    className="w-44 h-44 sm:w-52 sm:h-52 object-contain rounded-xl"
                  />
                ) : (
                  <div className="w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center bg-slate-100 rounded-xl text-slate-400 text-xs">
                    Đang tạo mã QR...
                  </div>
                )}
                {/* 4 Góc định vị máy quét sắc nét */}
                <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-indigo-600 rounded-tl-sm pointer-events-none" />
                <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-indigo-600 rounded-tr-sm pointer-events-none" />
                <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-indigo-600 rounded-bl-sm pointer-events-none" />
                <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-indigo-600 rounded-br-sm pointer-events-none" />
              </div>

              {/* Các nút thao tác kết nối nhanh */}
              <div className="flex items-center gap-2 mb-6 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    copiedLink
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                  title="Sao chép đường link mở trên điện thoại"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Đã sao chép link!' : 'Sao chép link kết nối'}</span>
                </button>

                <a
                  href={mobileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                  title="Mở tab mới trên máy tính để thử nghiệm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Mở tab mới</span>
                </a>
              </div>

              {/* 3 Bước hướng dẫn trực quan */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full text-left mb-5">
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-400/30 text-sky-400 font-bold text-[11px] flex items-center justify-center">1</span>
                    <span className="text-xs font-bold text-slate-200">Quét mã QR</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">Mở camera điện thoại hoặc Zalo quét mã kết nối</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-400 font-bold text-[11px] flex items-center justify-center">2</span>
                    <span className="text-xs font-bold text-slate-200">Phát Video</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">Bấm nút "Phát Video Lên Máy Tính" màu xanh ở đáy máy</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 font-bold text-[11px] flex items-center justify-center">3</span>
                    <span className="text-xs font-bold text-slate-200">Soi & Viết vẽ</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">Soi bài trực tiếp 2K, viết vẽ tự do ngay trên cả PC lẫn Điện thoại</p>
                </div>
              </div>

              {/* Trạng thái đường truyền hiện tại */}
              <div className="w-full flex items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[11px] font-medium text-slate-300">{connectionStatus}</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2 cursor-pointer transition-colors"
                >
                  Quay lại Menu
                </button>
              </div>

            </div>

            {/* Chú thích công nghệ chuyên nghiệp dưới đáy */}
            <p className="mt-4 text-[11px] text-slate-500 text-center font-medium">
              WebRTC P2P mã hóa đầu cuối • Độ trễ &lt; 0.1s • Không cần cài đặt phần mềm ngoài
            </p>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* THANH ĐIỀU KHIỂN CHIẾU PHÍA DƯỚI - NÚT ẨN/HIỆN RIÊNG      */}
      {/* Chỉ hiển thị khi điện thoại đã bấm 'Phát Video' hoặc chấm bài */}
      {/* ======================================================== */}
      {(hasStream || isMarkingMode) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1.5 pointer-events-auto select-none max-w-[95vw]">
          {/* Thanh điều khiển chiếu phía dưới */}
          {showBottomControls && (
            <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-md flex-wrap justify-center animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Nút Quay lại Menu */}
              <button
                type="button"
                onClick={() => navigate('/')}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Quay lại Menu"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="h-5 w-px bg-slate-700 mx-1" />

              {/* Phóng to / Thu nhỏ */}
              <button
                type="button"
                onClick={() => setZoom((prev) => Math.max(1, Math.round((prev - 0.2) * 10) / 10))}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Thu nhỏ"
              >
                <ZoomOut className="w-5 h-5" />
              </button>

              <span className="text-xs font-mono font-semibold text-sky-400 min-w-[38px] text-center select-none">
                {Math.round(zoom * 100)}%
              </span>

              <button
                type="button"
                onClick={() => setZoom((prev) => Math.min(5, Math.round((prev + 0.2) * 10) / 10))}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Phóng to"
              >
                <ZoomIn className="w-5 h-5" />
              </button>

              {/* Nút đặt lại 1x nếu đang phóng to */}
              {(zoom > 1 || panRatio.x !== 0 || panRatio.y !== 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    zoomRef.current = 1;
                    setPanRatio({ x: 0, y: 0 });
                    panRatioRef.current = { x: 0, y: 0 };
                  }}
                  className="px-2 py-1 rounded-lg bg-indigo-600/40 hover:bg-indigo-600 text-indigo-300 hover:text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                  title="Đặt lại góc nhìn 1x toàn cảnh"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>1x</span>
                </button>
              )}

              {/* Menu Góc Phóng To Nhanh trên PC */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCornerMenu(!showCornerMenu)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    showCornerMenu || (panRatio.x !== 0 || panRatio.y !== 0)
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Chọn góc phóng to (Trên trái, Trên phải, Dưới trái, Dưới phải)"
                >
                  <Compass className="w-4 h-4 text-indigo-400" />
                  <span>Góc</span>
                </button>
                {showCornerMenu && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 border border-indigo-500/50 rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1 w-44 backdrop-blur-xl">
                    <div className="text-[10px] font-bold text-slate-400 text-center pb-1 border-b border-slate-800">
                      GÓC PHÓNG TO
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setZoom(2.5);
                          zoomRef.current = 2.5;
                          setPanRatio({ x: 1, y: 1 });
                          panRatioRef.current = { x: 1, y: 1 };
                          setShowCornerMenu(false);
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition-colors text-left"
                      >
                        ↖ Trên trái
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setZoom(2.5);
                          zoomRef.current = 2.5;
                          setPanRatio({ x: -1, y: 1 });
                          panRatioRef.current = { x: -1, y: 1 };
                          setShowCornerMenu(false);
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition-colors text-left"
                      >
                        ↗ Trên phải
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setZoom(2.5);
                          zoomRef.current = 2.5;
                          setPanRatio({ x: 1, y: -1 });
                          panRatioRef.current = { x: 1, y: -1 };
                          setShowCornerMenu(false);
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition-colors text-left"
                      >
                        ↙ Dưới trái
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setZoom(2.5);
                          zoomRef.current = 2.5;
                          setPanRatio({ x: -1, y: -1 });
                          panRatioRef.current = { x: -1, y: -1 };
                          setShowCornerMenu(false);
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition-colors text-left"
                      >
                        ↘ Dưới phải
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-800 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setZoom(2);
                          zoomRef.current = 2;
                          setPanRatio({ x: 0, y: 0 });
                          panRatioRef.current = { x: 0, y: 0 };
                          setShowCornerMenu(false);
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-sky-600 text-slate-200 hover:text-white transition-colors text-center"
                      >
                        🎯 Giữa
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setZoom(1);
                          zoomRef.current = 1;
                          setPanRatio({ x: 0, y: 0 });
                          panRatioRef.current = { x: 0, y: 0 };
                          setShowCornerMenu(false);
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white transition-colors text-center"
                      >
                        🔄 1x
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-5 w-px bg-slate-700 mx-1" />

              {/* Nút Chụp để chấm / Tiếp tục soi */}
              {!isMarkingMode ? (
                <button
                  type="button"
                  onClick={triggerCaptureFromPC}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                  title="Chụp đóng băng hình ảnh để chấm bài (vẽ bằng bút đỏ)"
                >
                  <PenTool className="w-4 h-4 text-amber-400" />
                  <span>Chụp để chấm</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={triggerResumeFromPC}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                    title="Tiếp tục soi bài trực tiếp"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Tiếp tục soi</span>
                  </button>

                  {/* Nút Nhận xét bằng AI khi ở chế độ Đóng băng */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!aiResult) {
                        handleAiAnalyze();
                      } else {
                        setIsAiPanelOpen(true);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 active:scale-95 cursor-pointer ring-1 ring-indigo-400/50"
                    title="Nhận xét bài làm học sinh bằng AI (Gemini Vision)"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                    <span>Nhận xét bằng AI</span>
                  </button>
                </div>
              )}

              <div className="h-5 w-px bg-slate-700 mx-1" />

              {/* Nút Xoay 90° */}
              <button
                type="button"
                onClick={handleRotate}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                title="Xoay 90°"
              >
                <RotateCw className="w-4 h-4 text-sky-400" />
                <span>Xoay 90°</span>
                {rotation !== 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-sky-500/30 text-sky-300 font-bold">
                    {rotation}°
                  </span>
                )}
              </button>

              {/* Nút 'Lấp đầy viền' (chuyển đổi object-fit giữa contain/cover) */}
              <button
                type="button"
                onClick={() => setIsFill(!isFill)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isFill
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title={isFill ? 'Thu gọn (contain)' : 'Lấp đầy viền (cover)'}
              >
                {isFill ? <Shrink className="w-4 h-4 text-sky-200" /> : <Expand className="w-4 h-4 text-sky-400" />}
                <span>Lấp đầy viền</span>
              </button>

              {/* Nút 'Toàn màn hình' (Fullscreen HTML5) */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isFullscreen
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình (HTML5)'}
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                <span>Toàn màn hình</span>
              </button>

              {/* Nút Ô ly (Grid 20x20) */}
              <button
                type="button"
                onClick={() => setShowGrid(!showGrid)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  showGrid
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title={showGrid ? 'Tắt lưới ô ly' : 'Bật lưới ô ly tập vở (20x20px)'}
              >
                <Grid className="w-4 h-4 text-sky-400" />
                <span>{showGrid ? 'Tắt Ô ly' : 'Ô ly'}</span>
              </button>

              {/* Laser Pointer (khi đang phát trực tiếp) */}
              {!isMarkingMode && (
                <button
                  type="button"
                  onClick={() => setLaserMode(!laserMode)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    laserMode
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title={laserMode ? 'Tắt con trỏ Laser' : 'Bật con trỏ Laser'}
                >
                  <Target className="w-4 h-4 text-rose-400" />
                  <span>{laserMode ? 'Tắt Laser' : 'Laser'}</span>
                </button>
              )}

              <div className="h-5 w-px bg-slate-700 mx-1" />

              {/* Lật ngang */}
              <button
                type="button"
                onClick={() => setIsFlipped(!isFlipped)}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  isFlipped ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Lật ảnh ngang"
              >
                <FlipHorizontal className="w-5 h-5" />
              </button>

              {/* Tinh chỉnh sáng / nét */}
              <button
                type="button"
                onClick={() => setShowAdjustPanel(!showAdjustPanel)}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  showAdjustPanel || brightness !== 100 || contrast !== 100 || isInverted
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Tinh chỉnh ánh sáng & Độ nét"
              >
                <Sliders className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Nút riêng ẩn / hiện thanh điều khiển chiếu phía dưới */}
          <button
            type="button"
            onClick={() => setShowBottomControls(!showBottomControls)}
            className="px-3.5 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-sky-300 hover:text-sky-200 border border-sky-400/50 shadow-2xl backdrop-blur-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 group"
            title={showBottomControls ? 'Ẩn thanh điều khiển chiếu' : 'Hiện thanh điều khiển chiếu'}
          >
            <span>{showBottomControls ? '🔽 Ẩn điều khiển chiếu' : '⚙️ Hiện điều khiển chiếu'}</span>
          </button>
        </div>
      )}

      {/* Bảng tinh chỉnh hiển thị ánh sáng & tương phản */}
      {showAdjustPanel && (
        <aside
          aria-label="Bảng tinh chỉnh ánh sáng và tương phản"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-80 p-5 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-xl space-y-4"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400" /> Tinh chỉnh hiển thị
            </h4>
            <button
              onClick={() => {
                setBrightness(100);
                setContrast(100);
                setIsInverted(false);
              }}
              className="text-[11px] text-indigo-400 hover:underline cursor-pointer"
            >
              Mặc định
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-amber-400" /> Độ sáng
              </span>
              <span className="font-mono">{brightness}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="200"
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <Contrast className="w-3.5 h-3.5 text-emerald-400" /> Độ tương phản
              </span>
              <span className="font-mono">{contrast}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="250"
              value={contrast}
              onChange={(e) => setContrast(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Tối ưu độ nét 2K (Bút chì / Mực)
            </span>
            <button
              onClick={() => setSharpnessBoost(!sharpnessBoost)}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                sharpnessBoost ? 'bg-amber-500' : 'bg-slate-700'
              }`}
              title="Tăng cường tương phản và độ nét chữ viết học sinh"
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5 ${
                  sharpnessBoost ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-300 flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5 text-sky-400" /> Chế độ bảng đen (Đảo màu)
            </span>
            <button
              onClick={() => setIsInverted(!isInverted)}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                isInverted ? 'bg-indigo-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5 ${
                  isInverted ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </aside>
      )}

      {/* Live Badge khi đang chiếu trực tiếp kèm Chuẩn 2K QHD */}
      {hasStream && !isMarkingMode && (
        <div className="fixed top-4 left-4 z-30 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-amber-400/50 backdrop-blur-md text-xs shadow-xl">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white font-bold">TRỰC TIẾP</span>
          <span className="h-3 w-px bg-slate-700" />
          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono font-bold text-[11px] border border-amber-400/30 flex items-center gap-1">
            💎 {streamQualityLabel || (streamResolution ? `${streamResolution.width}×${streamResolution.height}` : '2K QHD (2560×1440)')}
          </span>
        </div>
      )}

      {/* Nút Nhận xét bằng AI nổi ở góc trên khi Đóng băng */}
      {isMarkingMode && (
        <div className="fixed top-4 right-16 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              if (!aiResult) {
                handleAiAnalyze();
              } else {
                setIsAiPanelOpen(true);
              }
            }}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-xl shadow-indigo-600/40 border border-indigo-400/40 active:scale-95 cursor-pointer transition-all"
            title="Nhận xét bài làm học sinh bằng AI"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>Nhận xét bằng AI</span>
          </button>
        </div>
      )}

      {/* 5. Khung chiếu nhận xét của giáo viên lên màn hình lớn (chỉ hiện các lỗi đã được giáo viên duyệt) */}
      <AIProjectorOverlay
        isOpen={isMarkingMode && showOnProjector}
        onClose={() => setShowOnProjector(false)}
        teacherFeedback={teacherFeedback}
        acceptedErrors={(aiResult?.loi || [])
          .map((item, idx) => {
            const decision = errorDecisions[idx];
            if (decision?.status === 'accepted' || decision?.status === 'edited') {
              return {
                vi_tri: decision.customViTri || item.vi_tri,
                mo_ta: decision.customMoTa || item.mo_ta,
                goi_y_sua: decision.customGoiY || item.goi_y_sua,
              };
            }
            return null;
          })
          .filter(Boolean)}
        onOpenReviewPanel={() => setIsAiPanelOpen(true)}
      />

      {/* 6. Bảng điều khiển nhận xét AI bên cạnh màn hình lớn */}
      <AIReviewPanel
        isOpen={isAiPanelOpen}
        onClose={() => setIsAiPanelOpen(false)}
        isLoading={isAiLoading}
        error={aiError}
        aiResult={aiResult}
        onAnalyze={handleAiAnalyze}
        errorDecisions={errorDecisions}
        onErrorDecisionChange={handleErrorDecisionChange}
        showOnProjector={showOnProjector}
        onToggleShowOnProjector={() => setShowOnProjector(!showOnProjector)}
        teacherFeedback={teacherFeedback}
        onTeacherFeedbackChange={setTeacherFeedback}
        isMobile={false}
      />
    </div>
  );
}
