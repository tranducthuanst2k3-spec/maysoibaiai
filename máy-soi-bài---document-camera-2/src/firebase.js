import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';

// Cấu hình Firebase dự án soibai
export const firebaseConfig = {
  apiKey: "AIzaSyDzVDaAXAO4XT4j6vRLWHza6vvD9TSBQDg",
  authDomain: "soibai.firebaseapp.com",
  projectId: "soibai",
  storageBucket: "soibai.firebasestorage.app",
  messagingSenderId: "1065009442986",
  appId: "1:1065009442986:web:6a7885bb2e658f0c7c20d3",
  measurementId: "G-QS6KYML4F3"
};

// Khởi tạo Firebase App
const app = initializeApp(firebaseConfig);

// Khởi tạo Firestore với experimentalForceLongPolling để tương thích tốt nhất
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId || '(default)'
);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Kiểm tra kết nối tới Firestore khi khởi động (bắt buộc theo chuẩn Firebase Skill)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('the client is offline') ||
        error.message.includes('unavailable') ||
        error.code === 'unavailable')
    ) {
      console.warn('Kiểm tra kết nối Firebase: Thiết bị đang ở chế độ chờ mạng hoặc offline');
    }
  }
}
testConnection();

// Bộ xử lý lỗi Firestore chuẩn đoán lỗi phân quyền
export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
