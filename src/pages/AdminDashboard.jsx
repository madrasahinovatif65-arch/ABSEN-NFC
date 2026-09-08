import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Clock, History, LogOut, UserSquare2 } from 'lucide-react';
import DataTable from '../components/DataTable';

function AdminDashboard() {
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    window.location.href = '/admin-login';
  };

  const navItems = [
    { path: '/admin', icon: <LayoutDashboard size={20} />, label: 'Dashboard', desc: 'Halaman Utama Admin' },
    { path: '/admin/murid', icon: <Users size={20} />, label: 'Data Murid', desc: 'Data Murid dari SIAKAD' },
    { path: '/admin/guru', icon: <UserSquare2 size={20} />, label: 'Data Guru', desc: 'Data Guru dari SIAKAD' },
    { path: '/admin/absen-murid', icon: <Clock size={20} />, label: 'Absen Murid', desc: 'Log Kehadiran Murid' },
    { path: '/admin/absen-guru', icon: <History size={20} />, label: 'Absen Guru', desc: 'Log Kehadiran Guru' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-72 bg-slate-900 text-slate-300 flex flex-col shadow-2xl z-20">
        <div className="p-6 md:p-8 bg-slate-950/50 border-b border-slate-800 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white shrink-0">
            <LayoutDashboard size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Admin Panel</h1>
            <p className="text-xs text-emerald-400 font-semibold mt-1 uppercase tracking-wider">MI Miftahul Khoir</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 md:py-8 overflow-y-auto space-y-2">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 px-4">Menu Utama</div>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
                  isActive 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                    : 'hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                  {item.icon}
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 md:p-6 bg-slate-950/30 border-t border-slate-800">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-3.5 rounded-2xl font-semibold transition-all duration-300"
          >
            <LogOut size={20} />
            Keluar Sistem
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-64 bg-emerald-600 rounded-br-[100px] -z-10 opacity-10 pointer-events-none"></div>
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <Routes>
            <Route path="/" element={<WelcomeDashboard />} />
            <Route path="/murid" element={<DataTable table="master_user" userType="murid" title="Data Murid (Read Only)" />} />
            <Route path="/guru" element={<DataTable table="master_user" userType="guru" title="Data Guru (Read Only)" />} />
            <Route path="/absen-murid" element={<DataTable table="log_absensi" userType="murid" masterTable="master_user" title="Log Absensi Murid" isLog={true} />} />
            <Route path="/absen-guru" element={<DataTable table="log_absensi" userType="guru" masterTable="master_user" title="Log Absensi Guru" isLog={true} />} />
          </Routes>
        </div>
      </main>
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
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="relative z-10 text-center md:text-left">
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">Selamat Datang di Panel Admin 👋</h2>
          <p className="text-slate-500 mt-2 text-sm md:text-base leading-relaxed max-w-2xl">
            Kelola data master dan pantau log kehadiran (absensi) dari pemindaian NFC secara real-time. Pilih menu di bawah atau di samping untuk mulai bekerja.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        {menus.map((menu, idx) => (
          <Link key={idx} to={menu.path} className="group bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:border-emerald-200 transition-all duration-300 flex flex-col items-start gap-4">
            <div className={`p-4 rounded-2xl ${menu.color} group-hover:scale-110 transition-transform duration-300`}>
              {menu.icon}
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg group-hover:text-emerald-600 transition-colors">{menu.label}</h3>
              <p className="text-slate-500 text-sm mt-1">{menu.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default AdminDashboard;

