// =========================================================================
// KONFIGURASI SUPABASE
// =========================================================================
var SUPABASE_URL = 'https://yfsemhbuzxdhysglocgh.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlmc2VtaGJ1enhkaHlzZ2xvY2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5OTE3ODIsImV4cCI6MjEwMTU2Nzc4Mn0.GLqDofMptgxB_eeKtwBONcQle1r-F0pjvPg0pqyyP4Y';

function getSupabaseHeaders_() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };
}

// Helper: GET request ke Supabase REST API
function supabaseGet_(endpoint) {
  try {
    var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + endpoint, {
      'method': 'get',
      'headers': getSupabaseHeaders_(),
      'muteHttpExceptions': true
    });
    if (res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText());
    } else {
      Logger.log('Supabase GET error [' + endpoint + ']: ' + res.getContentText());
      return null;
    }
  } catch(e) {
    Logger.log('Supabase GET exception: ' + e.toString());
    return null;
  }
}

// Helper: POST request ke Supabase REST API
function supabasePost_(tableName, payload) {
  try {
    var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + tableName, {
      'method': 'post',
      'headers': getSupabaseHeaders_(),
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      return true;
    } else {
      Logger.log('Supabase POST error [' + tableName + ']: ' + res.getContentText());
      return false;
    }
  } catch(e) {
    Logger.log('Supabase POST exception: ' + e.toString());
    return false;
  }
}

// =========================================================================
// WEB APP ENTRY POINT
// =========================================================================
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle("Absensi NFC - Madrasah Inovatif")
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =========================================================================
// UNDUH DATABASE MASTER USER DARI SUPABASE (FDW fdw_master_user)
// Dipanggil oleh Index.html saat pertama kali load untuk cache lokal.
// Tabel: fdw_master_user (kolom: rfid_uid, nama, detail, foto_url, role)
// =========================================================================
function downloadDatabaseMurid() {
  var dbLokal = {};

  // Query seluruh data dari FDW fdw_master_user
  var data = supabaseGet_('fdw_master_user?select=rfid_uid,nama,detail,foto_url,role');

  if (!data || data.length === 0) {
    Logger.log('Peringatan: Tidak ada data dari tabel master_user.');
    return dbLokal;
  }

  for (var i = 0; i < data.length; i++) {
    var user = data[i];
    if (!user.rfid_uid) continue;
    var uid = user.rfid_uid.toString().toLowerCase().trim();
    dbLokal[uid] = {
      nama: user.nama || 'Tanpa Nama',
      kelas: user.detail || '-',
      foto: user.foto_url || '',
      role: user.role || 'murid'
    };
  }

  Logger.log('Database master_user berhasil diunduh: ' + Object.keys(dbLokal).length + ' pengguna.');
  return dbLokal;
}

// =========================================================================
// PROSES ABSENSI DARI WEB (dipanggil oleh Index.html via google.script.run)
// Lookup user dari Supabase FDW master_user, lalu simpan log ke Supabase.
// Status yang dicatat: Datang, Terlambat, Pulang
// =========================================================================
function prosesAbsenWeb(uidInput) {
  var lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    return { "status": "failed", "nama": "Sistem Sibuk", "kelas": "-", "message": "Mohon tap ulang", "foto": "https://cdn-icons-png.flaticon.com/512/1828/1828843.png" };
  }

  try {
    var waktuSekarang = new Date();
    var tz = Session.getScriptTimeZone();
    var uidLower = uidInput.toString().toLowerCase().trim();

    // ------------------------------------------------------------------
    // 1. CARI USER DI SUPABASE (FDW fdw_master_user)
    // ------------------------------------------------------------------
    var userData = supabaseGet_(
      'fdw_master_user?rfid_uid=eq.' + encodeURIComponent(uidLower) +
      '&select=rfid_uid,nama,detail,foto_url,role&limit=1'
    );

    if (!userData || userData.length === 0) {
      return { "status": "failed", "nama": "Kartu Tidak Terdaftar!", "kelas": "-", "message": "Hubungi Admin", "foto": "https://cdn-icons-png.flaticon.com/512/1828/1828843.png" };
    }

    var user = userData[0];
    var namaUser   = user.nama   || 'Tanpa Nama';
    var detailUser = user.detail || '-';
    var fotoUser   = user.foto_url || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
    var isGuru     = (user.role === 'guru');

    // ------------------------------------------------------------------
    // 2. LOGIKA WAKTU
    // ------------------------------------------------------------------
    var jamStr    = Utilities.formatDate(waktuSekarang, tz, 'HH:mm');
    var bagianJam = jamStr.split(':');
    var jamDesimal = parseInt(bagianJam[0]) + (parseInt(bagianJam[1]) / 60);

    var tanggalHariIni = Utilities.formatDate(waktuSekarang, tz, 'yyyy-MM-dd');
    var hariID = waktuSekarang.getDay(); // 0=Minggu, 5=Jumat

    // Guru libur hari Minggu
    if (isGuru && hariID === 0) {
      return { "status": "failed", "nama": namaUser, "kelas": detailUser, "message": "Hari Minggu Libur!", "foto": fotoUser };
    }

    var batasDatang = 7.0;  // 07:00 - batas akhir absen datang
    var batasPulang = isGuru ? ((hariID === 5) ? 10.5 : 12.0) : 9.0;

    // ------------------------------------------------------------------
    // 3. CEK DUPLIKASI ABSENSI HARI INI DI SUPABASE
    //    Tabel log_absensi: rfid_uid, nama, detail, role, jenis_absen, waktu
    // ------------------------------------------------------------------
    var tanggalMulai = tanggalHariIni + 'T00:00:00.000Z';
    var tanggalAkhir = tanggalHariIni + 'T23:59:59.999Z';

    var logHariIni = supabaseGet_(
      'log_absensi?rfid_uid=eq.' + encodeURIComponent(uidLower) +
      '&waktu=gte.' + tanggalMulai +
      '&waktu=lte.' + tanggalAkhir +
      '&select=jenis_absen'
    );

    var sudahDatang  = false;
    var sudahPulang  = false;

    if (logHariIni && logHariIni.length > 0) {
      for (var k = 0; k < logHariIni.length; k++) {
        var jenis = logHariIni[k].jenis_absen;
        if (jenis === 'Datang' || jenis === 'Terlambat') sudahDatang = true;
        if (jenis === 'Pulang') sudahPulang = true;
      }
    }

    // ------------------------------------------------------------------
    // 4. TENTUKAN JENIS ABSEN & VALIDASI
    // ------------------------------------------------------------------
    var jenisAbsen = '';

    if (jamDesimal <= batasDatang) {
      // Jam datang normal (≤ 07:00)
      if (sudahDatang) {
        return { "status": "failed", "nama": namaUser, "kelas": detailUser, "message": "Sudah absen DATANG!", "foto": fotoUser };
      }
      jenisAbsen = 'Datang';

    } else if (jamDesimal > batasDatang && jamDesimal < batasPulang) {
      // Jam terlambat (07:01 - batas pulang) → DICATAT sebagai Terlambat
      if (sudahDatang) {
        return { "status": "failed", "nama": namaUser, "kelas": detailUser, "message": "Sudah absen DATANG!", "foto": fotoUser };
      }
      jenisAbsen = 'Terlambat';

    } else if (jamDesimal >= batasPulang) {
      // Jam pulang
      if (sudahPulang) {
        return { "status": "failed", "nama": namaUser, "kelas": detailUser, "message": "Sudah absen PULANG!", "foto": fotoUser };
      }
      if (!sudahDatang) {
        // Pulang tanpa pernah datang — tetap dicatat
        jenisAbsen = 'Pulang';
      } else {
        jenisAbsen = 'Pulang';
      }
    }

    // ------------------------------------------------------------------
    // 5. SIMPAN LOG ABSENSI KE SUPABASE (tabel log_absensi)
    // ------------------------------------------------------------------
    var payloadLog = {
      rfid_uid   : uidLower,
      nama       : namaUser,
      detail     : detailUser,
      role       : user.role || 'murid',
      jenis_absen: jenisAbsen,
      waktu      : waktuSekarang.toISOString()
    };

    var berhasil = supabasePost_('log_absensi', payloadLog);

    if (!berhasil) {
      return { "status": "failed", "nama": namaUser, "kelas": detailUser, "message": "Gagal simpan log. Coba lagi.", "foto": fotoUser };
    }

    // ------------------------------------------------------------------
    // 6. KEMBALIKAN HASIL KE LAYAR
    // ------------------------------------------------------------------
    var pesanStatus = 'Berhasil Absen ' + jenisAbsen;
    return {
      "status" : "success",
      "nama"   : namaUser,
      "kelas"  : detailUser,
      "message": pesanStatus,
      "foto"   : fotoUser
    };

  } finally {
    lock.releaseLock();
  }
}

// ROBOT OTOMATIS (DIMATIKAN)
function autoAbsenLupaPulang() {
  // Fungsi ini sengaja dikosongkan untuk mematikan fitur robot auto pulang.
  return;
}

// =========================================================================
// SCRIPT MIGRASI KE SUPABASE (TABEL TERPISAH SESUAI SHEET)
// =========================================================================
function migrateToSupabase() {
  var SUPABASE_URL = 'https://yfsemhbuzxdhysglocgh.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlmc2VtaGJ1enhkaHlzZ2xvY2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5OTE3ODIsImV4cCI6MjEwMTU2Nzc4Mn0.GLqDofMptgxB_eeKtwBONcQle1r-F0pjvPg0pqyyP4Y';
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  
  // Opsi dasar request
  var baseOptions = {
    'method': 'post',
    'contentType': 'application/json',
    'headers': {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=minimal'
    },
    'muteHttpExceptions': true
  };
  
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var sheetName = sheet.getName();
    var tableName = sheetName.toLowerCase().trim(); // Endpoint tabel = nama sheet lowercase
    
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) continue; 
    
    var headers = data[0].map(function(h) { return h.toString().toLowerCase().trim(); });
    var payloadData = [];
    
    // ==========================================
    // 1. JIKA SHEET ADALAH SHEET ABSENSI
    // ==========================================
    if (tableName.indexOf('absen') !== -1) {
      var wktIdx = headers.findIndex(function(h) { return h.indexOf('waktu') !== -1 || h.indexOf('tanggal') !== -1 || h.indexOf('time') !== -1; });
      var idIdx = headers.findIndex(function(h) { return h === 'uid' || h === 'id' || h.indexOf('rfid') !== -1 || h.indexOf('nfc') !== -1 || h.indexOf('kartu') !== -1; });
      var jnsIdx = headers.findIndex(function(h) { return h.indexOf('jenis') !== -1 || h.indexOf('keterangan') !== -1 || h.indexOf('status') !== -1; });
      var namaIdx = headers.findIndex(function(h) { return h.indexOf('nama') !== -1 || h.indexOf('name') !== -1; });
      var detailIdx = headers.findIndex(function(h) { return h.indexOf('kelas') !== -1 || h.indexOf('jabatan') !== -1 || h.indexOf('detail') !== -1; });
      
      // Fallback
      if (idIdx === -1 && headers.length > 0) { wktIdx = 0; idIdx = 1; namaIdx = 2; detailIdx = 3; }
      if (idIdx === -1) continue; 
      
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (row[idIdx] && row[wktIdx]) {
          var jns = "Datang";
          if (jnsIdx !== -1 && row[jnsIdx]) jns = row[jnsIdx].toString();
          else if (tableName.indexOf('pulang') !== -1) jns = "Pulang";
          else if (tableName.indexOf('terlambat') !== -1) jns = "Terlambat";
          
          var wkt = row[wktIdx];
          var wktStr = "";
          try {
            if (Object.prototype.toString.call(wkt) === '[object Date]') wktStr = wkt.toISOString();
            else wktStr = new Date(wkt).toISOString();
          } catch(e) { wktStr = new Date().toISOString(); }

          payloadData.push({
            rfid_uid: row[idIdx].toString().toLowerCase().trim(),
            nama: (namaIdx !== -1 && row[namaIdx]) ? row[namaIdx].toString().trim() : "",
            detail: (detailIdx !== -1 && row[detailIdx]) ? row[detailIdx].toString().trim() : "-",
            jenis_absen: jns,
            waktu: wktStr
          });
        }
      }
    }
    // ==========================================
    // 2. JIKA SHEET ADALAH SHEET PROFIL (MURID/GURU)
    // ==========================================
    else if (tableName === 'murid' || tableName === 'guru') {
      var uidIdx = headers.findIndex(function(h) { return h === 'uid' || h === 'id' || h.indexOf('rfid') !== -1 || h.indexOf('nfc') !== -1; });
      var namaIdx = headers.findIndex(function(h) { return h.indexOf('nama') !== -1 || h.indexOf('name') !== -1; });
      var detailIdx = headers.findIndex(function(h) { return h.indexOf('kelas') !== -1 || h.indexOf('jabatan') !== -1 || h.indexOf('detail') !== -1; });
      var fotoIdx = headers.findIndex(function(h) { return h.indexOf('foto') !== -1 || h.indexOf('link') !== -1 || h.indexOf('url') !== -1; });

      // Fallback
      if (uidIdx === -1 && headers.length > 0 && headers[0] !== "") { uidIdx = 0; namaIdx = 1; detailIdx = 2; fotoIdx = 3; }
      if (uidIdx === -1) continue;
      
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (row[uidIdx]) {
          payloadData.push({
            rfid_uid: row[uidIdx].toString().toLowerCase().trim(),
            nama: (namaIdx !== -1 && row[namaIdx]) ? row[namaIdx].toString().trim() : "",
            detail: (detailIdx !== -1 && row[detailIdx]) ? row[detailIdx].toString().trim() : "-",
            foto_url: (fotoIdx !== -1 && row[fotoIdx]) ? row[fotoIdx].toString().trim() : ""
          });
        }
      }
    }
    // ==========================================
    // 3. JIKA SHEET ADALAH SHEET DP (DP_Murid / DP_Guru)
    // ==========================================
    else if (tableName.indexOf('dp_') === 0) {
      var uidIdx = headers.findIndex(function(h) { return h === 'uid' || h === 'id' || h.indexOf('rfid') !== -1; });
      var namaIdx = headers.findIndex(function(h) { return h.indexOf('nama') !== -1 || h.indexOf('name') !== -1; });
      var ketIdx = headers.findIndex(function(h) { return h.indexOf('keterangan') !== -1 || h.indexOf('detail') !== -1; });
      
      if (uidIdx === -1 && headers.length > 0) { uidIdx = 0; namaIdx = 1; ketIdx = 2; }
      if (uidIdx === -1) continue;
      
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (row[uidIdx]) {
          payloadData.push({
            rfid_uid: row[uidIdx].toString().toLowerCase().trim(),
            nama: (namaIdx !== -1 && row[namaIdx]) ? row[namaIdx].toString().trim() : "",
            keterangan: (ketIdx !== -1 && row[ketIdx]) ? row[ketIdx].toString().trim() : "-"
          });
        }
      }
    }

    // ==========================================
    // KIRIM PAYLOAD UNTUK SHEET INI KE TABELNYA SENDIRI
    // ==========================================
    if (payloadData.length > 0) {
      var endpoint = SUPABASE_URL + '/rest/v1/' + tableName; // Sesuai nama tabel!
      
      var options = Object.assign({}, baseOptions);
      options.payload = JSON.stringify(payloadData);
      
      var res = UrlFetchApp.fetch(endpoint, options);
      if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
        Logger.log("✅ Berhasil migrasi " + payloadData.length + " data dari sheet '" + sheetName + "' ke tabel '" + tableName + "'.");
      } else {
        Logger.log("❌ Gagal migrasi sheet '" + sheetName + "'. Error: " + res.getContentText());
      }
    }
  }
}