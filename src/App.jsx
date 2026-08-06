import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import NfcScanner from './pages/NfcScanner';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<NfcScanner />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
      </Routes>
      <Analytics />
    </Router>
  );
}

export default App;
