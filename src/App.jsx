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
    
    if (inputRef.current) inputRef.current.focus();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // 4. Initial Data Fetch (Dua Tabel: Murid & Guru)
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const cache = {};
        
        // Fetch Murid
        const resMurid = await supabase.from('murid').select('*');
        if (resMurid.data) {
          resMurid.data.forEach(p => {
            cache[p.rfid_uid] = { ...p, role: 'murid' };
          });
        }
        
        // Fetch Guru
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

  // 5. Background Sync Worker (Target Tabel Terpisah)
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (syncQueue.current.length === 0 || isSyncing.current) return;
      
      isSyncing.current = true;
      const currentItem = syncQueue.current[0];
      
      try {
        // Tentukan Nama Tabel berdasarkan role & jenis absen
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
        nama: "Kartu Tidak Terdaftar!",
        detail: "-",
        pesan: "Hubungi Admin",
        status: "DITOLAK",
        warna: "bg-red-500",
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

    // Antrekan sinkronisasi ke spesifik tabel
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
    }, 3500);
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

  // Overlay Opacity Logic
  let overlayOpacityClass = "opacity-0";
  if (!isActiveHour) {
    overlayOpacityClass = "opacity-100"; // Blackout mati total
  } else if (isIdle) {
    overlayOpacityClass = "opacity-65"; // Redup setelah 30s
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center relative overflow-hidden bg-[#eaf4eb]">
      
      {/* Layar Redup & Blackout Overlay */}
      <div className={`absolute inset-0 bg-black pointer-events-none z-50 transition-opacity duration-1000 ease-in-out ${overlayOpacityClass}`}></div>
      
      <div className="bg-white rounded-[1.5vw] flex flex-col justify-between relative w-[95vw] h-[92vh] p-[2.5vw] shadow-[0_0_15px_rgba(0,0,0,0.05)]">
        
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

        <div className="w-full flex flex-row items-stretch flex-grow gap-[4vw]">
          
          {/* Left Panel */}
          <div className="w-1/2 flex flex-col justify-center">
            <div className="flex flex-col items-center mb-[1.5vw]">
              <h1 className="text-[3.2vw] font-black text-[#1e293b] uppercase tracking-wide leading-none">
                LAYAR ABSENSI
              </h1>
              <div className="flex items-center gap-[0.8vw] mt-[0.8vw]">
                <img src="https://lh3.googleusercontent.com/d/1k4q401pC_PhtybY9T73snaJj6WzONMds" className="w-[3.5vw] h-[3.5vw] object-contain" onError={(e) => e.target.src='https://cdn-icons-png.flaticon.com/512/847/847969.png'} alt="Logo" />
                <span className="text-[2.6vw] font-bold text-[#15803d] tracking-normal leading-none">Madrasah Inovatif</span>
              </div>
            </div>
            
            <div className="w-full bg-[#108146] rounded-[1vw] py-[2.5vw] px-[3vw] flex flex-col justify-center items-center shadow-md">
              <div className="text-[7.5vw] font-bold text-white tracking-[0.15em] leading-none font-mono">
                {time.toLocaleTimeString('id-ID', { hour12: false }).replace(/:/g, '.')}
              </div>
              <div className="text-[1.6vw] font-medium text-white mt-[1vw] uppercase tracking-wider">
                {time.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="w-1/2 bg-[#f8faf9] rounded-[1.2vw] flex flex-col justify-center items-center relative overflow-hidden">
            
            <div className={`absolute inset-0 flex flex-col justify-center items-center w-full h-full transition-opacity duration-300 ${viewState === 'standby' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <div className="relative w-[16vw] h-[16vw] rounded-full bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center justify-center mb-[2.5vw]">
                 {/* Outer rings */}
                <div className="absolute inset-[-3.5vw] rounded-full border border-[#f0f4f0] -z-10"></div>
                <div className="absolute inset-[-7vw] rounded-full border border-[#f0f4f0] -z-10"></div>
                
                {/* The card icon (You can replace this emoji with an SVG if needed, but styling closely matches) */}
                <div className="text-[6.5vw] text-[#0ea5e9]">💳</div>
              </div>
              <p className="text-[1.8vw] font-bold text-[#475569] text-center leading-snug">
                Silakan Tempelkan<br/>Kartu Anda...
              </p>
            </div>
            
            <div className={`absolute inset-0 flex flex-col justify-center items-center w-full h-full transition-opacity duration-300 ${viewState === 'result' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <div className="w-[14vw] h-[14vw] rounded-full border-[0.4vw] border-[#15803d] overflow-hidden mb-[1.5vw] bg-white shadow-md">
                <img src={resultData?.foto} className="w-full h-full object-cover" alt="Avatar" onError={(e) => e.target.src=AVATAR_NETRAL} />
              </div>
              
              <h2 className="text-[2.2vw] font-extrabold text-[#1e293b] text-center leading-tight px-[1vw]">
                {resultData?.nama}
              </h2>
              
              <p className="text-[1.4vw] font-semibold text-[#64748b] text-center mt-[0.3vw]">
                {resultData?.detail}
              </p>
              
              <p className={`text-[1.8vw] font-black text-center mt-[1vw] ${resultData?.warna.includes('bg-red') ? 'text-red-600' : (resultData?.warna.includes('bg-amber') ? 'text-amber-600' : 'text-[#15803d]')}`}>
                {resultData?.pesan}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-[1.1vw] font-semibold text-[#94a3b8] w-full flex justify-between items-end mt-[2vw]">
          <span>Sistem Absensi Digital v4.4</span>
          <span className={`font-bold transition-colors ${queueCount > 0 ? 'text-amber-500' : 'text-[#15803d]'}`}>
            {syncStatus}
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
