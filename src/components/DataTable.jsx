import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Plus, Trash2, Edit2, Search, X, Loader2, ScanLine } from 'lucide-react';

function DataTable({ table, title, isLog = false }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
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
  }, [table]);

  useEffect(() => {
    if (isModalOpen && isScanning && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [isModalOpen, isScanning]);

  const fetchData = async () => {
    setLoading(true);
    let query = supabase.from(table).select('*');
    if (isLog) {
      query = query.order('waktu', { ascending: false }).limit(100);
    } else {
      query = query.order('nama', { ascending: true });
    }
    const { data: result, error } = await query;
    if (!error && result) {
      setData(result);
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
    
    if (editingId) {
      await supabase.from(table).update(formData).eq('rfid_uid', editingId);
    } else {
      await supabase.from(table).insert([formData]);
    }
    
    setIsModalOpen(false);
    setFormData({ rfid_uid: '', nama: '', detail: '', foto_url: '' });
    setEditingId(null);
    fetchData();
  };

  const handleDelete = async (id) => {
    if (window.confirm("Yakin ingin menghapus data ini?")) {
      setLoading(true);
      await supabase.from(table).delete().eq('rfid_uid', id);
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

  const filteredData = data.filter(row => 
    (row.nama?.toLowerCase() || '').includes(search.toLowerCase()) || 
    (row.rfid_uid?.toLowerCase() || '').includes(search.toLowerCase())
  ).sort((a, b) => {
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

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari nama atau UID..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none w-64 text-sm"
            />
          </div>
          
          {!isLog && (
            <button 
              onClick={openAdd}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-colors"
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
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th onClick={() => handleSort('rfid_uid')} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                  UID Kartu <SortIcon columnKey="rfid_uid" />
                </th>
                <th onClick={() => handleSort('nama')} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                  Nama <SortIcon columnKey="nama" />
                </th>
                <th onClick={() => handleSort(isLog ? 'jenis_absen' : 'detail')} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
                  {isLog ? 'Keterangan / Absen' : 'Detail / Kelas'} <SortIcon columnKey={isLog ? 'jenis_absen' : 'detail'} />
                </th>
                {isLog && <th onClick={() => handleSort('waktu')} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">Waktu <SortIcon columnKey="waktu" /></th>}
                {!isLog && <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length > 0 ? filteredData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{row.rfid_uid}</td>
                  <td className="px-6 py-4 font-semibold text-slate-800">{row.nama}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {isLog ? (
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${row.jenis_absen === 'Datang' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {row.jenis_absen}
                      </span>
                    ) : row.detail}
                  </td>
                  {isLog && <td className="px-6 py-4 text-sm text-slate-500">{new Date(row.waktu).toLocaleString('id-ID')}</td>}
                  {!isLog && (
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => openEdit(row)} className="text-blue-500 hover:text-blue-700 p-2"><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(row.rfid_uid)} className="text-red-500 hover:text-red-700 p-2 ml-2"><Trash2 size={16} /></button>
                    </td>
                  )}
                </tr>
              )) : (
                <tr><td colSpan={5} className="text-center py-10 text-slate-500">Tidak ada data ditemukan.</td></tr>
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
