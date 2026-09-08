import React, { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Users, UserSquare2, Clock, History, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import AdminLogin from '../components/AdminLogin';
import DataTable from '../components/DataTable';

function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const location = useLocation();

  if (!isAuthenticated) {
    return <AdminLogin onLogin={setIsAuthenticated} />;
  }

  const navItems = [
    { path: '/admin', icon: <LayoutDashboard size={20} />, label: 'Dashboard', desc: 'Halaman Utama Admin' },
    { path: '/admin/murid', icon: <Users size={20} />, label: 'Data Murid', desc: 'Data Murid dari SIAKAD' },
    { path: '/admin/guru', icon: <UserSquare2 size={20} />, label: 'Data Guru', desc: 'Data Guru dari SIAKAD' },
    { path: '/admin/absen-murid', icon: <Clock size={20} />, label: 'Absen Murid', desc: 'Log Kehadiran Murid' },
    { path: '/admin/absen-guru', icon: <History size={20} />, label: 'Absen Guru', desc: 'Log Kehadiran Guru' },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      
      {/* Mobile Header */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-20 shadow-sm">
        <Link to="/admin" className="flex items-center gap-3 active:opacity-70 transition-opacity">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 font-black text-sm">
            <LayoutDashboard size={16} />
          </div>
          <h1 className="font-bold text-slate-800">Panel Admin</h1>
        </Link>
        <Link to="/" onClick={() => setIsAuthenticated(false)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg active:bg-red-100 transition-colors flex items-center gap-2 text-sm font-semibold">
          <LogOut size={20} />
          <span className="sr-only">Keluar</span>
        </Link>
      </div>

      {/* Sidebar (Desktop Only) */}
      <div className="hidden md:flex relative w-64 bg-white border-r border-slate-200 flex-col shadow-sm z-10">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <Link to="/admin" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 font-black text-xl">
              A
            </div>
            <div>
              <h1 className="font-bold text-slate-800 leading-tight">Panel Admin</h1>
              <p className="text-xs text-slate-500">Madrasah Inovatif</p>
            </div>
          </Link>
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
            onClick={() => setIsAuthenticated(false)}
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
            <Route path="/murid" element={<DataTable table="master_user" userType="murid" title="Data Murid (Read Only)" />} />
            <Route path="/guru" element={<DataTable table="master_user" userType="guru" title="Data Guru (Read Only)" />} />
            <Route path="/absen-murid" element={<DataTable table="log_absensi" userType="murid" masterTable="master_user" title="Log Absensi Murid" isLog={true} />} />
            <Route path="/absen-guru" element={<DataTable table="log_absensi" userType="guru" masterTable="master_user" title="Log Absensi Guru" isLog={true} />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function WelcomeDashboard() {
  const menus = [
    { path: '/admin/murid', icon: <Users size={32} />, label: 'Data Murid', desc: 'Data Murid dari SIAKAD', color: 'bg-blue-100 text-blue-600' },
    { path: '/admin/guru', icon: <UserSquare2 size={32} />, label: 'Data Guru', desc: 'Data Guru dari SIAKAD', color: 'bg-purple-100 text-purple-600' },
    { path: '/admin/absen-murid', icon: <Clock size={32} />, label: 'Absen Murid', desc: 'Rekap kehadiran siswa', color: 'bg-emerald-100 text-emerald-600' },
    { path: '/admin/absen-guru', icon: <History size={32} />, label: 'Absen Guru', desc: 'Rekap kehadiran guru', color: 'bg-amber-100 text-amber-600' },
  ];

  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-4">
      <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center text-emerald-600 mb-6 shadow-sm rotate-3">
        <LayoutDashboard size={40} className="-rotate-3" />
      </div>
      <h2 className="text-2xl md:text-3xl font-black text-slate-800 mb-2">Selamat Datang di Panel Admin</h2>
      <p className="text-slate-500 text-sm md:text-base max-w-md mb-10">
        Pilih menu di bawah ini untuk mengelola data master atau melihat log absensi secara real-time.
      </p>

      <div className="grid grid-cols-2 gap-4 w-full max-w-2xl">
        {menus.map(menu => (
          <Link 
            key={menu.path} 
            to={menu.path}
            className="flex flex-col items-center p-6 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md hover:border-emerald-200 transition-all active:scale-[0.98] group"
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${menu.color}`}>
              {menu.icon}
            </div>
            <h3 className="font-bold text-slate-800 mb-1">{menu.label}</h3>
            <p className="text-xs text-slate-500 hidden md:block">{menu.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default AdminDashboard;

