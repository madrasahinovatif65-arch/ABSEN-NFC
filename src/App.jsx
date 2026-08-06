import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const AVATAR_NETRAL = "https://cdn-icons-png.flaticon.com/512/847/847969.png";

function App() {
  const [time, setTime] = useState(new Date());
  const [nfcInput, setNfcInput] = useState("");
  const [viewState, setViewState] = useState('standby'); // 'standby' | 'result'
  const [resultData, setResultData] = useState(null);
  const [syncStatus, setSyncStatus] = useState("Sistem Siap");
  const inputRef = useRef(null);
  
  const uidTerakhir = useRef("");
  const waktuScanTerakhir = useRef(0);
  const standbyTimer = useRef(null);

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

  const handleKeyPress = async (e) => {
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
        
        await processAbsen(val);
      }
      setNfcInput("");
    }
  };

  const processAbsen = async (uid) => {
    const uidLower = uid.toLowerCase();
    
    // Show instant loading state
    setResultData({
      nama: "Mencari Data...",
      detail: "",
      pesan: `UID: ${uid}`,
      status: "TERBACA",
      warna: "bg-amber-400 text-slate-800",
      foto: AVATAR_NETRAL
    });
    setViewState('result');
    setSyncStatus("Memproses...");

    try {
      // 1. Fetch User Profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('rfid_uid', uidLower)
        .single();

      if (profileError || !profile) {
        showResult({
          nama: "Kartu Tidak Terdaftar!",
          detail: "-",
          pesan: "Hubungi Admin",
          status: "DITOLAK",
          warna: "bg-red-500",
          foto: "https://cdn-icons-png.flaticon.com/512/1828/1828843.png"
        });
        return;
      }

      // 2. Logic Waktu
      const now = new Date();
      const jamDesimal = now.getHours() + (now.getMinutes() / 60);
      const hariID = now.getDay();
      const isGuru = profile.role === 'guru';
      const tanggalHariIni = now.toISOString().split('T')[0];

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

      // 3. Cek Absen Hari Ini
      const { data: attendanceToday, error: attError } = await supabase
        .from('attendance')
        .select('jenis_absen')
        .eq('rfid_uid', uidLower)
        .gte('waktu', `${tanggalHariIni}T00:00:00Z`)
        .lte('waktu', `${tanggalHariIni}T23:59:59Z`);

      const sudahDatang = attendanceToday?.some(a => a.jenis_absen === 'Datang');
      const sudahPulang = attendanceToday?.some(a => a.jenis_absen === 'Pulang');

      let jenisAbsenTercatat = "";
      
      if (jamDesimal <= 7) {
        if (sudahDatang) {
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
        jenisAbsenTercatat = "Datang";
      } else if (jamDesimal > 7 && jamDesimal < batasPulang) {
        showResult({
          nama: profile.nama,
          detail: `${isGuru ? 'Jabatan' : 'Kelas'}: ${profile.detail}`,
          pesan: "Terlambat! Izin Pimpinan.",
          status: "TERKUNCI",
          warna: "bg-red-500",
          foto: profile.foto_url || AVATAR_NETRAL
        });
        return;
      } else {
        if (sudahPulang) {
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
        jenisAbsenTercatat = "Pulang";
      }

      // 4. Insert Attendance
      const { error: insertError } = await supabase
        .from('attendance')
        .insert([{
          rfid_uid: uidLower,
          jenis_absen: jenisAbsenTercatat,
          waktu: new Date().toISOString()
        }]);

      if (insertError) throw insertError;

      showResult({
        nama: profile.nama,
        detail: `${isGuru ? 'Jabatan' : 'Kelas'}: ${profile.detail}`,
        pesan: `Berhasil Absen ${jenisAbsenTercatat}`,
        status: jenisAbsenTercatat.toUpperCase(),
        warna: "bg-green-600 text-white",
        foto: profile.foto_url || AVATAR_NETRAL
      });

    } catch (error) {
      console.error(error);
      showResult({
        nama: "Error Sistem",
        detail: "-",
        pesan: "Gagal terhubung ke database",
        status: "ERROR",
        warna: "bg-red-500",
        foto: AVATAR_NETRAL
      });
    } finally {
      setSyncStatus("Sistem Siap");
    }
  };

  const showResult = (data) => {
    setResultData(data);
    setViewState('result');
    
    if (standbyTimer.current) clearTimeout(standbyTimer.current);
    standbyTimer.current = setTimeout(() => {
      setViewState('standby');
    }, 3000);
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-2 relative">
      <div className="dashboard-canvas bg-white/80 backdrop-blur-md rounded-[2vw] shadow-2xl p-[3vw] flex flex-col justify-between overflow-hidden relative">
        
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
          
          <div className="w-[50%] h-full flex flex-col justify-center items-center text-center">
            <div className="flex flex-col items-center justify-center mb-[2vw] w-full text-center">
              <h1 className="text-[3.8vw] font-black text-slate-800 tracking-tight leading-none mb-[1vw] uppercase">Layar Absensi</h1>
              <div className="flex items-center justify-center gap-[1.2vw] mt-[0.5vw]">
                <img src="https://lh3.googleusercontent.com/d/1k4q401pC_PhtybY9T73snaJj6WzONMds" className="w-[4.5vw] h-[4.5vw] object-contain" onError={(e) => e.target.src='https://cdn-icons-png.flaticon.com/512/847/847969.png'} alt="Logo" />
                <span className="text-[3.2vw] font-extrabold text-green-600 tracking-wide leading-none">Madrasah Inovatif</span>
              </div>
            </div>
            <div className="w-full bg-gradient-to-br from-green-600 to-emerald-700 rounded-[1.5vw] py-[2.5vw] px-[3vw] text-white shadow-lg flex flex-col justify-center items-center">
              <div className="text-[7vw] font-black tracking-widest tabular-nums leading-none">
                {time.toLocaleTimeString('id-ID', { hour12: false })}
              </div>
              <div className="text-[2vw] font-semibold text-green-100 mt-[1vw] uppercase">
                {time.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>

          <div className="w-[45%] h-full bg-slate-50/50 rounded-[2vw] p-[2.5vw] flex flex-col justify-center items-center shadow-inner relative">
            
            {viewState === 'standby' ? (
              <div className="flex flex-col justify-center items-center w-full h-full">
                <div className="relative w-[16vw] h-[16vw] bg-white rounded-full flex items-center justify-center border-2 border-green-100 shadow-md mb-[2vw]">
                  <div className="text-[6vw]">💳</div>
                  <div className="absolute inset-0 rounded-full border-4 border-green-500/20 animate-ping pointer-events-none"></div>
                </div>
                <p className="text-[2vw] font-bold text-slate-600 mb-[2vw] text-center">Silakan Tempelkan<br/>Kartu Anda...</p>
              </div>
            ) : (
              <div className="flex flex-col justify-center items-center w-full h-full">
                <div className="relative w-[16vw] h-[16vw] rounded-full border-[0.4vw] border-green-500 overflow-hidden mb-[1vw] bg-white shadow-lg">
                  <img src={resultData?.foto} className="w-full h-full object-cover" alt="Avatar" onError={(e) => e.target.src=AVATAR_NETRAL} />
                </div>
                
                <h2 className="text-[2.5vw] font-extrabold text-slate-800 text-center leading-tight">{resultData?.nama}</h2>
                
                <p className="text-[1.5vw] font-semibold text-slate-500 text-center mt-[0.2vw]">{resultData?.detail}</p>
                
                <p className={`text-[1.8vw] font-bold text-center mt-[0.5vw] ${resultData?.warna.includes('bg-red') ? 'text-red-500' : 'text-green-600'}`}>
                  {resultData?.pesan}
                </p>
                
                <span className={`mt-[1vw] px-[2.5vw] py-[0.4vw] text-[1.2vw] font-bold rounded-full uppercase shadow-sm ${resultData?.warna}`}>
                  {resultData?.status}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="text-[1.4vw] font-semibold text-slate-400 pt-[1.5vw] border-t border-slate-100 w-full flex justify-between">
          <span>Sistem Absensi Digital v5.0 (Supabase)</span>
          <span className="text-green-600 font-bold">{syncStatus}</span>
        </div>
      </div>
    </div>
  );
}

export default App;
