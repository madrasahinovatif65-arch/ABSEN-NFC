import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

const AVATAR_NETRAL = "https://cdn-icons-png.flaticon.com/512/847/847969.png";

function App() {
  const [time, setTime] = useState(new Date());
  const [nfcInput, setNfcInput] = useState("");
  const [viewState, setViewState] = useState('standby'); // 'standby' | 'result'
  const [resultData, setResultData] = useState(null);
  
  // Status Sync & Offline
  const [syncStatus, setSyncStatus] = useState("Mengunduh Data...");
  const [queueCount, setQueueCount] = useState(0);
  
  const inputRef = useRef(null);
  
  // Local Caches
  const profilesCache = useRef({});
  const historyLokal = useRef({});
  const syncQueue = useRef([]);
  const isSyncing = useRef(false);
  
  // Timing references
  const uidTerakhir = useRef("");
  const waktuScanTerakhir = useRef(0);
  const standbyTimer = useRef(null);
  const tanggalCounterLokal = useRef(new Date().toDateString());

  // Clock Timer
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Autofocus Input
  useEffect(() => {
    const focusInput = () => {
      if (inputRef.current) inputRef.current.focus();
    };
    focusInput();
    document.addEventListener('click', focusInput);
    return () => document.removeEventListener('click', focusInput);
  }, []);

  // Initial Data Fetch
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('*');
        if (error) throw error;
        
        const cache = {};
        data.forEach(p => {
          cache[p.rfid_uid] = p;
        });
        profilesCache.current = cache;
        setSyncStatus(`✓ Sistem Siap (${data.length} Data)`);
      } catch (err) {
        console.error("Gagal memuat profil:", err);
        setSyncStatus("⚠️ Gagal memuat data. Periksa koneksi.");
      }
    };
    
    fetchProfiles();
  }, []);

  // Background Sync Worker
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (syncQueue.current.length === 0 || isSyncing.current) return;
      
      isSyncing.current = true;
      const currentItem = syncQueue.current[0];
      
      try {
        const { error } = await supabase.from('attendance').insert([{
          rfid_uid: currentItem.uid,
          jenis_absen: currentItem.jenis_absen,
          waktu: currentItem.waktu
        }]);
        
        if (error) throw error;
        
        // Remove from queue on success
        syncQueue.current.shift();
        setQueueCount(syncQueue.current.length);
        
        if (syncQueue.current.length === 0) {
          setSyncStatus(`✓ Sistem Siap (${Object.keys(profilesCache.current).length} Data)`);
        } else {
          setSyncStatus(`⏳ Antrean: ${syncQueue.current.length}`);
        }
      } catch (err) {
        console.error("Gagal sync antrean:", err);
        // Biarkan di antrean untuk dicoba lagi nanti
      } finally {
        isSyncing.current = false;
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(syncInterval);
  }, []);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      const val = nfcInput.trim();
      const sekarang = Date.now();
      
      if (val !== "") {
        // Prevent duplicate fast scans
        if (val === uidTerakhir.current && (sekarang - waktuScanTerakhir.current) < 4000) {
          setNfcInput("");
          return;
        }
        uidTerakhir.current = val;
        waktuScanTerakhir.current = sekarang;
        
        processAbsen(val, new Date());
      }
      setNfcInput("");
    }
  };

  const processAbsen = (uid, tapTime) => {
    const uidLower = uid.toLowerCase();
    const profile = profilesCache.current[uidLower];
    
    // Reset local history if day changes
    if (tanggalCounterLokal.current !== tapTime.toDateString()) {
      historyLokal.current = {};
      tanggalCounterLokal.current = tapTime.toDateString();
    }

    if (!profile) {
      showResult({
        nama: "Kartu Tidak Terdaftar!",
        detail: "-",
        pesan: "Hubungi Admin",
        status: "DITOLAK",
        warna: "bg-red-500",
        foto: AVATAR_NETRAL
      });
      return;
    }

    // Logic Waktu
    const jamDesimal = tapTime.getHours() + (tapTime.getMinutes() / 60);
    const hariID = tapTime.getDay();
    const isGuru = profile.role === 'guru';

    if (isGuru && hariID === 0) {
      showResult({
        nama: profile.nama,
        detail: `Jabatan: ${profile.detail}`,
        pesan: "Hari Minggu Libur!",
        status: "DITOLAK",
        warna: "bg-red-500",
        foto: profile.foto_url || AVATAR_NETRAL
      });
      return;
    }

    let batasPulang = 9;
    if (isGuru) {
      batasPulang = (hariID === 5) ? 10.5 : 12.0;
    }

    let jenisAbsen = "";
    let pesan = "";
    let status = "";
    let warna = "";

    if (jamDesimal < 6.0) {
      showResult({
        nama: profile.nama,
        detail: `${isGuru ? 'Jabatan' : 'Kelas'}: ${profile.detail}`,
        pesan: "Belum waktunya absen!",
        status: "DITOLAK",
        warna: "bg-amber-500 text-white",
        foto: profile.foto_url || AVATAR_NETRAL
      });
      return;
    } else if (jamDesimal >= 6.0 && jamDesimal <= 7.0) {
      if (historyLokal.current[`${uidLower}_datang`]) {
        showResult({
          nama: profile.nama,
          detail: `${isGuru ? 'Jabatan' : 'Kelas'}: ${profile.detail}`,
          pesan: "Sudah absen DATANG!",
          status: "DITOLAK",
          warna: "bg-red-500",
          foto: profile.foto_url || AVATAR_NETRAL
        });
        return;
      }
      jenisAbsen = "Datang";
      pesan = "Berhasil Absen Datang";
      status = "DATANG";
      warna = "bg-green-600 text-white";
      historyLokal.current[`${uidLower}_datang`] = true;
      
    } else if (jamDesimal > 7.0 && jamDesimal < batasPulang) {
      if (historyLokal.current[`${uidLower}_terlambat`]) {
        showResult({
          nama: profile.nama,
          detail: `${isGuru ? 'Jabatan' : 'Kelas'}: ${profile.detail}`,
          pesan: "Sudah tercatat TERLAMBAT!",
          status: "DITOLAK",
          warna: "bg-red-500",
          foto: profile.foto_url || AVATAR_NETRAL
        });
        return;
      }
      jenisAbsen = "Terlambat";
      pesan = "Tercatat Terlambat!";
      status = "TERLAMBAT";
      warna = "bg-amber-500 text-white";
      historyLokal.current[`${uidLower}_terlambat`] = true;
      
    } else {
      if (historyLokal.current[`${uidLower}_pulang`]) {
        showResult({
          nama: profile.nama,
          detail: `${isGuru ? 'Jabatan' : 'Kelas'}: ${profile.detail}`,
          pesan: "Sudah absen PULANG!",
          status: "DITOLAK",
          warna: "bg-red-500",
          foto: profile.foto_url || AVATAR_NETRAL
        });
        return;
      }
      jenisAbsen = "Pulang";
      pesan = "Berhasil Absen Pulang";
      status = "PULANG";
      warna = "bg-green-600 text-white";
      historyLokal.current[`${uidLower}_pulang`] = true;
    }

    // Add to sync queue
    syncQueue.current.push({
      uid: uidLower,
      jenis_absen: jenisAbsen,
      waktu: tapTime.toISOString() // Catat waktu asli saat tap
    });
    setQueueCount(syncQueue.current.length);
    setSyncStatus(`⏳ Antrean: ${syncQueue.current.length}`);

    // Optimistic UI Update (Instant Response)
    showResult({
      nama: profile.nama,
      detail: `${isGuru ? 'Jabatan' : 'Kelas'}: ${profile.detail}`,
      pesan: pesan,
      status: status,
      warna: warna,
      foto: profile.foto_url || AVATAR_NETRAL
    });
  };

  const showResult = (data) => {
    setResultData(data);
    setViewState('result');
    
    if (standbyTimer.current) clearTimeout(standbyTimer.current);
    standbyTimer.current = setTimeout(() => {
      setViewState('standby');
    }, 3500); // 3.5 detik ditahan agar mudah dibaca
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-2 relative overflow-hidden bg-gradient-to-br from-[#e8f5e9] to-[#c8e6c9]">
      <div className="dashboard-canvas bg-white/80 backdrop-blur-xl border border-white/40 rounded-[2vw] shadow-2xl p-[3vw] flex flex-col justify-between relative w-[96vw] h-[92vh]">
        
        <input 
          ref={inputRef}
          type="text" 
          value={nfcInput}
          onChange={(e) => setNfcInput(e.target.value)}
          onKeyPress={handleKeyPress}
          className="absolute left-[-9999px] opacity-0"
          autoFocus
          autoComplete="off" 
        />

        <div className="w-full flex flex-row items-center justify-between flex-grow min-h-0 gap-[3vw]">
          
          {/* Left Panel */}
          <div className="w-[50%] h-full flex flex-col justify-center items-center text-center">
            <div className="flex flex-col items-center justify-center mb-[2vw] w-full text-center">
              <h1 className="text-[3.8vw] font-black text-slate-800 tracking-tight leading-none mb-[1vw] uppercase drop-shadow-sm">
                Layar Absensi
              </h1>
              <div className="flex items-center justify-center gap-[1.2vw] mt-[0.5vw]">
                <img src="https://lh3.googleusercontent.com/d/1k4q401pC_PhtybY9T73snaJj6WzONMds" className="w-[4.5vw] h-[4.5vw] object-contain drop-shadow-md" onError={(e) => e.target.src='https://cdn-icons-png.flaticon.com/512/847/847969.png'} alt="Logo" />
                <span className="text-[3.2vw] font-extrabold text-green-600 tracking-wide leading-none">Madrasah Inovatif</span>
              </div>
            </div>
            
            <div className="w-full bg-gradient-to-br from-green-600 to-emerald-700 rounded-[1.5vw] py-[2.5vw] px-[3vw] text-white shadow-[0_1vw_2vw_rgba(5,150,105,0.3)] border border-green-500/50 flex flex-col justify-center items-center transform transition-all hover:scale-[1.02]">
              <div className="text-[7vw] font-black tracking-widest tabular-nums leading-none drop-shadow-md">
                {time.toLocaleTimeString('id-ID', { hour12: false })}
              </div>
              <div className="text-[2vw] font-semibold text-green-100 mt-[1vw] uppercase tracking-wider">
                {time.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="w-[45%] h-full bg-slate-50/70 backdrop-blur-sm rounded-[2vw] p-[2.5vw] flex flex-col justify-center items-center shadow-inner border border-slate-200/50 relative overflow-hidden">
            
            <div className={`absolute inset-0 flex flex-col justify-center items-center w-full h-full transition-all duration-500 ease-in-out ${viewState === 'standby' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
              <div className="relative w-[16vw] h-[16vw] bg-white rounded-full flex items-center justify-center border-2 border-green-100 shadow-[0_0.5vw_1vw_rgba(0,0,0,0.05)] mb-[2vw]">
                <div className="text-[6vw]">💳</div>
                <div className="absolute inset-0 rounded-full border-[0.3vw] border-green-500/20 animate-ping pointer-events-none"></div>
              </div>
              <p className="text-[2vw] font-bold text-slate-600 mb-[2vw] text-center leading-snug">
                Silakan Tempelkan<br/>Kartu Anda...
              </p>
            </div>
            
            <div className={`absolute inset-0 flex flex-col justify-center items-center w-full h-full transition-all duration-500 ease-in-out ${viewState === 'result' ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'}`}>
              <div className="relative w-[16vw] h-[16vw] rounded-full border-[0.4vw] border-green-500 overflow-hidden mb-[1vw] bg-white shadow-[0_1vw_2vw_rgba(0,0,0,0.15)] ring-4 ring-green-100 transition-all">
                <img src={resultData?.foto} className="w-full h-full object-cover" alt="Avatar" onError={(e) => e.target.src=AVATAR_NETRAL} />
              </div>
              
              <h2 className="text-[2.5vw] font-extrabold text-slate-800 text-center leading-tight tracking-tight mt-[0.5vw] px-[1vw]">
                {resultData?.nama}
              </h2>
              
              <p className="text-[1.5vw] font-semibold text-slate-500 text-center mt-[0.2vw] bg-slate-100 px-[1.5vw] py-[0.2vw] rounded-full">
                {resultData?.detail}
              </p>
              
              <p className={`text-[1.8vw] font-black text-center mt-[1vw] drop-shadow-sm ${resultData?.warna.includes('bg-red') ? 'text-red-500' : (resultData?.warna.includes('bg-amber') ? 'text-amber-500' : 'text-green-600')}`}>
                {resultData?.pesan}
              </p>
              
              <span className={`mt-[1vw] px-[3vw] py-[0.5vw] text-[1.4vw] font-bold rounded-full uppercase shadow-md tracking-wider ${resultData?.warna}`}>
                {resultData?.status}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-[1.4vw] font-semibold text-slate-400 pt-[1.5vw] border-t border-slate-200/60 w-full flex justify-between items-center">
          <span>Sistem Absensi Digital v5.1 (Optimized)</span>
          <span className={`font-bold px-[1vw] py-[0.2vw] rounded-full transition-colors ${queueCount > 0 ? 'text-amber-600 bg-amber-50 animate-pulse' : 'text-green-600 bg-green-50'}`}>
            {syncStatus}
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
