import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './components/Login';
import Home from './components/Home';
import MobileScanner from './components/MobileScanner';
import PCProjector from './components/PCProjector';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public login route */}
          <Route path="/login" element={<Login />} />

          {/* Protected routes requiring Google authentication */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mobile"
            element={
              <ProtectedRoute allowGuestWithRoom={true}>
                <MobileScanner />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pc"
            element={
              <ProtectedRoute>
                <PCProjector />
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
