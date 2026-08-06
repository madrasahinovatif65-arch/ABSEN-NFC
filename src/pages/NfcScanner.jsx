import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const AVATAR_NETRAL = "https://cdn-icons-png.flaticon.com/512/847/847969.png";

function NfcScanner() {
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
  const navigate = useNavigate();
  
  // Local Caches & Persistence
  const loadHistory = () => {
    try {
      const savedDate = localStorage.getItem('tanggalCounterLokal');
      const today = new Date().toDateString();
      if (savedDate === today) {
        const savedHistory = localStorage.getItem('historyLokal');
        if (savedHistory) return JSON.parse(savedHistory);
      }
    } catch (e) {}
    return {};
  };

  const saveHistory = (hist, dateStr) => {
    historyLokal.current = hist;
    try {
      localStorage.setItem('historyLokal', JSON.stringify(hist));
      localStorage.setItem('tanggalCounterLokal', dateStr);
    } catch (e) {}
  };

  const profilesCache = useRef({});
  const historyLokal = useRef(loadHistory());
  const counterHarian = useRef({ datang: 0, pulang: 0, terlambat: 0 });
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
    const handleActivity = (e) => {
      resetIdleTimer();
      // Mencegah browser memindahkan fokus saat disentuh, sehingga keyboard virtual TIDAK AKAN pernah muncul
      if (e && (e.type === 'touchstart' || e.type === 'mousedown')) {
        e.preventDefault();
      }
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    };

    // Gunakan passive: false agar preventDefault bisa berfungsi pada touchstart
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('touchstart', handleActivity, { passive: false }); 
    
    if (inputRef.current) inputRef.current.focus();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // 4. Initial Data Fetch
  useEffect(() => {
    const fetchProfilesAndHistory = async () => {
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

        // Fetch Today's History to prevent double tap if app is reloaded
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayISO = todayStart.toISOString();

        // Mulai dari kosong agar data Supabase menjadi sumber kebenaran utama saat refresh
        const freshHist = {}; 
        let cDatang = 0, cPulang = 0, cTerlambat = 0;
        const tables = ['absensi_datang', 'absensi_pulang', 'absensi_guru_datang', 'absensi_guru_pulang'];
        
        let fetchHistorySuccess = true;
        try {
          for (const tbl of tables) {
            const resAbsen = await supabase.from(tbl).select('rfid_uid, jenis_absen').gte('waktu', todayISO);
            if (resAbsen.error) throw resAbsen.error;
            if (resAbsen.data) {
               resAbsen.data.forEach(row => {
                  const jenis = row.jenis_absen.toLowerCase(); // datang, pulang, terlambat
                  freshHist[`${row.rfid_uid}_${jenis}`] = true;
                  
                  if (jenis === 'datang') cDatang++;
                  else if (jenis === 'pulang') cPulang++;
                  else if (jenis === 'terlambat') cTerlambat++;
               });
            }
          }
        } catch (e) {
          fetchHistorySuccess = false;
          console.error("Gagal ambil history Supabase:", e);
        }
        
        // Jika berhasil ambil dari server, timpa cache lokal. Jika gagal (offline), pertahankan cache lokal.
        if (fetchHistorySuccess) {
          saveHistory(freshHist, new Date().toDateString());
          counterHarian.current = { datang: cDatang, pulang: cPulang, terlambat: cTerlambat };
        } else {
          // Hitung ulang dari local storage jika offline
          const keys = Object.keys(historyLokal.current);
          counterHarian.current = {
            datang: keys.filter(k => k.endsWith('_datang')).length,
            pulang: keys.filter(k => k.endsWith('_pulang')).length,
            terlambat: keys.filter(k => k.endsWith('_terlambat')).length,
          };
        }

        const total = (resMurid.data?.length || 0) + (resGuru.data?.length || 0);
        setSyncStatus(`✓ Sistem Siap (${total} Data)`);
      } catch (err) {
        console.error("Gagal memuat profil/histori:", err);
        setSyncStatus("⚠️ Gagal memuat data. Periksa koneksi.");
      }
    };
    
    fetchProfilesAndHistory();
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
    const todayStr = tapTime.toDateString();
    
    if (tanggalCounterLokal.current !== todayStr) {
      tanggalCounterLokal.current = todayStr;
      saveHistory({}, todayStr);
      counterHarian.current = { datang: 0, pulang: 0, terlambat: 0 };
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

    let urutan = 0;

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
    } 
    else if (jamDesimal >= 6.0 && jamDesimal <= 7.0) {
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
      
      counterHarian.current.datang++;
      urutan = counterHarian.current.datang;
      
      const newHist = { ...historyLokal.current };
      newHist[`${uidLower}_datang`] = true;
      saveHistory(newHist, todayStr);
      
    } 
    else if (jamDesimal > 7.0 && jamDesimal < batasPulang) {
      if (historyLokal.current[`${uidLower}_terlambat`] || historyLokal.current[`${uidLower}_datang`]) {
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
      jenisAbsen = "Terlambat";
      pesan = "Anda Terlambat";
      status = "TERLAMBAT";
      warna = "text-amber-600 bg-amber-50";
      
      counterHarian.current.terlambat++;
      urutan = counterHarian.current.terlambat;
      
      const newHist = { ...historyLokal.current };
      newHist[`${uidLower}_terlambat`] = true;
      saveHistory(newHist, todayStr);
    } 
    else if (jamDesimal >= batasPulang) {
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
      
      counterHarian.current.pulang++;
      urutan = counterHarian.current.pulang;
      
      const newHist = { ...historyLokal.current };
      newHist[`${uidLower}_pulang`] = true;
      saveHistory(newHist, todayStr);
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
      urutan: urutan,
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

  // Overlay Opacity Logic (Diperbaiki untuk Maintenance)
  let overlayOpacityClass = "opacity-0";
  if (isIdle) {
    if (!isActiveHour) {
      overlayOpacityClass = "opacity-100"; // Blackout mati total setelah 30 detik di luar jam kerja
    } else {
      overlayOpacityClass = "opacity-70"; // Hanya redup setelah 30 detik saat jam kerja
    }
  } else {
    overlayOpacityClass = "opacity-0"; // Terang benderang (menyala) saat disentuh/ada aktivitas
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#f8fafc] to-[#e2e8f0]">
      
      {/* Layar Redup & Blackout Overlay */}
      <div className={`absolute inset-0 bg-black pointer-events-none z-50 transition-opacity duration-1000 ease-in-out ${overlayOpacityClass}`}></div>
      
      {/* Main Glass/Premium Card Container */}
      <div className="bg-[#ffffffcc] backdrop-blur-3xl rounded-[2vw] shadow-[0_1vw_3vw_rgba(0,0,0,0.06)] border border-[#ffffff99] p-[2.5vw] flex flex-col justify-between relative w-[95vw] h-[92vh]">
        
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
          inputMode="none"
        />

        {/* Layout Split */}
        <div className="w-full flex flex-row items-stretch flex-grow gap-[4vw] mb-[2vw]">
          
          {/* Left Panel */}
          <div className="flex-1 flex flex-col justify-center">
            
            <div className="flex flex-col items-center mb-[2vw] px-[1vw]">
              <h1 className="text-[3.5vw] font-black text-slate-800 uppercase tracking-tight leading-none mb-[1vw]">
                Layar Absensi
              </h1>
              <div 
                className="flex items-center gap-[1vw] cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => navigate('/admin')}
                onMouseDown={(e) => { e.stopPropagation(); navigate('/admin'); }}
                onTouchStart={(e) => { e.stopPropagation(); navigate('/admin'); }}
                title="Masuk ke Panel Admin"
              >
                <img src="https://lh3.googleusercontent.com/d/1k4q401pC_PhtybY9T73snaJj6WzONMds" className="w-[4.5vw] h-[4.5vw] object-contain drop-shadow-sm" onError={(e) => e.target.src='https://cdn-icons-png.flaticon.com/512/847/847969.png'} alt="Logo" />
                <span className="text-[3vw] font-bold text-emerald-700 tracking-wide leading-none">Madrasah Inovatif</span>
              </div>
            </div>
            
            <div 
              className="w-full rounded-[1.2vw] py-[3vw] px-[3vw] flex flex-col justify-center items-center shadow-lg border border-[#22c55e33] transform transition-transform duration-300 hover:scale-[1.02]"
              style={{ background: 'linear-gradient(to bottom, #22a44d, #067734)' }}
            >
              <div className="text-[7.5vw] font-bold text-white tracking-[0.05em] leading-none font-mono drop-shadow-sm">
                {time.toLocaleTimeString('id-ID', { hour12: false }).replace(/:/g, '.')}
              </div>
              <div className="text-[2.2vw] font-bold text-white mt-[1vw] uppercase tracking-wide drop-shadow-sm text-center">
                {time.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Right Panel - NFC Interaction Area */}
          <div className="flex-1 bg-[#f8fafc80] rounded-[2vw] border border-[#f1f5f9] flex flex-col justify-center items-center relative overflow-hidden shadow-inner">
            
            {/* Standby State */}
            <div className={`absolute inset-0 flex flex-col justify-center items-center w-full h-full transition-all duration-700 ease-in-out ${viewState === 'standby' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
              
              <div className="ripple-container mb-[2.5vw]">
                {/* Ripple Animation Waves */}
                <div className="ripple-circle"></div>
                <div className="ripple-circle ripple-delay-1"></div>
                <div className="ripple-circle ripple-delay-2"></div>
                
                {/* Center NFC Icon */}
                <div className="relative w-[12vw] h-[12vw] rounded-full bg-white shadow-[0_1vw_2vw_rgba(0,0,0,0.08)] ring-1 ring-slate-100 flex items-center justify-center z-10 transform transition-transform hover:scale-110">
                  <span className="text-[6vw]">💳</span>
                </div>
              </div>
              
              <p className="text-[2vw] font-extrabold text-slate-600 text-center leading-snug tracking-tight mt-[1.5vw]">
                Silakan Tempelkan<br/>Kartu Anda
              </p>
            </div>
            
            {/* Result State */}
            <div className={`absolute inset-0 flex flex-col justify-center items-center w-full h-full transition-all duration-500 ease-in-out bg-[#ffffff66] backdrop-blur-md ${viewState === 'result' ? 'opacity-100 scale-100' : 'opacity-0 scale-110 pointer-events-none'}`}>
              <div className={`w-[14vw] h-[14vw] rounded-full border-[0.5vw] overflow-hidden mb-[1.5vw] shadow-xl bg-white ${resultData?.warna.includes('text-red') ? 'border-[#ef4444]' : (resultData?.warna.includes('text-amber') ? 'border-[#f59e0b]' : 'border-[#059669]')}`}>
                <img src={resultData?.foto} className="w-full h-full object-cover" alt="Avatar" onError={(e) => e.target.src=AVATAR_NETRAL} />
              </div>
              
              <h2 className="text-[3vw] font-black text-slate-800 text-center leading-tight px-[1vw] max-w-[90%] break-words">
                {resultData?.nama}
              </h2>
              
              <p className="text-[1.5vw] font-bold text-slate-500 text-center mt-[0.5vw] px-[1.5vw] py-[0.2vw] rounded-full bg-[#f1f5f9cc]">
                {resultData?.detail}
              </p>
              
              <div className={`mt-[1.5vw] px-[2vw] py-[0.8vw] rounded-[1vw] font-black text-[2vw] tracking-wide shadow-sm text-center ${resultData?.warna}`}>
                <p className="block">{resultData?.pesan}</p>
                <p className="block text-[1.2vw] opacity-80 mt-[0.2vw] uppercase tracking-widest">
                  {resultData?.status} {resultData?.urutan ? `• URUTAN KE-${resultData.urutan}` : ''}
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="text-[1.2vw] font-semibold text-slate-400 w-full flex justify-between items-end border-t border-slate-100 pt-[1.5vw]">
          <span className="tracking-wide">Sistem Absensi Digital v7.1 (Optimized Landscape)</span>
          <span className={`px-[1.5vw] py-[0.4vw] rounded-full font-bold transition-all shadow-sm ${queueCount > 0 ? 'text-amber-700 bg-amber-100 animate-pulse' : 'text-emerald-700 bg-emerald-100'}`}>
            {syncStatus}
          </span>
        </div>
      </div>
    </div>
  );
}

export default NfcScanner;
