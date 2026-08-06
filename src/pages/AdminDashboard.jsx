import React, { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Users, UserSquare2, Clock, History, LayoutDashboard, LogOut } from 'lucide-react';
import AdminLogin from '../components/AdminLogin';
import DataTable from '../components/DataTable';

function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const location = useLocation();

  if (!isAuthenticated) {
    return <AdminLogin onLogin={setIsAuthenticated} />;
  }

  const navItems = [
    { path: '/admin', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { path: '/admin/murid', icon: <Users size={20} />, label: 'Data Murid' },
    { path: '/admin/guru', icon: <UserSquare2 size={20} />, label: 'Data Guru' },
    { path: '/admin/absen-murid', icon: <Clock size={20} />, label: 'Absen Murid' },
    { path: '/admin/absen-guru', icon: <History size={20} />, label: 'Absen Guru' },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 font-black text-xl">
            A
          </div>
          <div>
            <h1 className="font-bold text-slate-800 leading-tight">Panel Admin</h1>
            <p className="text-xs text-slate-500">Madrasah Inovatif</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto">
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
                location.pathname === item.path 
                ? 'bg-emerald-50 text-emerald-600' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
        
        <div className="p-4 border-t border-slate-100">
          <Link 
            to="/" 
            className="flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut size={20} />
            Keluar ke Layar Tap
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-8">
          <Routes>
            <Route path="/" element={<WelcomeDashboard />} />
            <Route path="/murid" element={<DataTable table="murid" title="Data Murid" />} />
            <Route path="/guru" element={<DataTable table="guru" title="Data Guru" />} />
            <Route path="/absen-murid" element={<DataTable table={['absensi_datang', 'absensi_pulang']} masterTable="murid" title="Log Absensi Murid" isLog={true} />} />
            <Route path="/absen-guru" element={<DataTable table={['absensi_guru_datang', 'absensi_guru_pulang']} masterTable="guru" title="Log Absensi Guru" isLog={true} />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function WelcomeDashboard() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-6">
        <LayoutDashboard size={48} />
      </div>
      <h2 className="text-3xl font-black text-slate-800 mb-2">Selamat Datang di Panel Admin</h2>
      <p className="text-slate-500 text-lg max-w-md">
        Pilih menu di sebelah kiri untuk mengelola data master murid, guru, atau melihat log absensi secara real-time.
      </p>
    </div>
  );
}

export default AdminDashboard;
