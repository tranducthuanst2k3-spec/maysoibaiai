import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Hỗ trợ nhận ảnh 2K/HD base64 dung lượng lớn
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Khởi tạo Gemini Client dùng SDK @google/genai chuẩn
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Endpoint AI nhận xét bài làm học sinh từ ảnh chụp đóng băng
app.post('/api/ai-review', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Không tìm thấy dữ liệu ảnh bài làm để phân tích.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng kiểm tra mục Settings > Secrets.',
      });
    }

    // Làm sạch chuỗi Base64
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    const promptText = `Bạn là trợ lý của giáo viên Tiểu học Việt Nam. Hãy đọc chữ viết tay và phép tính trong ảnh, tìm lỗi (toán, chính tả, ngữ pháp), và trả về JSON gồm: noi_dung_doc_duoc, loi:[{vi_tri, mo_ta, goi_y_sua}], nhan_xet_ngan (1–2 câu, giọng khích lệ, phù hợp học sinh tiểu học). Nếu không chắc, ghi rõ 'không chắc' thay vì đoán.`;

    const systemInstruction = `Bạn là trợ lý đắc lực của giáo viên Tiểu học tại Việt Nam, chuyên hỗ trợ chấm và nhận xét bài làm của học sinh một cách ân cần, chính xác và mang tính sư phạm.`;

    // 1. Chuyển đổi Model chống nghẽn: Gọi đích danh gemini-1.5-flash theo yêu cầu (kèm fallback các bản Flash chống nghẽn tải cao)
    const modelCandidates = ['gemini-1.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
    let response = null;
    let lastError = null;

    for (const modelName of modelCandidates) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType || 'image/jpeg',
                    data: cleanBase64,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
          ],
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                noi_dung_doc_duoc: {
                  type: Type.STRING,
                  description:
                    'Toàn bộ nội dung chữ viết tay và các phép tính toán học đọc được trong bài làm của học sinh',
                },
                loi: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      vi_tri: {
                        type: Type.STRING,
                        description:
                          'Vị trí của lỗi trong bài làm (ví dụ: "Dòng 2", "Phép tính thứ nhất", "Câu b")',
                      },
                      mo_ta: {
                        type: Type.STRING,
                        description:
                          'Mô tả chi tiết lỗi sai về phép tính số học, chính tả tiếng Việt hoặc ngữ pháp',
                      },
                      goi_y_sua: {
                        type: Type.STRING,
                        description:
                          'Gợi ý cách chữa hoặc đáp án đúng để học sinh hiểu bài và khắc phục',
                      },
                    },
                    required: ['vi_tri', 'mo_ta', 'goi_y_sua'],
                  },
                  description: 'Danh sách các lỗi tìm thấy trong bài làm',
                },
                nhan_xet_ngan: {
                  type: Type.STRING,
                  description:
                    '1 đến 2 câu nhận xét sư phạm ngắn, ấm áp, khích lệ và động viên học sinh tiểu học',
                },
              },
              required: ['noi_dung_doc_duoc', 'loi', 'nhan_xet_ngan'],
            },
          },
        });

        if (response && response.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[API /api/ai-review] Model ${modelName} gặp lỗi:`, err?.message || err);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('Không nhận được phản hồi phân tích từ Gemini.');
    }

    const rawJsonText = response.text.trim();
    const parsedData = JSON.parse(rawJsonText);

    // Quyền riêng tư: Không lưu trữ hình ảnh hoặc dữ liệu học sinh trên ổ đĩa/database
    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('[API /api/ai-review] Lỗi khi nhận xét bài làm bằng AI:', error);
    // 2. Xử lý hiển thị lỗi: Tuyệt đối không in chuỗi JSON raw ra giao diện
    return res.status(503).json({
      success: false,
      error: 'Hệ thống AI đang xử lý quá nhiều bài cùng lúc. Thầy/cô vui lòng đợi 3-5 giây rồi bấm thử lại nhé!',
    });
  }
});

// Middleware Vite cho môi trường phát triển & Serve Static cho môi trường Production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server Máy Soi Bài đang chạy tại http://localhost:${PORT}`);
});
