import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Plus, Trash2, Edit2, Search, X, Loader2, ScanLine } from 'lucide-react';

function DataTable({ table, masterTable, title, isLog = false }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterKelas, setFilterKelas] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ rfid_uid: '', nama: '', detail: '', foto_url: '' });
  
  // Sort State
  const [sortConfig, setSortConfig] = useState({ key: 'nama', direction: 'asc' });

  const [isScanning, setIsScanning] = useState(false);
  const scanInputRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, [table, selectedDate, masterTable]);

  useEffect(() => {
    if (isModalOpen && isScanning && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [isModalOpen, isScanning]);

  const fetchData = async () => {
    setLoading(true);
    
    if (isLog && masterTable) {
      let masterData = [];
      let logData = [];
      
      // Fetch Master Data
      const { data: mData } = await supabase.from(masterTable).select('*');
      if (mData) masterData = mData;

      // Fetch Logs for selected Date
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const tablesToFetch = Array.isArray(table) ? table : [table];
      for (const tbl of tablesToFetch) {
        const { data: lData } = await supabase.from(tbl)
          .select('*')
          .gte('waktu', startOfDay.toISOString())
          .lte('waktu', endOfDay.toISOString());
        if (lData) logData = [...logData, ...lData];
      }

      // Group logs by uid
      const groupedLogs = {};
      logData.forEach(log => {
        const uid = log.rfid_uid;
        if (!groupedLogs[uid]) groupedLogs[uid] = { datang: null, pulang: null };
        if (log.jenis_absen === 'Datang' || log.jenis_absen === 'Terlambat') {
          if (!groupedLogs[uid].datang || new Date(log.waktu) < new Date(groupedLogs[uid].datang.waktu)) {
            groupedLogs[uid].datang = log;
          }
        } else if (log.jenis_absen === 'Pulang') {
          if (!groupedLogs[uid].pulang || new Date(log.waktu) > new Date(groupedLogs[uid].pulang.waktu)) {
            groupedLogs[uid].pulang = log;
          }
        }
      });

      // Merge with master
      const combined = masterData.map(person => {
        const uid = person.rfid_uid;
        return {
          ...person,
          datang: groupedLogs[uid]?.datang || null,
          pulang: groupedLogs[uid]?.pulang || null,
        };
      });
      
      setData(combined);
    } else {
      // Regular Master Data Fetching
      const targetTable = Array.isArray(table) ? table[0] : table;
      const { data: result } = await supabase.from(targetTable).select('*').order('nama', { ascending: true });
      if (result) setData(result);
    }
    
    setLoading(false);
  };

  const handleScanInput = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setFormData({ ...formData, rfid_uid: e.target.value.trim() });
      setIsScanning(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const targetTable = Array.isArray(table) ? table[0] : table;
    
    if (editingId) {
      await supabase.from(targetTable).update(formData).eq('rfid_uid', editingId);
    } else {
      await supabase.from(targetTable).insert([formData]);
    }
    
    setIsModalOpen(false);
    setFormData({ rfid_uid: '', nama: '', detail: '', foto_url: '' });
    setEditingId(null);
    fetchData();
  };

  const handleDelete = async (id) => {
    if (window.confirm("Yakin ingin menghapus data ini?")) {
      setLoading(true);
      const targetTable = Array.isArray(table) ? table[0] : table;
      await supabase.from(targetTable).delete().eq('rfid_uid', id);
      fetchData();
    }
  };

  const openEdit = (row) => {
    setFormData({ rfid_uid: row.rfid_uid, nama: row.nama, detail: row.detail, foto_url: row.foto_url || '' });
    setEditingId(row.rfid_uid);
    setIsModalOpen(true);
  };

  const openAdd = () => {
    setFormData({ rfid_uid: '', nama: '', detail: '', foto_url: '' });
    setEditingId(null);
    setIsModalOpen(true);
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredData = data.filter(row => {
    const matchesSearch = (row.nama?.toLowerCase() || '').includes(search.toLowerCase()) || 
                          (row.rfid_uid?.toLowerCase() || '').includes(search.toLowerCase());
    const matchesKelas = filterKelas === '' || row.detail === filterKelas;
    
    let matchesStatus = true;
    if (isLog && filterStatus !== '') {
      const hasDatang = !!row.datang;
      const hasPulang = !!row.pulang;
      const isTerlambat = row.datang?.jenis_absen === 'Terlambat';
      
      if (filterStatus === 'Hadir Tepat Waktu') matchesStatus = hasDatang && !isTerlambat;
      if (filterStatus === 'Terlambat') matchesStatus = isTerlambat;
      if (filterStatus === 'Belum Tap Pulang') matchesStatus = hasDatang && !hasPulang;
      if (filterStatus === 'Tidak Tap Absen') matchesStatus = !hasDatang && !hasPulang;
    }
    
    return matchesSearch && matchesKelas && matchesStatus;
  }).sort((a, b) => {
    if (isLog && (sortConfig.key === 'waktu_datang' || sortConfig.key === 'waktu_pulang')) {
      const aTime = sortConfig.key === 'waktu_datang' ? a.datang?.waktu : a.pulang?.waktu;
      const bTime = sortConfig.key === 'waktu_datang' ? b.datang?.waktu : b.pulang?.waktu;
      if (!aTime && !bTime) return 0;
      if (!aTime) return sortConfig.direction === 'asc' ? 1 : -1;
      if (!bTime) return sortConfig.direction === 'asc' ? -1 : 1;
      return sortConfig.direction === 'asc' ? (new Date(aTime) - new Date(bTime)) : (new Date(bTime) - new Date(aTime));
    }
    
    if (!a[sortConfig.key]) return 1;
    if (!b[sortConfig.key]) return -1;
    
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <span className="ml-1 opacity-20">↕</span>;
    return <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const uniqueKelas = [...new Set(data.map(row => row.detail))].filter(Boolean).sort();

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center bg-slate-50/50 gap-4">
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        
        <div className="flex flex-col md:flex-row flex-wrap items-stretch md:items-center gap-3 w-full xl:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari nama atau UID..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none w-full md:w-56 text-sm"
            />
          </div>

          <select 
            value={filterKelas} 
            onChange={(e) => setFilterKelas(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-xl focus:border-emerald-500 outline-none text-sm bg-white cursor-pointer"
          >
            <option value="">Semua Kelas/Jabatan</option>
            {uniqueKelas.map((f, i) => <option key={i} value={f}>{f}</option>)}
          </select>

          {isLog && (
            <>
              <select 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-xl focus:border-emerald-500 outline-none text-sm bg-white cursor-pointer"
              >
                <option value="">Semua Status Absen</option>
                <option value="Hadir Tepat Waktu">Hadir Tepat Waktu</option>
                <option value="Terlambat">Terlambat</option>
                <option value="Belum Tap Pulang">Belum Tap Pulang</option>
                <option value="Tidak Tap Absen">Tidak Tap Absen</option>
              </select>
              
              <input 
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-xl focus:border-emerald-500 outline-none text-sm bg-white cursor-pointer font-semibold text-slate-700 shadow-sm"
              />
            </>
          )}
          
          {!isLog && (
            <button 
              onClick={openAdd}
              className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-colors w-full md:w-auto"
            >
              <Plus size={18} /> Tambah Data
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-0">
        {loading && data.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-emerald-500" size={32} />
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th onClick={() => handleSort('rfid_uid')} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                  UID Kartu <SortIcon columnKey="rfid_uid" />
                </th>
                <th onClick={() => handleSort('nama')} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                  Nama <SortIcon columnKey="nama" />
                </th>
                <th onClick={() => handleSort('detail')} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                  {isLog ? 'Kelas / Jabatan' : 'Detail / Kelas'} <SortIcon columnKey="detail" />
                </th>
                {isLog ? (
                  <>
                    <th onClick={() => handleSort('waktu_datang')} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">Waktu Datang <SortIcon columnKey="waktu_datang" /></th>
                    <th onClick={() => handleSort('waktu_pulang')} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">Waktu Pulang <SortIcon columnKey="waktu_pulang" /></th>
                  </>
                ) : (
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length > 0 ? filteredData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{row.rfid_uid}</td>
                  <td className="px-6 py-4 font-semibold text-slate-800">{row.nama}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{row.detail}</td>
                  {isLog ? (
                    <>
                      <td className="px-6 py-4 text-sm">
                        {row.datang ? (
                          <div className="flex flex-col">
                            <span className="text-emerald-700 font-bold">{new Date(row.datang.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                            {row.datang.jenis_absen === 'Terlambat' && <span className="text-[10px] text-amber-700 font-bold bg-amber-100 rounded-md px-2 py-0.5 w-max mt-1 uppercase tracking-wider">Terlambat</span>}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-semibold bg-slate-100 rounded-md px-2 py-1 text-xs">Tidak Tap Absen</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {row.pulang ? (
                          <span className="text-blue-700 font-bold">{new Date(row.pulang.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        ) : row.datang ? (
                          <span className="text-amber-600 font-bold bg-amber-50 border border-amber-200 rounded-md px-2 py-1 text-xs">Belum Tap Pulang</span>
                        ) : (
                          <span className="text-slate-400 font-semibold bg-slate-100 rounded-md px-2 py-1 text-xs">Tidak Tap Absen</span>
                        )}
                      </td>
                    </>
                  ) : (
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => openEdit(row)} className="text-blue-500 hover:text-blue-700 p-2"><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(row.rfid_uid)} className="text-red-500 hover:text-red-700 p-2 ml-2"><Trash2 size={16} /></button>
                    </td>
                  )}
                </tr>
              )) : (
                <tr><td colSpan={isLog ? 5 : 4} className="text-center py-10 text-slate-500">Tidak ada data ditemukan.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal CRUD */}
      {isModalOpen && !isLog && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden relative">
            
            {/* Hidden Input for Scanner */}
            {isScanning && (
               <input 
                 ref={scanInputRef}
                 type="text"
                 className="absolute opacity-0"
                 onKeyDown={handleScanInput}
                 onBlur={() => setTimeout(() => scanInputRef.current?.focus(), 10)}
               />
            )}

            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">{editingId ? 'Edit Data' : 'Tambah Data Baru'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">UID Kartu NFC</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    required
                    disabled={isScanning}
                    value={isScanning ? "Menunggu Tap Kartu..." : formData.rfid_uid}
                    onChange={(e) => setFormData({...formData, rfid_uid: e.target.value})}
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:border-emerald-500 outline-none font-mono text-sm bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500"
                    placeholder="Contoh: a1b2c3d4"
                  />
                  <button 
                    type="button"
                    onClick={() => setIsScanning(!isScanning)}
                    className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors ${isScanning ? 'bg-amber-500 text-white animate-pulse' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                  >
                    <ScanLine size={18} /> {isScanning ? 'Batal' : 'Scan'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Nama Lengkap</label>
                <input 
                  type="text" 
                  required
                  value={formData.nama}
                  onChange={(e) => setFormData({...formData, nama: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-emerald-500 outline-none"
                  placeholder="Masukkan nama"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Detail (Kelas / Jabatan)</label>
                <input 
                  type="text" 
                  required
                  value={formData.detail}
                  onChange={(e) => setFormData({...formData, detail: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-emerald-500 outline-none"
                  placeholder="Contoh: XII IPA 1"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">URL Foto (Opsional)</label>
                <input 
                  type="url" 
                  value={formData.foto_url}
                  onChange={(e) => setFormData({...formData, foto_url: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-emerald-500 outline-none text-sm"
                  placeholder="https://..."
                />
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Batal</button>
                <button type="submit" disabled={isScanning} className="px-5 py-2 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
