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
  
  // Idle State (Dimmer)
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef(null);
  
  const inputRef = useRef(null);
  const wakeLockRef = useRef(null);
  
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

  // 1. Clock Timer
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. WakeLock API (Always On)
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      console.warn("WakeLock error:", err);
    }
  };

  useEffect(() => {
    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) wakeLockRef.current.release();
    };
  }, []);

  // 3. Idle Timer (Dimmer) & Autofocus
  const resetIdleTimer = () => {
    setIsIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true);
    }, 30000); // 30 detik idle -> redup
  };

  useEffect(() => {
    resetIdleTimer();
    const handleActivity = () => {
      resetIdleTimer();
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('touchstart', handleActivity); // untuk mobile
    
    if (inputRef.current) inputRef.current.focus();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // 4. Initial Data Fetch
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const cache = {};
        
        const resMurid = await supabase.from('murid').select('*');
        if (resMurid.data) {
          resMurid.data.forEach(p => {
            cache[p.rfid_uid] = { ...p, role: 'murid' };
          });
        }
        
        const resGuru = await supabase.from('guru').select('*');
        if (resGuru.data) {
          resGuru.data.forEach(p => {
            cache[p.rfid_uid] = { ...p, role: 'guru' };
          });
        }

        profilesCache.current = cache;
        const total = (resMurid.data?.length || 0) + (resGuru.data?.length || 0);
        setSyncStatus(`✓ Sistem Siap (${total} Data)`);
      } catch (err) {
        console.error("Gagal memuat profil:", err);
        setSyncStatus("⚠️ Gagal memuat data. Periksa koneksi.");
      }
    };
    
    fetchProfiles();
  }, []);

  // 5. Background Sync Worker
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (syncQueue.current.length === 0 || isSyncing.current) return;
      
      isSyncing.current = true;
      const currentItem = syncQueue.current[0];
      
      try {
        let targetTable = '';
        if (currentItem.role === 'guru') {
          targetTable = currentItem.jenis_absen === 'Pulang' ? 'absensi_guru_pulang' : 'absensi_guru_datang';
        } else {
          targetTable = currentItem.jenis_absen === 'Pulang' ? 'absensi_pulang' : 'absensi_datang';
        }

        const { error } = await supabase.from(targetTable).insert([{
          rfid_uid: currentItem.uid,
          nama: currentItem.nama,
          detail: currentItem.detail,
          jenis_absen: currentItem.jenis_absen,
          waktu: currentItem.waktu
        }]);
        
        if (error) throw error;
        
        syncQueue.current.shift();
        setQueueCount(syncQueue.current.length);
        
        if (syncQueue.current.length === 0) {
          setSyncStatus(`✓ Sistem Siap (${Object.keys(profilesCache.current).length} Data)`);
        } else {
          setSyncStatus(`⏳ Antrean: ${syncQueue.current.length}`);
        }
      } catch (err) {
        console.error(`Gagal sync antrean ke tabel:`, err);
      } finally {
        isSyncing.current = false;
      }
    }, 5000);

    return () => clearInterval(syncInterval);
  }, []);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      const val = nfcInput.trim();
      const sekarang = Date.now();
      
      if (val !== "") {
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
    
    if (tanggalCounterLokal.current !== tapTime.toDateString()) {
      historyLokal.current = {};
      tanggalCounterLokal.current = tapTime.toDateString();
    }

    if (!profile) {
      showResult({
        nama: "Kartu Tidak Dikenal",
        detail: "Akses Ditolak",
        pesan: "Silakan hubungi admin.",
        status: "DITOLAK",
        warna: "text-red-500 bg-red-50",
        foto: AVATAR_NETRAL
      });
      return;
    }

    const jamDesimal = tapTime.getHours() + (tapTime.getMinutes() / 60);
    const hariID = tapTime.getDay();
    const isGuru = profile.role === 'guru';

    if (isGuru && hariID === 0) {
      showResult({
        nama: profile.nama,
        detail: `Jabatan: ${profile.detail}`,
        pesan: "Hari Minggu Libur!",
        status: "DITOLAK",
        warna: "text-red-500 bg-red-50",
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
        warna: "text-amber-600 bg-amber-50",
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
          warna: "text-red-500 bg-red-50",
          foto: profile.foto_url || AVATAR_NETRAL
        });
        return;
      }
      jenisAbsen = "Datang";
      pesan = "Berhasil Absen Datang";
      status = "DATANG";
      warna = "text-emerald-600 bg-emerald-50";
      historyLokal.current[`${uidLower}_datang`] = true;
      
    } else if (jamDesimal > 7.0 && jamDesimal < batasPulang) {
      if (historyLokal.current[`${uidLower}_terlambat`]) {
        showResult({
          nama: profile.nama,
          detail: `${isGuru ? 'Jabatan' : 'Kelas'}: ${profile.detail}`,
          pesan: "Sudah tercatat TERLAMBAT!",
          status: "DITOLAK",
          warna: "text-red-500 bg-red-50",
          foto: profile.foto_url || AVATAR_NETRAL
        });
        return;
      }
      jenisAbsen = "Terlambat";
      pesan = "Tercatat Terlambat!";
      status = "TERLAMBAT";
      warna = "text-amber-600 bg-amber-50";
      historyLokal.current[`${uidLower}_terlambat`] = true;
      
    } else {
      if (historyLokal.current[`${uidLower}_pulang`]) {
        showResult({
          nama: profile.nama,
          detail: `${isGuru ? 'Jabatan' : 'Kelas'}: ${profile.detail}`,
          pesan: "Sudah absen PULANG!",
          status: "DITOLAK",
          warna: "text-red-500 bg-red-50",
          foto: profile.foto_url || AVATAR_NETRAL
        });
        return;
      }
      jenisAbsen = "Pulang";
      pesan = "Berhasil Absen Pulang";
      status = "PULANG";
      warna = "text-emerald-600 bg-emerald-50";
      historyLokal.current[`${uidLower}_pulang`] = true;
    }

    syncQueue.current.push({
      uid: uidLower,
      nama: profile.nama,
      detail: profile.detail,
      role: profile.role,
      jenis_absen: jenisAbsen,
      waktu: tapTime.toISOString()
    });
    setQueueCount(syncQueue.current.length);
    setSyncStatus(`⏳ Antrean: ${syncQueue.current.length}`);

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
    }, 4000);
  };

  // Logic Jam Aktif & Blackout
  const currentJamDesimal = time.getHours() + (time.getMinutes() / 60);
  const currentHariID = time.getDay();
  const isHariMinggu = (currentHariID === 0);
  
  let isActiveHour = false;
  if (!isHariMinggu) {
    if ((currentJamDesimal >= 6.0 && currentJamDesimal <= 7.0) || (currentJamDesimal >= 9.0 && currentJamDesimal <= 13.0)) {
      isActiveHour = true;
    }
  }

  // Overlay Opacity Logic (Diperbaiki)
  let overlayOpacityClass = "opacity-0";
  if (!isActiveHour) {
    overlayOpacityClass = "opacity-100"; // Blackout mati total
  } else if (isIdle) {
    overlayOpacityClass = "opacity-70"; // Redup setelah 30s
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 md:p-8 relative overflow-hidden bg-gradient-to-br from-[#f8fafc] to-[#e2e8f0]">
      
      {/* Layar Redup & Blackout Overlay */}
      <div className={`absolute inset-0 bg-black pointer-events-none z-50 transition-opacity duration-1000 ease-in-out ${overlayOpacityClass}`}></div>
      
      {/* Main Glass/Premium Card Container */}
      <div className="w-full max-w-[1600px] h-full min-h-[90vh] flex flex-col justify-between bg-white/80 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-white/60 p-6 md:p-10 relative">
        
        <input 
          ref={inputRef}
          type="text" 
          value={nfcInput}
          onChange={(e) => setNfcInput(e.target.value)}
          onKeyPress={handleKeyPress}
          onBlur={() => setTimeout(() => inputRef.current?.focus(), 10)}
          className="absolute left-[-9999px] opacity-0"
          autoFocus
          autoComplete="off" 
        />

        {/* Top/Middle Section Responsive Layout */}
        <div className="w-full flex flex-col md:flex-row items-stretch flex-grow gap-8 md:gap-12 mb-8">
          
          {/* Left Panel - Identity & Clock */}
          <div className="w-full md:w-1/2 flex flex-col justify-center">
            
            <div className="flex flex-col items-center md:items-start mb-8 md:mb-12 px-2">
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-slate-800 uppercase tracking-tight leading-none mb-3">
                Layar Absensi
              </h1>
              <div className="flex items-center gap-3">
                <img src="https://lh3.googleusercontent.com/d/1k4q401pC_PhtybY9T73snaJj6WzONMds" className="w-10 h-10 md:w-14 md:h-14 object-contain drop-shadow-sm" onError={(e) => e.target.src='https://cdn-icons-png.flaticon.com/512/847/847969.png'} alt="Logo" />
                <span className="text-xl md:text-3xl font-bold text-emerald-700 tracking-wide">Madrasah Inovatif</span>
              </div>
            </div>
            
            <div className="w-full bg-gradient-to-br from-emerald-600 to-green-700 rounded-[2rem] py-10 px-8 flex flex-col justify-center items-center shadow-[0_15px_30px_rgba(5,150,105,0.25)] border border-green-500/30 transform transition-transform duration-300 hover:scale-[1.02]">
              <div className="text-6xl md:text-8xl lg:text-[7.5rem] font-black text-white tracking-[0.1em] leading-none font-mono drop-shadow-md">
                {time.toLocaleTimeString('id-ID', { hour12: false }).replace(/:/g, '.')}
              </div>
              <div className="text-base md:text-2xl font-semibold text-green-100 mt-4 uppercase tracking-widest drop-shadow-sm text-center">
                {time.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Right Panel - NFC Interaction Area */}
          <div className="w-full md:w-1/2 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 flex flex-col justify-center items-center relative overflow-hidden shadow-inner py-16 md:py-0">
            
            {/* Standby State */}
            <div className={`absolute inset-0 flex flex-col justify-center items-center w-full h-full transition-all duration-700 ease-in-out ${viewState === 'standby' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
              
              <div className="ripple-container mb-8">
                {/* Ripple Animation Waves */}
                <div className="ripple-circle"></div>
                <div className="ripple-circle ripple-delay-1"></div>
                <div className="ripple-circle ripple-delay-2"></div>
                
                {/* Center NFC Icon */}
                <div className="relative w-32 h-32 md:w-44 md:h-44 rounded-full bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)] ring-1 ring-slate-100 flex items-center justify-center z-10 transform transition-transform hover:scale-110">
                  <span className="text-5xl md:text-7xl">💳</span>
                </div>
              </div>
              
              <p className="text-xl md:text-3xl font-extrabold text-slate-600 text-center leading-snug tracking-tight">
                Silakan Tempelkan<br/>Kartu Anda
              </p>
            </div>
            
            {/* Result State */}
            <div className={`absolute inset-0 flex flex-col justify-center items-center w-full h-full transition-all duration-500 ease-in-out bg-white/40 backdrop-blur-md ${viewState === 'result' ? 'opacity-100 scale-100' : 'opacity-0 scale-110 pointer-events-none'}`}>
              <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full border-4 md:border-[6px] overflow-hidden mb-6 shadow-xl bg-white ${resultData?.warna.includes('text-red') ? 'border-red-500 shadow-red-500/20' : (resultData?.warna.includes('text-amber') ? 'border-amber-500 shadow-amber-500/20' : 'border-emerald-600 shadow-emerald-600/20')}`}>
                <img src={resultData?.foto} className="w-full h-full object-cover" alt="Avatar" onError={(e) => e.target.src=AVATAR_NETRAL} />
              </div>
              
              <h2 className="text-2xl md:text-4xl font-black text-slate-800 text-center leading-tight px-4 max-w-[90%] break-words">
                {resultData?.nama}
              </h2>
              
              <p className="text-base md:text-xl font-bold text-slate-500 text-center mt-2 px-6 py-1 rounded-full bg-slate-100/80">
                {resultData?.detail}
              </p>
              
              <div className={`mt-6 px-8 py-3 rounded-2xl font-black text-xl md:text-3xl tracking-wide shadow-sm text-center ${resultData?.warna}`}>
                <p className="block">{resultData?.pesan}</p>
                <p className="block text-sm md:text-base opacity-80 mt-1 uppercase tracking-widest">{resultData?.status}</p>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="text-xs md:text-base font-semibold text-slate-400 w-full flex justify-between items-end border-t border-slate-100 pt-4">
          <span className="tracking-wide">Sistem Absensi Digital v7.0 (Responsive Premium)</span>
          <span className={`px-4 py-1.5 rounded-full font-bold transition-all shadow-sm ${queueCount > 0 ? 'text-amber-700 bg-amber-100 animate-pulse' : 'text-emerald-700 bg-emerald-100'}`}>
            {syncStatus}
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
