import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Video,
  VideoOff,
  Zap,
  ZapOff,
  SwitchCamera,
  ArrowLeft,
  Grid,
  AlertCircle,
  Camera,
  Play,
  RotateCw,
  PenTool,
  Eraser,
  Trash2,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  Move,
  Compass,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  doc,
  setDoc,
  collection,
  addDoc,
  onSnapshot,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import AIReviewPanel from './AIReviewPanel.jsx';

export default function MobileScanner() {
  const { roomId } = useAuth();
  const navigate = useNavigate();

  // ==========================================
  // THAM CHIẾU QUAN TRỌNG
  // ==========================================
  const videoRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const scrollContainerRef = useRef(null); // Container chính relative bọc video và canvas
  const streamRef = useRef(null);          // MediaStream camera
  const pcRef = useRef(null);              // RTCPeerConnection
  const dataChannelRef = useRef(null);     // WebRTC DataChannel 'drawChannel'
  const dcRef = useRef(null);              // DataChannel ref alias dcRef
  const unsubsRef = useRef([]);            // Firestore listeners
  const rotationRef = useRef(0);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const lastRemotePosRef = useRef(null);

  // Tham chiếu cảm ứng đa điểm Pinch-to-Zoom & Pan
  const touchStateRef = useRef({
    isPinching: false,
    startDist: 0,
    startZoom: 1,
    startMidX: 0,
    startMidY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  });

  // ==========================================
  // TRẠNG THÁI GIAO DIỆN & CAMERA
  // ==========================================
  const [facingMode, setFacingMode] = useState('environment');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // Góc xoay camera (0, 90, 180, 270)
  const [rotation, setRotation] = useState(0);

  // Trạng thái phát trực tiếp WebRTC & Chấm bài
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Sẵn sàng soi bài');
  const [markingAction, setMarkingAction] = useState('stream'); // 'stream' | 'capture'

  // Tính năng "AI nhận xét bài làm" trên Mobile
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [errorDecisions, setErrorDecisions] = useState({});
  const [showOnProjector, setShowOnProjector] = useState(true);
  const [teacherFeedback, setTeacherFeedback] = useState('');

  // Thu phóng (Zoom) & Vị trí góc ảnh (Pan)
  const [showDrawingTools, setShowDrawingTools] = useState(true);
  const [showBottomControls, setShowBottomControls] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Tỷ lệ tịnh tiến panRatioX, panRatioY (-1 đến 1)
  const [panRatio, setPanRatio] = useState({ x: 0, y: 0 });
  const panRatioRef = useRef(panRatio);
  panRatioRef.current = panRatio;

  const [showCornerMenu, setShowCornerMenu] = useState(false);
  const isPinchingRef = useRef(false);
  const singleTouchPanRef = useRef({
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
  });

  // Công cụ vẽ: 'pen' | 'eraser' | 'pan' | 'stamp_100' | 'stamp_star' | 'stamp_smile'
  const [drawTool, setDrawTool] = useState('pen');
  const [penColor, setPenColor] = useState('#ff0000');
  const [penSize, setPenSize] = useState(4);
  const [eraserSize, setEraserSize] = useState(25);

  const drawToolRef = useRef(drawTool);
  drawToolRef.current = drawTool;
  const penColorRef = useRef(penColor);
  penColorRef.current = penColor;
  const penSizeRef = useRef(penSize);
  penSizeRef.current = penSize;
  const eraserSizeRef = useRef(eraserSize);
  eraserSizeRef.current = eraserSize;

  // Chuẩn chất lượng Camera 2K QHD (2560x1440) - Siêu sắc nét cho tài liệu học tập
  const [cameraQuality, setCameraQuality] = useState('2k'); // '2k' | '4k' | '1080p'
  const [activeResolution, setActiveResolution] = useState({
    width: 2560,
    height: 1440,
    label: '2K QHD (2560×1440)',
    fps: 30,
  });
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Tối ưu hóa SDP cho chuẩn 2K QHD: Cấp băng thông tối đa 14 Mbps (14000 kbps)
  // và thiết lập thông số x-google-min-bitrate / max-bitrate để truyền tải siêu mượt và không vỡ hạt
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

  // Danh sách ràng buộc cấu hình ống kính máy ảnh theo thứ tự ưu tiên
  const getCameraConstraintCandidates = useCallback((mode, quality = '2k') => {
    const isEnv = mode !== 'user';
    const facingConstraint = isEnv ? { ideal: 'environment' } : 'user';

    if (quality === '4k') {
      return [
        {
          audio: false,
          video: {
            facingMode: facingConstraint,
            width: { ideal: 3840, min: 2560 },
            height: { ideal: 2160, min: 1440 },
            frameRate: { ideal: 30, min: 20 },
          },
        },
        {
          audio: false,
          video: {
            facingMode: facingConstraint,
            width: { ideal: 2160, min: 1440 },
            height: { ideal: 3840, min: 2560 },
            frameRate: { ideal: 30, min: 20 },
          },
        },
      ];
    }

    if (quality === '1080p') {
      return [
        {
          audio: false,
          video: {
            facingMode: facingConstraint,
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            frameRate: { ideal: 30 },
          },
        },
        {
          audio: false,
          video: {
            facingMode: facingConstraint,
            width: { ideal: 1080 },
            height: { ideal: 1920 },
          },
        },
      ];
    }

    // Mặc định: Chuẩn 2K QHD (2560x1440)
    return [
      // 1. Chuẩn 2K QHD tỉ lệ 16:9 ngang (2560x1440)
      {
        audio: false,
        video: {
          facingMode: facingConstraint,
          width: { ideal: 2560, min: 1920 },
          height: { ideal: 1440, min: 1080 },
          aspectRatio: { ideal: 16 / 9 },
          frameRate: { ideal: 30, min: 24 },
        },
      },
      // 2. Chuẩn 2K QHD cảm biến dọc trên smartphone (1440x2560)
      {
        audio: false,
        video: {
          facingMode: facingConstraint,
          width: { ideal: 1440, min: 1080 },
          height: { ideal: 2560, min: 1920 },
          aspectRatio: { ideal: 9 / 16 },
          frameRate: { ideal: 30, min: 24 },
        },
      },
      // 3. Chuẩn 2K linh hoạt theo cảm biến tối đa của thiết bị
      {
        audio: false,
        video: {
          facingMode: facingConstraint,
          width: { min: 1920, ideal: 2560, max: 3840 },
          height: { min: 1080, ideal: 1440, max: 2160 },
        },
      },
      // 4. Fallback Full HD 1080p
      {
        audio: false,
        video: {
          facingMode: facingConstraint,
          width: { ideal: 1920, max: 2560 },
          height: { ideal: 1080, max: 1440 },
        },
      },
      // 5. Fallback cơ bản nhất
      {
        audio: false,
        video: {
          facingMode: facingConstraint,
        },
      },
    ];
  }, []);

  // ==========================================
  // 1. ÉP CHẠY VIDEO BẰNG JAVASCRIPT (BẮT BUỘC CHO SAFARI IOS)
  // ==========================================
  const attachAndPlayVideo = useCallback(() => {
    if (videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      // Ép iOS Safari phải play video
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.error("Lỗi play video Safari:", err);
        });
      }
    }
  }, []);

  // ==========================================
  // 2. KHỞI ĐỘNG CAMERA CHUẨN 2K & GỌI attachAndPlayVideo NGAY KHI CÓ STREAM
  // ==========================================
  const startCamera = async (mode, quality = cameraQuality) => {
    try {
      setCameraError(null);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const candidateConstraints = getCameraConstraintCandidates(mode, quality);
      let newStream = null;

      for (const constraints of candidateConstraints) {
        try {
          newStream = await navigator.mediaDevices.getUserMedia(constraints);
          if (newStream) break;
        } catch (err) {
          // Thử tiếp phương án độ phân giải kế tiếp
        }
      }

      if (!newStream) {
        newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: mode === 'user' ? 'user' : 'environment' },
        });
      }

      // Kích hoạt lấy nét liên tục và cân bằng sáng cho tài liệu
      const videoTrack = newStream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
          const advanced = [];
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            advanced.push({ focusMode: 'continuous' });
          }
          if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
            advanced.push({ exposureMode: 'continuous' });
          }
          if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.includes('continuous')) {
            advanced.push({ whiteBalanceMode: 'continuous' });
          }
          if (advanced.length > 0 && videoTrack.applyConstraints) {
            await videoTrack.applyConstraints({ advanced });
          }
          setTorchSupported(Boolean(capabilities?.torch));
          setTorchOn(false);
        } catch (advErr) {
          console.warn('[Camera 2K] Không thể áp dụng advanced constraints:', advErr);
        }

        // Đo đạc độ phân giải thực tế của ống kính camera
        const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
        const realW = settings.width || 2560;
        const realH = settings.height || 1440;
        const maxDim = Math.max(realW, realH);
        let qualityLabel = '2K QHD (2560×1440)';
        if (maxDim >= 3840) qualityLabel = '4K UHD (3840×2160)';
        else if (maxDim >= 2560) qualityLabel = '2K QHD (2560×1440)';
        else if (maxDim >= 1920) qualityLabel = 'Full HD+ (1080p)';
        else qualityLabel = `${realW}×${realH}`;

        const resInfo = {
          width: realW,
          height: realH,
          label: qualityLabel,
          fps: Math.round(settings.frameRate || 30),
        };
        setActiveResolution(resInfo);

        // Đồng bộ thông tin độ phân giải lên Firestore
        if (roomId) {
          setDoc(
            doc(db, 'rooms', roomId),
            {
              resolution: resInfo,
              cameraQuality: quality,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          ).catch((e) => console.warn('Lỗi sync resolution lên Firestore:', e));
        }

        // Gửi thông báo độ phân giải qua DataChannel nếu đã kết nối
        if (dcRef.current && dcRef.current.readyState === 'open') {
          try {
            dcRef.current.send(JSON.stringify({
              type: 'resolution_info',
              resolution: resInfo,
            }));
          } catch (e) {}
        }
      }

      // Lưu luồng Stream mới nhất
      streamRef.current = newStream;

      // Ép play video ngay sau khi có stream
      attachAndPlayVideo();

      // Nếu đang trong phiên phát trực tiếp WebRTC, thay track mới và duy trì độ nét 2K
      if (pcRef.current && isStreaming) {
        const senders = pcRef.current.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        const newTrack = newStream.getVideoTracks()[0];
        if (videoSender && newTrack) {
          await videoSender.replaceTrack(newTrack);
          try {
            const params = videoSender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = 14000000;
            params.encodings[0].minBitrate = 4000000;
            params.encodings[0].maxFramerate = 30;
            params.encodings[0].degradationPreference = 'maintain-resolution';
            await videoSender.setParameters(params);
          } catch (e) {
            console.warn('Lỗi đặt videoSender parameters:', e);
          }
        }
      }
    } catch (err) {
      console.error('Không thể mở camera:', err);
      setCameraError('Không thể truy cập camera. Vui lòng cấp quyền camera trong cài đặt trình duyệt.');
    }
  };

  useEffect(() => {
    startCamera(facingMode, cameraQuality);

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [facingMode, cameraQuality]);

  // ==========================================
  // GỌI attachAndPlayVideo Ở MỌI NƠI THAY ĐỔI TRẠNG THÁI
  // ==========================================
  useEffect(() => {
    if (markingAction === 'stream') {
      attachAndPlayVideo();
    }
  }, [markingAction, isStreaming, rotation, attachAndPlayVideo]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const toggleTorch = async () => {
    if (!streamRef.current || !torchSupported) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      try {
        const nextTorch = !torchOn;
        await videoTrack.applyConstraints({
          advanced: [{ torch: nextTorch }],
        });
        setTorchOn(nextTorch);
      } catch (err) {
        console.warn('Lỗi bật/tắt đèn pin:', err);
      }
    }
  };

  // ==========================================
  // 3. XOAY GÓC CAMERA (0 -> 90 -> 180 -> 270)
  // ==========================================
  const handleRotate = async () => {
    const nextRotation = (rotation + 90) % 360;
    rotationRef.current = nextRotation;
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
      } catch (err) {
        console.warn('Lỗi đồng bộ rotation lên Firestore:', err);
      }
    }
  };

  // Dọn dẹp sub-collection ICE candidates cũ trên Firestore
  const clearOldCandidates = async () => {
    if (!roomId) return;
    try {
      const callerSnap = await getDocs(collection(db, 'rooms', roomId, 'callerCandidates'));
      const calleeSnap = await getDocs(collection(db, 'rooms', roomId, 'calleeCandidates'));
      const deletes = [];
      callerSnap.forEach((d) => deletes.push(deleteDoc(d.ref)));
      calleeSnap.forEach((d) => deletes.push(deleteDoc(d.ref)));
      await Promise.all(deletes);
    } catch (e) {
      console.warn('Lỗi dọn dẹp candidates:', e);
    }
  };

  // ==========================================
  // 4. GỬI DỮ LIỆU QUA WEBRTC DATA CHANNEL
  // ==========================================
  const sendDrawData = useCallback((payload) => {
    const dc = dcRef.current || dataChannelRef.current;
    if (dc && dc.readyState === 'open') {
      try {
        const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
        dc.send(msg);
      } catch (err) {
        console.warn('[Mobile DataChannel] Lỗi gửi draw data:', err);
      }
    }
  }, []);

  // Đồng bộ góc nhìn (Zoom & Tỷ lệ pan góc) sang máy tính qua DataChannel
  const syncViewToPC = useCallback((currentZoom, currentPanRatio) => {
    const z = currentZoom !== undefined ? currentZoom : (zoomRef.current || 1);
    const p = currentPanRatio !== undefined ? currentPanRatio : (panRatioRef.current || { x: 0, y: 0 });

    const payload = {
      type: 'sync_view',
      zoom: z,
      panRatioX: p.x,
      panRatioY: p.y,
      scrollX: (p.x + 1) / 2,
      scrollY: (p.y + 1) / 2,
    };
    sendDrawData(payload);
  }, [sendDrawData]);

  // ==========================================
  // 5. CHẾ ĐỘ 'CAPTURE' & 'STREAM' TRÊN MOBILE (CHUẨN 2K QHD SIÊU SẮC NÉT)
  // Lấy khung hình 2K độ phân giải cao nhất từ videoRef hoặc ImageCapture vẽ lên bgCanvas
  // ==========================================
  const captureCurrentFrameMobile = useCallback(async () => {
    const video = videoRef.current;
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!video || !bgCanvas || !drawCanvas) return;

    // Kích thước chuẩn 2K QHD hoặc kích thước thực của luồng video
    const videoW = video.videoWidth || activeResolution.width || 2560;
    const videoH = video.videoHeight || activeResolution.height || 1440;

    setCanvasSize({ w: videoW, h: videoH });
    setShowDrawingTools(true);
    setShowBottomControls(true);

    bgCanvas.width = videoW;
    bgCanvas.height = videoH;
    drawCanvas.width = videoW;
    drawCanvas.height = videoH;

    const bgCtx = bgCanvas.getContext('2d');
    if (bgCtx) {
      bgCtx.clearRect(0, 0, videoW, videoH);
      bgCtx.imageSmoothingEnabled = true;
      bgCtx.imageSmoothingQuality = 'high';

      let capturedViaImageCapture = false;
      // Thử dùng API ImageCapture để lấy ảnh gốc độ phân giải cao nhất từ cảm biến camera
      const videoTrack = streamRef.current?.getVideoTracks()?.[0];
      if (typeof window !== 'undefined' && 'ImageCapture' in window && videoTrack) {
        try {
          const ImageCapConstructor = window.ImageCapture;
          const imageCapture = new ImageCapConstructor(videoTrack);
          // grabFrame() lấy khung hình không nén trực tiếp từ luồng
          const imageBitmap = await imageCapture.grabFrame();
          if (imageBitmap) {
            bgCanvas.width = imageBitmap.width;
            bgCanvas.height = imageBitmap.height;
            drawCanvas.width = imageBitmap.width;
            drawCanvas.height = imageBitmap.height;
            setCanvasSize({ w: imageBitmap.width, h: imageBitmap.height });
            bgCtx.drawImage(imageBitmap, 0, 0);
            capturedViaImageCapture = true;
            console.log(`[Mobile Capture 2K] Đã chụp ảnh gốc siêu nét qua ImageCapture: ${imageBitmap.width}x${imageBitmap.height}`);
          }
        } catch (icErr) {
          console.warn('[Mobile Capture] ImageCapture fallback sang drawImage:', icErr);
        }
      }

      if (!capturedViaImageCapture) {
        try {
          bgCtx.drawImage(video, 0, 0, bgCanvas.width, bgCanvas.height);
          console.log(`[Mobile Capture 2K] Đã chụp khung hình video 2K vào bgCanvas: ${bgCanvas.width}x${bgCanvas.height}`);
        } catch (err) {
          console.error('[Mobile Capture] Lỗi drawImage:', err);
        }
      }
    }

    const drawCtx = drawCanvas.getContext('2d');
    if (drawCtx) {
      drawCtx.clearRect(0, 0, videoW, videoH);
    }

    setMarkingAction('capture');
    setStatusMessage('Bảng vẽ 2K QHD sẵn sàng! Phóng to và di chuyển góc để chấm bài.');
  }, [activeResolution]);

  const resumeStreamingMobile = useCallback(() => {
    setMarkingAction('stream');
    setIsAiPanelOpen(false);
    setShowOnProjector(false);
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
    // Ép Safari phát lại video
    attachAndPlayVideo();
    setStatusMessage('Đang phát trực tiếp lên máy tính!');
  }, [attachAndPlayVideo]);

  // Chụp khung hình đang đóng băng trên Mobile (chưa kèm nét vẽ)
  const captureFrozenFrameForAiMobile = useCallback(() => {
    const bgCanvas = bgCanvasRef.current;
    if (bgCanvas && bgCanvas.width > 0 && bgCanvas.height > 0) {
      // bgCanvas chứa đúng ảnh camera đóng băng, không có nét vẽ của giáo viên
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

  // Gửi ảnh tới Gemini phân tích từ Mobile
  const handleAiAnalyzeMobile = useCallback(async () => {
    setIsAiLoading(true);
    setAiError(null);
    setIsAiPanelOpen(true);
    try {
      const imageBase64 = captureFrozenFrameForAiMobile();
      if (!imageBase64) {
        throw new Error('Chưa có ảnh bài làm để phân tích. Hãy đóng băng camera trước.');
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

      // Đồng bộ sang máy tính qua WebRTC DataChannel
      const channel = dataChannelRef.current || dcRef.current;
      if (channel && channel.readyState === 'open') {
        try {
          channel.send(
            JSON.stringify({
              type: 'ai_review_sync',
              aiResult: data.data,
              errorDecisions: initDecisions,
              teacherFeedback: initFeedback,
              showOnProjector: true,
            })
          );
        } catch (e) {
          console.warn('Lỗi đồng bộ ai_review_sync sang PC:', e);
        }
      }
    } catch (err) {
      console.error('[AI Review Mobile] Lỗi:', err);
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
  }, [captureFrozenFrameForAiMobile]);

  // Xử lý thay đổi quyết định duyệt lỗi trên Mobile
  const handleErrorDecisionChangeMobile = useCallback((idx, decisionUpdate) => {
    setErrorDecisions((prev) => {
      const next = {
        ...prev,
        [idx]: {
          ...(prev[idx] || {}),
          ...decisionUpdate,
        },
      };
      const channel = dataChannelRef.current || dcRef.current;
      if (channel && channel.readyState === 'open') {
        try {
          channel.send(
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
  // 6. KHỞI TẠO WEBRTC VÀ DATA CHANNEL
  // ==========================================
  const handleStartStreaming = async () => {
    if (!roomId) return;

    // Đảm bảo luồng camera luôn sẵn sàng trước khi kết nối
    if (!streamRef.current || !streamRef.current.active) {
      await startCamera(facingMode);
    }

    if (!streamRef.current) {
      setStatusMessage('Chưa khởi động được camera. Vui lòng cấp quyền.');
      return;
    }

    try {
      setStatusMessage('Đang kết nối WebRTC tới máy tính...');
      setIsStreaming(true);

      unsubsRef.current.forEach((unsub) => unsub());
      unsubsRef.current = [];
      await clearOldCandidates();

      if (dataChannelRef.current) {
        dataChannelRef.current.close();
        dataChannelRef.current = null;
      }

      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
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

      // Khởi tạo dataChannel ngay khi tạo RTCPeerConnection, trước khi createOffer
      const dataChannel = pc.createDataChannel('drawChannel', {
        ordered: true,
      });
      dataChannelRef.current = dataChannel;
      dcRef.current = dataChannel;

      dataChannel.onopen = () => {
        console.log('[Mobile DataChannel] drawChannel đã MỞ (connected)!');
        setStatusMessage('Đã kết nối luồng 2K QHD & Kênh vẽ thời gian thực!');
        try {
          dataChannel.send(JSON.stringify({
            type: 'resolution_info',
            resolution: activeResolution,
          }));
        } catch (e) {}
      };
      dataChannel.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

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

          if (data.type === 'clear') {
            const drawCanvas = drawCanvasRef.current;
            if (drawCanvas) {
              const ctx = drawCanvas.getContext('2d');
              if (ctx) ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
            }
            return;
          }
          const drawCanvas = drawCanvasRef.current;
          if (!drawCanvas) return;
          const ctx = drawCanvas.getContext('2d');
          if (!ctx) return;

          const canvasWidth = drawCanvas.width || 1920;
          const canvasHeight = drawCanvas.height || 1080;
          const pcX = (data.x || 0) * canvasWidth;
          const pcY = (data.y || 0) * canvasHeight;

          // Tính nét vẽ tỷ lệ chuẩn hóa tương thích giữa PC và Điện thoại
          let strokeSize;
          if (data.normSize !== undefined && Number(data.normSize) > 0) {
            strokeSize = Number(data.normSize) * canvasWidth;
          } else {
            const rawSize = Number(data.size) || 4;
            strokeSize = Math.max(1, (rawSize / 1920) * canvasWidth);
          }

          if (data.type === 'stamp') {
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
            return;
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
          } else if (data.type === 'draw' || data.type === 'eraser') {
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
            const prevX = lastRemotePosRef.current?.x ?? pcX;
            const prevY = lastRemotePosRef.current?.y ?? pcY;
            ctx.moveTo(prevX, prevY);
            ctx.lineTo(pcX, pcY);
            ctx.stroke();
            ctx.restore();
            lastRemotePosRef.current = { x: pcX, y: pcY };
          } else if (data.type === 'end') {
            lastRemotePosRef.current = null;
          }
        } catch (err) {
          console.warn('[Mobile] Lỗi nhận nét vẽ từ PC:', err);
        }
      };
      dataChannel.onclose = () => {
        console.log('[Mobile DataChannel] drawChannel đã ĐÓNG');
      };
      dataChannel.onerror = (err) => {
        console.error('[Mobile DataChannel] Lỗi drawChannel:', err);
      };

      const pendingCalleeCandidates = [];
      let isRemoteAnswerSet = false;

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setStatusMessage('Đang phát trực tiếp lên máy tính!');
        } else if (pc.iceConnectionState === 'failed') {
          setStatusMessage('Kết nối WebRTC thất bại.');
        } else if (pc.iceConnectionState === 'disconnected') {
          setStatusMessage('Mất kết nối tạm thời.');
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setStatusMessage('Đang phát trực tiếp lên máy tính!');
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setStatusMessage('Mất kết nối WebRTC. Thử phát lại.');
        }
      };

      // 2. Nạp Video vào đường truyền (MobileScanner.jsx):
      // TRƯỚC KHI gọi pc.createOffer(), bắt buộc phải nạp luồng video vào:
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, streamRef.current);
        });
      }

      // Cấu hình RTCRtpSender cho luồng 2K QHD (Bitrate 14 Mbps, Maintain Resolution)
      const senders = pc.getSenders();
      const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
      if (videoSender) {
        try {
          const params = videoSender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = 14000000; // 14 Mbps
          params.encodings[0].minBitrate = 4000000;  // 4 Mbps
          params.encodings[0].maxFramerate = 30;
          params.encodings[0].networkPriority = 'high';
          // BẢO ĐẢM ĐỘ PHÂN GIẢI 2K KHÔNG BỊ HẠ CẤP BỞI THUẬT TOÁN WEBRTC
          params.degradationPreference = 'maintain-resolution';
          await videoSender.setParameters(params);
        } catch (paramErr) {
          console.warn('[Mobile WebRTC 2K] Lỗi đặt thông số videoSender:', paramErr);
        }
      }

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          try {
            const callerCandidateCol = collection(db, 'rooms', roomId, 'callerCandidates');
            await addDoc(callerCandidateCol, event.candidate.toJSON());
          } catch (err) {
            console.error('[Mobile WebRTC] Lỗi lưu caller ICE candidate:', err);
          }
        }
      };

      const offer = await pc.createOffer();
      // Áp dụng tối ưu hóa SDP 2K QHD 14 Mbps
      const optimizedOffer = {
        type: offer.type,
        sdp: optimizeSdpFor2K(offer.sdp),
      };
      await pc.setLocalDescription(optimizedOffer);

      const roomRef = doc(db, 'rooms', roomId);
      await setDoc(
        roomRef,
        {
          mode: 'video',
          action: 'stream',
          rotation: rotationRef.current,
          resolution: activeResolution,
          cameraQuality,
          timestamp: Date.now(),
          offer: {
            type: optimizedOffer.type,
            sdp: optimizedOffer.sdp,
          },
          answer: null,
          ownerUid: roomId,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setMarkingAction('stream');

      let lastActionTimestamp = 0;
      const roomUnsub = onSnapshot(
        roomRef,
        async (snapshot) => {
          const data = snapshot.data();
          if (!data) return;

          if (data.answer && !isRemoteAnswerSet && pc.signalingState === 'have-local-offer') {
            try {
              const answerDesc = new RTCSessionDescription(data.answer);
              await pc.setRemoteDescription(answerDesc);
              isRemoteAnswerSet = true;

              while (pendingCalleeCandidates.length > 0) {
                const queuedCand = pendingCalleeCandidates.shift();
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(queuedCand));
                } catch (candErr) {
                  console.error('[Mobile WebRTC] Lỗi nạp queued callee candidate:', candErr);
                }
              }
            } catch (err) {
              console.error('[Mobile WebRTC] Lỗi khi setRemoteDescription answer:', err);
            }
          }

          if (data.action && data.timestamp && data.timestamp !== lastActionTimestamp) {
            lastActionTimestamp = data.timestamp;
            if (data.action === 'capture') {
              captureCurrentFrameMobile();
            } else if (data.action === 'stream') {
              resumeStreamingMobile();
            }
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
        }
      );
      unsubsRef.current.push(roomUnsub);

      const calleeCandidatesCol = collection(db, 'rooms', roomId, 'calleeCandidates');
      const calleeUnsub = onSnapshot(
        calleeCandidatesCol,
        (snapshot) => {
          snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
              try {
                const data = change.doc.data();
                if (data?.candidate) {
                  if (!isRemoteAnswerSet || !pc.remoteDescription) {
                    pendingCalleeCandidates.push(data);
                  } else {
                    await pc.addIceCandidate(new RTCIceCandidate(data));
                  }
                }
              } catch (err) {
                console.error('[Mobile WebRTC] Lỗi nạp callee candidate:', err);
              }
            }
          });
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, `rooms/${roomId}/calleeCandidates`);
        }
      );
      unsubsRef.current.push(calleeUnsub);
    } catch (err) {
      console.error('[Mobile WebRTC] Lỗi khởi tạo phát video:', err);
      setIsStreaming(false);
      setStatusMessage('Không thể phát video. Vui lòng thử lại.');
    }
  };

  const startStreaming = handleStartStreaming;

  const stopLivestream = async () => {
    setIsStreaming(false);
    resumeStreamingMobile();
    setStatusMessage('Đã dừng phát video.');

    unsubsRef.current.forEach((unsub) => unsub());
    unsubsRef.current = [];

    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }

    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (roomId) {
      try {
        const roomRef = doc(db, 'rooms', roomId);
        await setDoc(
          roomRef,
          {
            mode: 'idle',
            action: 'stream',
            timestamp: Date.now(),
            offer: null,
            answer: null,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Lỗi đặt lại trạng thái phòng:', err);
      }
    }
  };

  // ==========================================
  // 7. THAO TÁC 'CHỤP ĐỂ CHẤM' & 'TIẾP TỤC SOI'
  // ==========================================
  const handleCaptureForGrading = async () => {
    if (!roomId) return;
    try {
      captureCurrentFrameMobile();
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
    } catch (err) {
      console.error('Lỗi khi gửi lệnh chụp để chấm:', err);
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  const handleResumeStreaming = async () => {
    if (!roomId) return;
    try {
      resumeStreamingMobile();
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
    } catch (err) {
      console.error('Lỗi khi tiếp tục soi bài:', err);
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  // ==========================================
  // 8. TÍNH TOÁN TỌA ĐỘ VẼ CHUẨN XÁC
  // Bù trừ ma trận xoay CSS rotation (0, 90, 180, 270), zoom và tịnh tiến pan góc
  // ==========================================
  const getCanvasCoords = (clientX, clientY) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0, normX: 0, normY: 0, renderedW: 1, cWidth: 1 };
    const rect = canvas.getBoundingClientRect();

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
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

    // 1. Khử pan và zoom
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

    const boxW = vw;
    const boxH = vh;
    const cWidth = canvas.width || 1920;
    const cHeight = canvas.height || 1080;

    // objectFit: cover trên mobile
    const scale = Math.max(boxW / cWidth, boxH / cHeight);
    const renderedW = cWidth * (scale || 1);
    const renderedH = cHeight * (scale || 1);

    const normX = Math.max(0, Math.min(1, unrotX / (renderedW || 1) + 0.5));
    const normY = Math.max(0, Math.min(1, unrotY / (renderedH || 1) + 0.5));

    const x = normX * cWidth;
    const y = normY * cHeight;

    return { x, y, normX, normY, renderedW, renderedH, cWidth, cHeight };
  };

  const startDrawing = (clientX, clientY) => {
    if (!isStreaming) return;
    if (drawToolRef.current === 'pan') return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const { x, y, normX, normY, renderedW, cWidth } = getCanvasCoords(clientX, clientY);
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

      sendDrawData({
        type: 'stamp',
        x: normX,
        y: normY,
        color: penColorRef.current,
        size: stampBaseSize,
        normSize: stampBaseSize / (renderedW || cWidth),
        emoji,
        tool: drawToolRef.current,
      });

      isDrawingRef.current = false;
      return;
    }

    const currentSize = drawToolRef.current === 'eraser' 
      ? (eraserSizeRef.current || Math.max(12, penSizeRef.current * 3)) 
      : penSizeRef.current;

    // Chuyển đổi từ CSS pixel mà người dùng chọn sang pixel canvas buffer thật
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

    sendDrawData({
      type: drawToolRef.current === 'eraser' ? 'eraser' : 'start',
      x: normX,
      y: normY,
      color: penColorRef.current,
      size: currentSize,
      normSize: currentSize / (renderedW || cWidth),
      tool: drawToolRef.current,
    });
  };

  const continueDrawing = (clientX, clientY) => {
    if (!isStreaming || !isDrawingRef.current) return;
    if (drawToolRef.current === 'pan') return;
    if (drawToolRef.current.startsWith('stamp_')) return;

    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y, normX, normY, renderedW, cWidth } = getCanvasCoords(clientX, clientY);
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

    sendDrawData({
      type: drawToolRef.current === 'eraser' ? 'eraser' : 'draw',
      x: normX,
      y: normY,
      color: penColorRef.current,
      size: currentSize,
      normSize: currentSize / (renderedW || cWidth),
      tool: drawToolRef.current,
    });

    lastPosRef.current = { x, y };
  };

  const endDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    sendDrawData({ type: 'end', x: 0, y: 0, color: '', size: 0 });
  };

  const handleClearDrawingsMobile = () => {
    const canvas = drawCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    sendDrawData({
      type: 'clear',
      x: 0,
      y: 0,
      color: '',
      size: 0,
    });
  };

  // Thiết lập góc phóng to nhanh
  const setCornerPreset = (corner) => {
    let targetZoom = 2.5;
    let targetPan = { x: 0, y: 0 };

    switch (corner) {
      case 'top-left':
        targetPan = { x: 1, y: 1 };
        break;
      case 'top-right':
        targetPan = { x: -1, y: 1 };
        break;
      case 'center':
        targetZoom = 2;
        targetPan = { x: 0, y: 0 };
        break;
      case 'bottom-left':
        targetPan = { x: 1, y: -1 };
        break;
      case 'bottom-right':
        targetPan = { x: -1, y: -1 };
        break;
      case 'reset':
      default:
        targetZoom = 1;
        targetPan = { x: 0, y: 0 };
        break;
    }

    zoomRef.current = targetZoom;
    setZoom(targetZoom);
    panRatioRef.current = targetPan;
    setPanRatio(targetPan);
    syncViewToPC(targetZoom, targetPan);
    setShowCornerMenu(false);
  };

  // ==========================================
  // 9. CẢM ỨNG ĐA ĐIỂM (PINCH-TO-ZOOM & PAN GÓC)
  // ==========================================
  const handleTouchStart = (e) => {
    e.preventDefault();

    if (e.touches.length === 2) {
      isDrawingRef.current = false;
      isPinchingRef.current = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      touchStateRef.current = {
        isPinching: true,
        startDist: dist,
        startZoom: zoomRef.current,
        startMidX: midX,
        startMidY: midY,
        startPanRatioX: panRatioRef.current.x,
        startPanRatioY: panRatioRef.current.y,
      };
      return;
    }

    if (e.touches.length === 1) {
      if (drawToolRef.current === 'pan') {
        isDrawingRef.current = false;
        singleTouchPanRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          startPanX: panRatioRef.current.x,
          startPanY: panRatioRef.current.y,
        };
        return;
      }

      if (!touchStateRef.current.isPinching) {
        startDrawing(e.touches[0].clientX, e.touches[0].clientY);
      }
    }
  };

  const handleTouchMove = (e) => {
    e.preventDefault();

    if (e.touches.length === 2) {
      isDrawingRef.current = false;
      isPinchingRef.current = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      const { startDist, startZoom, startMidX, startMidY, startPanRatioX, startPanRatioY } = touchStateRef.current;
      if (startDist > 0) {
        const factor = dist / startDist;
        const nextZoom = Math.max(1, Math.min(4, Math.round(startZoom * factor * 10) / 10));

        const deltaX = midX - startMidX;
        const deltaY = midY - startMidY;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const maxPanX = Math.max(1, (vw * (nextZoom - 1)) / 2);
        const maxPanY = Math.max(1, (vh * (nextZoom - 1)) / 2);

        let nextPanRatioX = 0;
        let nextPanRatioY = 0;

        if (nextZoom > 1) {
          nextPanRatioX = Math.max(-1, Math.min(1, startPanRatioX + deltaX / maxPanX));
          nextPanRatioY = Math.max(-1, Math.min(1, startPanRatioY + deltaY / maxPanY));
        }

        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        panRatioRef.current = { x: nextPanRatioX, y: nextPanRatioY };
        setPanRatio({ x: nextPanRatioX, y: nextPanRatioY });

        syncViewToPC(nextZoom, { x: nextPanRatioX, y: nextPanRatioY });
      }
      return;
    }

    if (e.touches.length === 1) {
      if (drawToolRef.current === 'pan') {
        const deltaX = e.touches[0].clientX - singleTouchPanRef.current.startX;
        const deltaY = e.touches[0].clientY - singleTouchPanRef.current.startY;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const currentZ = zoomRef.current || 1;
        const maxPanX = Math.max(1, (vw * (currentZ - 1)) / 2);
        const maxPanY = Math.max(1, (vh * (currentZ - 1)) / 2);

        const nextPanRatioX = Math.max(-1, Math.min(1, singleTouchPanRef.current.startPanX + deltaX / maxPanX));
        const nextPanRatioY = Math.max(-1, Math.min(1, singleTouchPanRef.current.startPanY + deltaY / maxPanY));

        panRatioRef.current = { x: nextPanRatioX, y: nextPanRatioY };
        setPanRatio({ x: nextPanRatioX, y: nextPanRatioY });
        syncViewToPC(currentZ, { x: nextPanRatioX, y: nextPanRatioY });
        return;
      }

      if (!touchStateRef.current.isPinching) {
        continueDrawing(e.touches[0].clientX, e.touches[0].clientY);
      }
    }
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();

    if (e.touches.length < 2) {
      touchStateRef.current.isPinching = false;
      setTimeout(() => {
        isPinchingRef.current = false;
      }, 100);
    }

    if (e.touches.length === 0) {
      endDrawing();
    }
  };

  const handleMouseDown = (e) => {
    if (drawToolRef.current === 'pan') {
      singleTouchPanRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPanX: panRatioRef.current.x,
        startPanY: panRatioRef.current.y,
      };
      isDrawingRef.current = true;
      return;
    }
    startDrawing(e.clientX, e.clientY);
  };

  const handleMouseMove = (e) => {
    if (drawToolRef.current === 'pan' && isDrawingRef.current) {
      const deltaX = e.clientX - singleTouchPanRef.current.startX;
      const deltaY = e.clientY - singleTouchPanRef.current.startY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const currentZ = zoomRef.current || 1;
      const maxPanX = Math.max(1, (vw * (currentZ - 1)) / 2);
      const maxPanY = Math.max(1, (vh * (currentZ - 1)) / 2);

      const nextPanRatioX = Math.max(-1, Math.min(1, singleTouchPanRef.current.startPanX + deltaX / maxPanX));
      const nextPanRatioY = Math.max(-1, Math.min(1, singleTouchPanRef.current.startPanY + deltaY / maxPanY));

      panRatioRef.current = { x: nextPanRatioX, y: nextPanRatioY };
      setPanRatio({ x: nextPanRatioX, y: nextPanRatioY });
      syncViewToPC(currentZ, { x: nextPanRatioX, y: nextPanRatioY });
      return;
    }
    continueDrawing(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    if (drawToolRef.current === 'pan') {
      isDrawingRef.current = false;
      return;
    }
    endDrawing();
  };

  const handleContainerScroll = () => {
    syncViewToPC(zoomRef.current);
  };

  // Unmount cleanup
  useEffect(() => {
    return () => {
      unsubsRef.current.forEach((unsub) => unsub());
      unsubsRef.current = [];

      if (dcRef.current) {
        dcRef.current.close();
        dcRef.current = null;
      }

      if (dataChannelRef.current) {
        dataChannelRef.current.close();
        dataChannelRef.current = null;
      }

      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 844;
  const maxPanX = Math.max(0, (vw * (zoom - 1)) / 2);
  const maxPanY = Math.max(0, (vh * (zoom - 1)) / 2);
  const panOffset = {
    x: (panRatio?.x || 0) * maxPanX,
    y: (panRatio?.y || 0) * maxPanY,
  };

  return (
    <div className="fixed inset-0 bg-black text-white select-none overflow-hidden">
      {/* Top Header Controls */}
      <header className="fixed top-0 left-0 right-0 z-30 p-2.5 sm:p-4 flex items-center justify-between bg-gradient-to-b from-black/90 via-black/50 to-transparent">
        <button
          type="button"
          onClick={() => {
            if (isStreaming) stopLivestream();
            navigate('/');
          }}
          className="p-2 sm:p-2.5 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-white/20 transition-colors cursor-pointer"
          title="Quay lại Menu"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Nút chất lượng ống kính 2K QHD (2560x1440) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowQualityMenu(!showQualityMenu)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-slate-900/90 border border-amber-400/50 text-amber-300 shadow-xl backdrop-blur-md active:scale-95 transition-all text-xs font-bold cursor-pointer"
            title="Tùy chỉnh độ phân giải camera (2K QHD / 4K UHD / 1080p)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>{cameraQuality === '4k' ? '4K UHD' : cameraQuality === '1080p' ? '1080p FHD' : '2K QHD'}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </button>

          {showQualityMenu && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-amber-500/40 rounded-2xl p-2.5 shadow-2xl z-50 flex flex-col gap-1.5 w-60 backdrop-blur-xl">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center pb-1 border-b border-slate-800">
                CHẤT LƯỢNG ỐNG KÍNH CAMERA
              </div>
              
              <button
                type="button"
                onClick={() => {
                  setCameraQuality('2k');
                  setShowQualityMenu(false);
                  startCamera(facingMode, '2k');
                }}
                className={`p-2 rounded-xl text-left transition-all cursor-pointer flex flex-col ${
                  cameraQuality === '2k'
                    ? 'bg-amber-500/20 border border-amber-400/50 text-amber-200'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>💎 2K QHD (2560×1440)</span>
                  {cameraQuality === '2k' && <span className="text-[10px] text-amber-400 font-bold">Đang chọn</span>}
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  Chuẩn tối ưu soi nét từng chữ viết bút mực & bút chì
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCameraQuality('4k');
                  setShowQualityMenu(false);
                  startCamera(facingMode, '4k');
                }}
                className={`p-2 rounded-xl text-left transition-all cursor-pointer flex flex-col ${
                  cameraQuality === '4k'
                    ? 'bg-indigo-500/20 border border-indigo-400/50 text-indigo-200'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>🚀 4K UHD (3840×2160)</span>
                  {cameraQuality === '4k' && <span className="text-[10px] text-indigo-400 font-bold">Đang chọn</span>}
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  Cực nét cho dòng điện thoại cao cấp có camera 4K
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCameraQuality('1080p');
                  setShowQualityMenu(false);
                  startCamera(facingMode, '1080p');
                }}
                className={`p-2 rounded-xl text-left transition-all cursor-pointer flex flex-col ${
                  cameraQuality === '1080p'
                    ? 'bg-sky-500/20 border border-sky-400/50 text-sky-200'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>⚡ Full HD (1920×1080)</span>
                  {cameraQuality === '1080p' && <span className="text-[10px] text-sky-400 font-bold">Đang chọn</span>}
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  Tiết kiệm pin và băng thông mạng khi mạng yếu
                </span>
              </button>

              <div className="text-[10px] text-center font-mono text-emerald-400 pt-1 border-t border-slate-800">
                Thực tế: {activeResolution.width}×{activeResolution.height} @ {activeResolution.fps || 30}fps
              </div>
            </div>
          )}
        </div>

        {markingAction === 'capture' ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/60 shadow-lg backdrop-blur-md">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-bold text-amber-300">Bảng vẽ điện tử ({zoom}x)</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleRotate}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-full bg-slate-900/85 hover:bg-slate-900 border border-sky-400/50 text-white shadow-xl backdrop-blur-md active:scale-95 transition-all text-xs font-bold cursor-pointer"
            title="Xoay camera 90° (Đồng bộ xoay luôn màn hình máy tính)"
          >
            <RotateCw className="w-4 h-4 text-sky-400" />
            <span>Xoay 90°</span>
            {rotation !== 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-sky-500/30 text-sky-300 font-bold border border-sky-400/40">
                {rotation}°
              </span>
            )}
          </button>
        )}

        <div className="flex items-center gap-2">
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 sm:p-2.5 rounded-full backdrop-blur-md transition-colors cursor-pointer ${
                torchOn ? 'bg-amber-400 text-black' : 'bg-black/60 text-white hover:bg-white/20'
              }`}
              title="Bật/Tắt Đèn Flash"
            >
              {torchOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            className={`p-2 sm:p-2.5 rounded-full backdrop-blur-md transition-colors cursor-pointer ${
              showGrid ? 'bg-indigo-600 text-white' : 'bg-black/60 text-white hover:bg-white/20'
            }`}
            title="Lưới căn chỉnh trang giấy"
          >
            <Grid className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={toggleFacingMode}
            disabled={markingAction === 'capture'}
            className="p-2 sm:p-2.5 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-white/20 transition-colors disabled:opacity-30 cursor-pointer"
            title="Đổi camera trước/sau"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 4. CẤU TRÚC DOM: CONTAINER CHIẾM TRỌN MÀN HÌNH (100vw, 100vh) */}
      {/* KHÔNG padding hay margin, overflow: hidden               */}
      {/* ======================================================== */}
      <div
        ref={scrollContainerRef}
        onScroll={handleContainerScroll}
        onClick={() => {
          if (markingAction === 'stream') attachAndPlayVideo();
        }}
        className="relative bg-black flex items-center justify-center m-0 p-0"
        style={{
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {cameraError ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto z-30">
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-rose-200">{cameraError}</p>
            <button
              type="button"
              onClick={() => startCamera(facingMode)}
              className="mt-4 px-4 py-2 bg-indigo-600 rounded-xl text-xs font-semibold text-white cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        ) : (
          <>
            {/* Lớp Wrapper biến đổi Zoom & Pan đồng bộ */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: isPinchingRef.current ? 'none' : 'transform 0.15s ease-out',
              }}
            >
              {/* 1. THẺ VIDEO: Hiển thị khi stream, zIndex: 5 */}
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                webkit-playsinline="true"
                onLoadedMetadata={(e) => {
                  attachAndPlayVideo();
                  if (drawCanvasRef.current && e.target.videoWidth) {
                    drawCanvasRef.current.width = e.target.videoWidth;
                    drawCanvasRef.current.height = e.target.videoHeight;
                  }
                  if (bgCanvasRef.current && e.target.videoWidth) {
                    bgCanvasRef.current.width = e.target.videoWidth;
                    bgCanvasRef.current.height = e.target.videoHeight;
                  }
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 0.3s ease-out',
                  zIndex: 5,
                  opacity: markingAction === 'capture' ? 0 : 1,
                  pointerEvents: 'none',
                }}
              />

              {/* 3. XỬ LÝ ẢNH TĨNH (BGCANVAS): CHỈ hiển thị khi capture */}
              <canvas
                ref={bgCanvasRef}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 0.3s ease-out',
                  pointerEvents: 'none',
                  zIndex: 8,
                  display: markingAction === 'capture' ? 'block' : 'none',
                }}
              />

              {/* 2. KÍCH HOẠT LỚP VẼ (DRAWCANVAS) ĐÈ LÊN VIDEO */}
              <canvas
                ref={drawCanvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  zIndex: 10,
                  objectFit: 'cover',
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 0.3s ease-out',
                  touchAction: 'none',
                  cursor: drawTool === 'eraser' ? 'cell' : drawTool === 'pan' ? 'grab' : 'crosshair',
                  pointerEvents: isStreaming ? 'auto' : 'none',
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>

            {/* Grid căn chỉnh khi đang xem camera */}
            {showGrid && markingAction !== 'capture' && (
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 z-15 border border-white/20">
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div />
              </div>
            )}

            {/* Toast thông báo trạng thái */}
            {markingAction !== 'capture' && (
              <div className="absolute top-14 sm:top-16 left-1/2 -translate-x-1/2 z-25 pointer-events-none w-11/12 max-w-xs text-center">
                <div className="px-3.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/10 text-[11px] text-slate-200 shadow-lg truncate">
                  {statusMessage}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ======================================================== */}
      {/* HAI NÚT ẨN/HIỆN RIÊNG BIỆT (KHÔNG CHUNG)                  */}
      {/* 1. Nút Ẩn/Hiện Thanh công cụ vẽ (Bút, Tẩy, Màu, Nét)     */}
      {/* 2. Nút Ẩn/Hiện Thanh điều khiển chiếu phía dưới           */}
      {/* ======================================================== */}
      {isStreaming && (
        <div className="fixed bottom-3 right-3 z-50 flex items-center gap-2">
          {/* Nút riêng cho Thanh vẽ (Bút, Tẩy, Bảng màu, Cỡ nét) */}
          <button
            type="button"
            onClick={() => setShowDrawingTools(!showDrawingTools)}
            className={`px-3 py-1.5 sm:py-2 rounded-full border shadow-2xl backdrop-blur-md active:scale-95 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
              showDrawingTools
                ? 'bg-slate-900/95 border-amber-400/60 text-amber-300'
                : 'bg-amber-500/95 border-amber-300 text-slate-950 shadow-amber-500/30'
            }`}
            title={showDrawingTools ? 'Ẩn thanh công cụ vẽ' : 'Hiện thanh công cụ vẽ'}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>{showDrawingTools ? 'Ẩn vẽ' : 'Bút vẽ'}</span>
          </button>

          {/* Nút riêng cho Thanh điều khiển chiếu phía dưới */}
          <button
            type="button"
            onClick={() => setShowBottomControls(!showBottomControls)}
            className={`px-3 py-1.5 sm:py-2 rounded-full border shadow-2xl backdrop-blur-md active:scale-95 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
              showBottomControls
                ? 'bg-slate-900/95 border-sky-400/60 text-sky-300'
                : 'bg-sky-500/95 border-sky-300 text-slate-950 shadow-sky-500/30'
            }`}
            title={showBottomControls ? 'Ẩn thanh điều khiển chiếu' : 'Hiện thanh điều khiển chiếu'}
          >
            <Video className="w-3.5 h-3.5" />
            <span>{showBottomControls ? 'Ẩn chiếu' : 'Chiếu'}</span>
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* KHU VỰC CÁC THANH CÔNG CỤ HIỂN THỊ PHÍA DƯỚI             */}
      {/* Thanh vẽ & Thanh điều khiển chiếu ẩn/hiện độc lập        */}
      {/* ======================================================== */}
      {!isStreaming ? (
        <footer className="fixed bottom-0 left-0 right-0 z-40 p-4 sm:p-6 pb-6 sm:pb-8 bg-gradient-to-t from-black via-black/90 to-transparent flex flex-col items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={handleStartStreaming}
            className="w-full max-w-sm py-4 px-6 rounded-2xl font-bold text-base bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-2xl shadow-emerald-600/50 active:scale-95 cursor-pointer flex items-center justify-center gap-3 transition-all duration-200"
          >
            <Video className="w-6 h-6 animate-pulse" />
            <span>Bấm 'Phát Video' Lên Máy Tính</span>
          </button>
          <p className="text-[11px] text-slate-300 text-center font-medium drop-shadow">
            WebRTC Data Channel • Đồng bộ nét vẽ thời gian thực từ Mobile sang PC
          </p>
        </footer>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-2 sm:p-3 pointer-events-none flex flex-col items-center gap-2 pb-14 sm:pb-14">
          {/* 1. THANH CÔNG CỤ VẼ: Bút, Tẩy, Bảng màu, Cỡ nét */}
          {showDrawingTools && (
            <div className="w-full max-w-md pointer-events-auto flex flex-col gap-2 bg-slate-900/95 border border-amber-500/40 p-2.5 sm:p-3 rounded-2xl shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Hàng 1: Bút, Tẩy, Di góc, Góc soi, Kính Lúp Zoom & Xóa */}
              <div className="flex items-center justify-between gap-1 sm:gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setDrawTool('pen')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    drawTool === 'pen'
                      ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                  title="Vẽ bút đỏ chấm bài"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Bút</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDrawTool('eraser')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    drawTool === 'eraser'
                      ? 'bg-rose-500 text-white shadow-md ring-2 ring-rose-300'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                  title="Tẩy nét vẽ"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Tẩy</span>
                </button>

                {/* Nút Di chuyển (Pan) */}
                <button
                  type="button"
                  onClick={() => setDrawTool('pan')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    drawTool === 'pan'
                      ? 'bg-sky-500 text-slate-950 shadow-md ring-2 ring-sky-300'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                  title="Di chuyển / Cuộn xem góc ảnh (cũng hỗ trợ vuốt 2 ngón khi dùng bút)"
                >
                  <Move className="w-3.5 h-3.5" />
                  <span>Di góc</span>
                </button>

                {/* Nút Góc Soi Nhanh (Corner Preset) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCornerMenu(!showCornerMenu)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      showCornerMenu || (panRatio.x !== 0 || panRatio.y !== 0)
                        ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                    title="Chọn góc phóng to nhanh"
                  >
                    <Compass className="w-3.5 h-3.5 text-indigo-300" />
                    <span>Góc</span>
                  </button>

                  {/* Menu Popover các góc soi bài */}
                  {showCornerMenu && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 border border-indigo-500/50 rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1.5 w-44 backdrop-blur-xl">
                      <div className="text-[10px] font-bold text-slate-400 text-center pb-1 border-b border-slate-800">
                        CHỌN GÓC PHÓNG TO
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[11px] font-semibold">
                        <button
                          type="button"
                          onClick={() => setCornerPreset('top-left')}
                          className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition-colors text-left"
                        >
                          ↖ Trên trái
                        </button>
                        <button
                          type="button"
                          onClick={() => setCornerPreset('top-right')}
                          className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition-colors text-left"
                        >
                          ↗ Trên phải
                        </button>
                        <button
                          type="button"
                          onClick={() => setCornerPreset('bottom-left')}
                          className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition-colors text-left"
                        >
                          ↙ Dưới trái
                        </button>
                        <button
                          type="button"
                          onClick={() => setCornerPreset('bottom-right')}
                          className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition-colors text-left"
                        >
                          ↘ Dưới phải
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-800 text-[11px] font-semibold">
                        <button
                          type="button"
                          onClick={() => setCornerPreset('center')}
                          className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-sky-600 text-slate-200 hover:text-white transition-colors text-center"
                        >
                          🎯 Giữa
                        </button>
                        <button
                          type="button"
                          onClick={() => setCornerPreset('reset')}
                          className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white transition-colors text-center"
                        >
                          🔄 1x (Đặt lại)
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Cụm Kính lúp Thu Phóng */}
                <div className="flex items-center gap-1 bg-slate-800 px-1.5 py-1 rounded-xl border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const newZoom = Math.max(1, Math.round((zoom - 0.5) * 10) / 10);
                      const newPan = newZoom === 1 ? { x: 0, y: 0 } : panRatioRef.current;
                      zoomRef.current = newZoom;
                      setZoom(newZoom);
                      panRatioRef.current = newPan;
                      setPanRatio(newPan);
                      syncViewToPC(newZoom, newPan);
                    }}
                    disabled={zoom <= 1}
                    className="p-1 rounded-lg hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                    title="Thu nhỏ ảnh"
                  >
                    <ZoomOut className="w-3.5 h-3.5 text-sky-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCornerPreset('reset')}
                    className="font-mono text-[11px] font-bold text-sky-300 min-w-[26px] text-center hover:underline cursor-pointer"
                    title="Bấm để đặt lại 1x toàn cảnh"
                  >
                    {zoom}x
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newZoom = Math.min(4, Math.round((zoom + 0.5) * 10) / 10);
                      zoomRef.current = newZoom;
                      setZoom(newZoom);
                      syncViewToPC(newZoom, panRatioRef.current);
                    }}
                    disabled={zoom >= 4}
                    className="p-1 rounded-lg hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                    title="Phóng to ảnh (hỗ trợ 2 ngón pinch)"
                  >
                    <ZoomIn className="w-3.5 h-3.5 text-sky-400" />
                  </button>
                </div>

                {/* Xóa toàn bộ nét */}
                <button
                  type="button"
                  onClick={handleClearDrawingsMobile}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-500/30 transition-all cursor-pointer active:scale-95"
                  title="Xóa toàn bộ nét vẽ"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Nút đóng nhanh thanh vẽ */}
                <button
                  type="button"
                  onClick={() => setShowDrawingTools(false)}
                  className="p-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                  title="Ẩn thanh vẽ"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Hàng 2: Tùy chỉnh màu & độ dày (1 - 50px) */}
              <div className="flex items-center justify-between gap-2 px-1 pt-1 border-t border-slate-800 flex-wrap">
                {drawTool === 'pen' && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={penColor}
                      onChange={(e) => {
                        setPenColor(e.target.value);
                        penColorRef.current = e.target.value;
                      }}
                      className="w-6 h-6 rounded-md cursor-pointer border border-white/40 bg-transparent p-0"
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
                        className={`w-5 h-5 rounded-full transition-transform cursor-pointer border border-white/20 ${
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

                <div className="flex items-center gap-1.5 text-xs text-slate-300 ml-auto">
                  <span className="text-[11px] text-slate-400">
                    {drawTool === 'eraser' ? 'Tẩy:' : 'Nét:'}
                  </span>
                  <div className="flex items-center gap-1 bg-slate-800 px-1.5 py-0.5 rounded-lg border border-slate-700">
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
                      className="w-5 h-5 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:pointer-events-none text-slate-200 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
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
                      className="w-5 h-5 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:pointer-events-none text-slate-200 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
                      title="Tăng kích thước 1px"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="font-mono text-[10px] w-6 text-right font-bold text-amber-300">
                    {penSize}px
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 2. THANH ĐIỀU KHIỂN CHIẾU PHÍA DƯỚI: Đóng băng/Live & Dừng phát */}
          {showBottomControls && (
            <div className="w-full max-w-md pointer-events-auto flex items-center justify-between gap-2 bg-slate-900/95 border border-sky-500/40 p-2 sm:p-2.5 rounded-2xl shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-semibold text-slate-200">
                  {markingAction === 'capture' ? 'Đang soi ảnh chụp' : 'Chiếu Live'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {markingAction === 'stream' ? (
                  <button
                    type="button"
                    onClick={handleCaptureForGrading}
                    className="py-1.5 px-3 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5 transition-all"
                    title="Đóng băng khung hình hiện tại"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Đóng băng</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleResumeStreaming}
                      className="py-1.5 px-2.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-95 cursor-pointer flex items-center gap-1 transition-all"
                      title="Tiếp tục phát live camera"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Live</span>
                    </button>

                    {/* Nút Nhận xét bằng AI khi ở chế độ Đóng băng */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!aiResult) {
                          handleAiAnalyzeMobile();
                        } else {
                          setIsAiPanelOpen(true);
                        }
                      }}
                      className="py-1.5 px-3 rounded-xl font-bold text-xs bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white shadow-lg shadow-indigo-600/30 active:scale-95 cursor-pointer flex items-center gap-1.5 transition-all ring-1 ring-indigo-400/50"
                      title="Nhận xét bài làm học sinh bằng AI"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                      <span>Nhận xét AI</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={stopLivestream}
                  className="py-1.5 px-2.5 rounded-xl font-bold text-xs bg-rose-600/90 hover:bg-rose-600 text-white shadow-md border border-rose-500/30 active:scale-95 cursor-pointer flex items-center gap-1 transition-all"
                  title="Dừng phát video lên máy tính"
                >
                  <VideoOff className="w-3.5 h-3.5" />
                  <span>Dừng</span>
                </button>

                {/* Nút đóng nhanh thanh chiếu */}
                <button
                  type="button"
                  onClick={() => setShowBottomControls(false)}
                  className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-sky-300 transition-colors cursor-pointer"
                  title="Ẩn điều khiển chiếu"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nút Nhận xét bằng AI nổi góc trên khi Đóng băng */}
      {markingAction === 'capture' && (
        <div className="fixed top-16 right-3 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              if (!aiResult) {
                handleAiAnalyzeMobile();
              } else {
                setIsAiPanelOpen(true);
              }
            }}
            className="py-2 px-3.5 rounded-2xl font-bold text-xs bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-600 text-white shadow-xl shadow-indigo-600/40 border border-indigo-400/50 flex items-center gap-2 active:scale-95 transition-all"
            title="Nhận xét bài làm của học sinh bằng AI"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-spin" style={{ animationDuration: '4s' }} />
            <span>Nhận xét AI</span>
          </button>
        </div>
      )}

      {/* Bảng điều khiển nhận xét AI dạng Drawer trên điện thoại */}
      <AIReviewPanel
        isOpen={isAiPanelOpen}
        onClose={() => setIsAiPanelOpen(false)}
        isLoading={isAiLoading}
        error={aiError}
        aiResult={aiResult}
        onAnalyze={handleAiAnalyzeMobile}
        errorDecisions={errorDecisions}
        onErrorDecisionChange={handleErrorDecisionChangeMobile}
        showOnProjector={showOnProjector}
        onToggleShowOnProjector={() => {
          const next = !showOnProjector;
          setShowOnProjector(next);
          const channel = dataChannelRef.current || dcRef.current;
          if (channel && channel.readyState === 'open') {
            try {
              channel.send(JSON.stringify({ type: 'ai_decision_sync', showOnProjector: next }));
            } catch (e) {}
          }
        }}
        teacherFeedback={teacherFeedback}
        onTeacherFeedbackChange={(feedback) => {
          setTeacherFeedback(feedback);
          const channel = dataChannelRef.current || dcRef.current;
          if (channel && channel.readyState === 'open') {
            try {
              channel.send(JSON.stringify({ type: 'ai_decision_sync', teacherFeedback: feedback }));
            } catch (e) {}
          }
        }}
        isMobile={true}
      />
    </div>
  );
}
