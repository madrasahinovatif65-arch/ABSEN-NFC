import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import NfcScanner from './pages/NfcScanner';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<NfcScanner />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
