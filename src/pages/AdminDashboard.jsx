import React, { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Users, UserSquare2, Clock, History, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import AdminLogin from '../components/AdminLogin';
import DataTable from '../components/DataTable';

function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      
      {/* Mobile Header */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 font-black text-sm">
            A
          </div>
          <h1 className="font-bold text-slate-800">Panel Admin</h1>
        </div>
        <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
          <Menu size={24} />
        </button>
      </div>

      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-slate-900/50 z-30 transition-opacity" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-in-out w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm z-40`}>
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 font-black text-xl">
              A
            </div>
            <div>
              <h1 className="font-bold text-slate-800 leading-tight">Panel Admin</h1>
              <p className="text-xs text-slate-500">Madrasah Inovatif</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-2 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        
        <nav className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto">
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              to={item.path}
              onClick={() => setSidebarOpen(false)}
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
      <div className="flex-1 flex flex-col overflow-hidden relative pt-16 md:pt-0">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
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
