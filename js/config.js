// =====================================================================
//  KONFIGURASI UTAMA — ubah angka/nama di sini tanpa menyentuh kode lain
// =====================================================================
export const CONFIG = {
  // Lokasi model. Taruh Hoshino.glb di folder models/ (atau pilih lewat tombol di halaman).
  MODEL_URL: "models/Hoshino.glb",

  // Animasi yang diputar terus-menerus saat diam. (Cafe_Idle cocok karena tanpa senjata.)
  IDLE_CLIP: "Cafe_Idle",

  // Mesh dengan nama cocok regex ini disembunyikan (senjata & perisai).
  HIDE_NODE_REGEX: /weapon|shield/i,

  // Kamera. Model tingginya ~1 unit, kepalanya di sekitar y = 0.7.
  CAMERA: { fov: 30, position: [0, 0.62, 2.7], target: [0, 0.55, 0] },

  // Kepala mengikuti tangan (radian) dan kehalusan gerak.
  LOOK: { maxYaw: 0.6, maxPitch: 0.35, neckShare: 0.4, smooth: 7 },

  // ---------------- Gestur tangan -> reaksi ----------------
  // Nama gestur berasal dari MediaPipe Gesture Recognizer:
  // Closed_Fist, Open_Palm, Pointing_Up, Thumb_Down, Thumb_Up, Victory, ILoveYou
  // clip    : nama animasi (lihat daftar di panel "Animasi" untuk mencoba satu-satu)
  // action  : kalimat yang dikirim ke AI sebagai "aksi" pengguna
  // line    : balasan cadangan kalau AI mati / gagal
  GESTURES: {
    Thumb_Up:     { clip: "Victory_Start",   action: "*Sensei mengacungkan jempol*",            line: "Hehe... makasih, Sensei.",                    emotion: "happy" },
    Victory:      { clip: "Public01",        action: "*Sensei membuat tanda peace*",             line: "Peace ya... uhe~",                            emotion: "happy" },
    ILoveYou:     { clip: "Cafe_Reaction",   action: "*Sensei membuat tanda 'I love you'*",      line: "E-eh? Jangan tiba-tiba begitu, Sensei...",    emotion: "shy" },
    Pointing_Up:  { clip: "Normal_Callsign", action: "*Sensei menunjuk ke atas*",                line: "Hm? Ada apa di atas sana?",                   emotion: "neutral" },
    Thumb_Down:   { clip: "Vital_Panic",     action: "*Sensei menunjukkan jempol ke bawah*",     line: "Eh... aku salah apa, Sensei?",                emotion: "surprised" },
    Closed_Fist:  { clip: "Vital_Panic",     action: "*Sensei mengepalkan tangan di depannya*",  line: "A-aku nggak bikin salah, kan...?",            emotion: "surprised" },
  },
  GESTURE_HOLD: 0.45,       // gestur harus bertahan segini lama (detik)
  GESTURE_COOLDOWN: 2.5,    // jeda antar-reaksi gestur (detik)

  // Melambai (tangan bolak-balik kiri-kanan)
  WAVE: {
    clip: "Public01", action: "*Sensei melambaikan tangan*", line: "Oh, halo Sensei... uhe~", emotion: "happy",
    window: 1.4,            // jendela pengamatan (detik)
    swing: 0.06,            // jarak ayunan minimal (0..1 lebar layar)
    minReversals: 3,        // minimal berapa kali arah berbalik
    cooldown: 3.5,
  },

  // Headpat (tangan di atas kepala karakter sambil digerakkan)
  PAT: {
    clip: "Cafe_Reaction", action: "*Sensei mengelus kepalamu*", line: "...Mmn. Enak. Lanjutin aja, Sensei.", emotion: "shy",
    headOffsetY: 0.22,      // titik tengah area "kepala" di atas tulang kepala (unit model)
    radiusFactor: 0.16,     // radius area kepala = faktor x tinggi layar
    holdSeconds: 0.4,       // tangan harus berada di area kepala selama ini
    minPath: 0.05,          // tangan harus bergerak (jarak tempuh minimal, 0..1)
    cooldown: 4,
  },

  // Emosi balasan AI -> animasi (null = tetap idle)
  EMOTION_TO_CLIP: { happy: "Victory_Start", shy: "Cafe_Reaction", surprised: "Vital_Panic", sleepy: null, neutral: null },

  // Mulut yang dipakai saat bicara (bisa diubah di panel "Mulut"; tersimpan di browser)
  MOUTH_TALK_DEFAULT: ["Mouth_401", "Mouth_402", "Mouth_404"],
  TALK_FLAP_MS: 130,        // ganti bentuk mulut tiap sekian ms
  TYPE_MS: 28,              // kecepatan teks muncul per huruf
};