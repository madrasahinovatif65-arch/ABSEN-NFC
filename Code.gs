function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle("Absensi NFC - Madrasah Inovatif")
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function downloadDatabaseMurid() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dbLokal = {};
  
  // 1. Membaca Data Murid (Pastikan sheet Siswa sudah Anda rename menjadi Murid)
  var sheetMurid = ss.getSheetByName("Murid");
  if (sheetMurid) {
    var dataMurid = sheetMurid.getDataRange().getValues();
    for (var i = 1; i < dataMurid.length; i++) {
      var uid = dataMurid[i][0].toString().toLowerCase();
      var linkFoto = dataMurid[i][3] ? dataMurid[i][3].toString().trim() : "";
      
      dbLokal[uid] = { 
        nama: dataMurid[i][1], 
        kelas: dataMurid[i][2],
        foto: linkFoto,
        role: "murid"
      };
    }
  }

  // 2. Membaca Data Guru
  var sheetGuru = ss.getSheetByName("Guru");
  if (sheetGuru) {
    var dataGuru = sheetGuru.getDataRange().getValues();
    for (var j = 1; j < dataGuru.length; j++) {
      var uidGuru = dataGuru[j][0].toString().toLowerCase();
      var linkFotoGuru = dataGuru[j][3] ? dataGuru[j][3].toString().trim() : "";
      
      dbLokal[uidGuru] = { 
        nama: dataGuru[j][1], 
        kelas: dataGuru[j][2], 
        foto: linkFotoGuru,
        role: "guru"
      };
    }
  }
  
  return dbLokal;
}

function prosesAbsenWeb(uidInput) {
  var lock = LockService.getScriptLock();
  
  if (!lock.tryLock(5000)) {
    return { "status": "failed", "nama": "Sistem Sibuk", "kelas": "-", "message": "Mohon tap ulang", "foto": "https://cdn-icons-png.flaticon.com/512/1828/1828843.png" };
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var waktuSekarang = new Date();
    var tz = Session.getScriptTimeZone();
    
    var dataUser = null;
    var isGuru = false;
    
    // Cari pengguna di sheet Murid
    var sheetMurid = ss.getSheetByName("Murid");
    if (sheetMurid) {
      var dataMurid = sheetMurid.getDataRange().getValues();
      for (var i = 1; i < dataMurid.length; i++) {
        if (dataMurid[i][0].toString().toLowerCase() === uidInput.toString().toLowerCase()) {
          dataUser = { nama: dataMurid[i][1], detail: dataMurid[i][2] };
          break;
        }
      }
    }
    
    // Jika tidak ketemu di Murid, cari di sheet Guru
    if (!dataUser) {
      var sheetGuru = ss.getSheetByName("Guru");
      if (sheetGuru) {
        var dataGuru = sheetGuru.getDataRange().getValues();
        for (var j = 1; j < dataGuru.length; j++) {
          if (dataGuru[j][0].toString().toLowerCase() === uidInput.toString().toLowerCase()) {
            dataUser = { nama: dataGuru[j][1], detail: dataGuru[j][2] };
            isGuru = true;
            break;
          }
        }
      }
    }
    
    if (dataUser) {
      // LOGIKA WAKTU
      var jamStr = Utilities.formatDate(waktuSekarang, tz, "HH:mm");
      var bagianJam = jamStr.split(":");
      var jamDesimal = parseInt(bagianJam[0]) + (parseInt(bagianJam[1]) / 60); 
      
      var tanggalHariIni = Utilities.formatDate(waktuSekarang, tz, "yyyy-MM-dd");
      var hariID = waktuSekarang.getDay(); 
      
      // Filter Libur Guru
      if (isGuru && hariID === 0) {
        return { "status": "failed", "nama": dataUser.nama, "message": "Hari Minggu Libur!", "foto": "https://cdn-icons-png.flaticon.com/512/1828/1828843.png" };
      }
      
      var batasDatang = 7; 
      var batasPulang = 9; // Default murid
      if (isGuru) {
        batasPulang = (hariID === 5) ? 10.5 : 12.0; 
      }
      
      // Pilih Sheet Target Berdasarkan Peran
      var sheetDatang = isGuru ? ss.getSheetByName("Absensi_Guru_Datang") : ss.getSheetByName("Absensi_Datang");
      var sheetPulang = isGuru ? ss.getSheetByName("Absensi_Guru_Pulang") : ss.getSheetByName("Absensi_Pulang");
      
      var sudahDatang = false;
      var sudahPulang = false;
      
      if (sheetDatang && sheetDatang.getLastRow() > 0) {
        var dataDatang = sheetDatang.getDataRange().getValues();
        for (var d = dataDatang.length - 1; d > 0; d--) {
          var rowDateStr = Utilities.formatDate(new Date(dataDatang[d][0]), tz, "yyyy-MM-dd");
          if (rowDateStr !== tanggalHariIni) break;
          
          if (dataDatang[d][1].toString().toLowerCase() === uidInput.toString().toLowerCase()) {
            sudahDatang = true; break;
          }
        }
      }
      
      if (sheetPulang && sheetPulang.getLastRow() > 0) {
        var dataPulang = sheetPulang.getDataRange().getValues();
        for (var p = dataPulang.length - 1; p > 0; p--) {
          var rowDateStrPulang = Utilities.formatDate(new Date(dataPulang[p][0]), tz, "yyyy-MM-dd");
          if (rowDateStrPulang !== tanggalHariIni) break;
          
          if (dataPulang[p][1].toString().toLowerCase() === uidInput.toString().toLowerCase()) {
            sudahPulang = true; break;
          }
        }
      }
      
      var jenisAbsenTercatat = "";
      
      if (jamDesimal <= batasDatang) {
        if (sudahDatang) return { "status": "failed", "nama": dataUser.nama, "message": "Sudah absen DATANG!", "foto": "https://cdn-icons-png.flaticon.com/512/1828/1828843.png" };
        jenisAbsenTercatat = "Datang";
        sheetDatang.appendRow([waktuSekarang, uidInput, dataUser.nama, dataUser.detail, jenisAbsenTercatat]);
        
      } else if (jamDesimal > batasDatang && jamDesimal < batasPulang) {
        return { "status": "failed", "nama": dataUser.nama, "message": "Terlambat! Izin Pimpinan.", "foto": "https://cdn-icons-png.flaticon.com/512/1828/1828843.png" };
        
      } else if (jamDesimal >= batasPulang) {
        if (sudahPulang) return { "status": "failed", "nama": dataUser.nama, "message": "Sudah absen PULANG!", "foto": "https://cdn-icons-png.flaticon.com/512/1828/1828843.png" };
        jenisAbsenTercatat = "Pulang";
        sheetPulang.appendRow([waktuSekarang, uidInput, dataUser.nama, dataUser.detail, jenisAbsenTercatat]);
      }
      
      return { "status": "success", "nama": dataUser.nama, "kelas": dataUser.detail, "message": "Berhasil Absen " + jenisAbsenTercatat, "foto": "https://cdn-icons-png.flaticon.com/512/3135/3135715.png" };
      
    } else {
      return { "status": "failed", "nama": "Kartu Tidak Terdaftar!", "kelas": "-", "message": "Hubungi Admin", "foto": "https://cdn-icons-png.flaticon.com/512/1828/1828843.png" };
    }

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