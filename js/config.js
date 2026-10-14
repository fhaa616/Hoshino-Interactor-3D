// =====================================================================
//  KONFIGURASI UTAMA — ubah angka/nama di sini tanpa menyentuh kode lain
// =====================================================================
export const CONFIG = {
  // Mesh dengan nama cocok regex ini disembunyikan (senjata & perisai).
  HIDE_NODE_REGEX: /weapon|shield/i,

  // Kamera bawaan. Bisa ditimpa per karakter lewat `camera` di CHARACTERS.
  CAMERA: { fov: 30, position: [0, 0.62, 2.7], target: [0, 0.55, 0] },

  // Menoleh (radian). Ini nilai dasar; tiap karakter bisa menimpanya lewat `look`,
  // dan bisa diatur langsung lewat slider di panel (tersimpan per karakter).
  //  maxYaw/maxPitch : sudut maksimum kiri-kanan / atas-bawah
  //  neckShare       : porsi putaran yang ditanggung leher (sisanya kepala)
  LOOK: { maxYaw: 0.6, maxPitch: 0.35, neckShare: 0.4, smooth: 7 },

  // ===================================================================
  //  KARAKTER
  //  Nama animasi di tiap file .glb berbeda-beda, jadi setiap karakter
  //  punya "peta peran": peran (victory, public, ...) -> nama klip ASLI.
  //  Kode lain hanya memakai nama peran, tidak pernah nama klip langsung.
  //
  //  files     : daftar kemungkinan nama file (dicoba berurutan)
  //  idle      : klip yang berputar terus saat diam
  //  clips     : peta peran -> nama klip
  //  mouthTalk : bentuk mulut untuk bicara (bisa diubah lewat panel "Mulut")
  //  camera    : (opsional) { position:[x,y,z], target:[x,y,z] }
  // ===================================================================
  DEFAULT_CHARACTER: "hoshino",
  CHARACTERS: [
    {
      id: "hoshino",
      name: "Hoshino",
      files: ["models/Hoshino.glb"],
      idle: "Cafe_Idle",
      clips: {
        reaction: "Cafe_Reaction",
        victory: "Victory_Start",
        public: "Public01",
        callsign: "Normal_Callsign",
        panic: "Vital_Panic",
      },
      mouthTalk: ["Mouth_402", "Mouth_404", "Mouth_405"],
    },
    {
      id: "battle",
      name: "Hoshino (Battle)",
      files: [
        "models/hoshino_battle.glb",
        "models/Hoshino (Battle).glb",
        "models/Hoshino__Battle_.glb",
      ],
      idle: "01_Cafe_Idle",
      clips: {
        reaction: "01_Cafe_Reaction",
        victory: "01_Victory_Start",
        public: "01_Public01",
        callsign: "01_Normal_Callsign",
        panic: "01_Vital_Panic", // alternatif: "01_Vital_Hit"
      },
      mouthTalk: ["Mouth_402", "Mouth_404", "Mouth_405"],
    },
    {
      id: "swimsuit",
      name: "Hoshino (Swimsuit)",
      files: [
        "models/hoshino_swimsuit.glb",
        "models/Hoshino (Swimsuit).glb",
        "models/Hoshino__Swimsuit_.glb",
      ],
      idle: "Cafe_Idle",
      clips: {
        reaction: "Cafe_Reaction",
        victory: "Victory_Start",
        public: "Normal01_Public01",
        callsign: "Normal_Callsign",
        panic: "Vital_Panic01",
      },
      mouthTalk: ["Mouth_402", "Mouth_404", "Mouth_405"],
    },
  ],

  // ===================================================================
  //  PERFORMA — pilih di panel. Untuk laptop tanpa kartu grafis, coba "hemat".
  //  pixelRatio : resolusi render (0 = resolusi asli layar, maks. 2)
  //  handFps    : berapa kali per detik tangan dianalisis
  //  cam        : resolusi kamera [lebar, tinggi]
  //  delegate   : "GPU" atau "CPU" untuk tracking tangan
  // ===================================================================
  DEFAULT_QUALITY: "normal",
  QUALITY: {
    hemat: {
      label: "Hemat",
      pixelRatio: 0.75,
      handFps: 10,
      cam: [320, 240],
      delegate: "CPU",
    },
    normal: {
      label: "Normal",
      pixelRatio: 1,
      handFps: 20,
      cam: [480, 360],
      delegate: "GPU",
    },
    tinggi: {
      label: "Tinggi",
      pixelRatio: 0,
      handFps: 30,
      cam: [640, 480],
      delegate: "GPU",
    },
  },
  HAND_IDLE_FPS: 8, // laju analisis saat belum ada tangan di kamera

  // ---------------- Gestur tangan -> reaksi ----------------
  // Nama gestur dari MediaPipe: Closed_Fist, Open_Palm, Pointing_Up,
  // Thumb_Down, Thumb_Up, Victory, ILoveYou
  // role   : peran klip (lihat `clips` per karakter di atas)
  // action : kalimat aksi yang dikirim ke AI nanti
  // line   : balasan cadangan
  GESTURES: {
    Thumb_Up: {
      role: "victory",
      action: "*Sensei mengacungkan jempol*",
      line: "Hehe... makasih, Sensei.",
      emotion: "happy",
    },
    Victory: {
      role: "public",
      action: "*Sensei membuat tanda peace*",
      line: "Peace ya... uhe~",
      emotion: "happy",
    },
    ILoveYou: {
      role: "reaction",
      action: "*Sensei membuat tanda 'I love you'*",
      line: "E-eh? Jangan tiba-tiba begitu, Sensei...",
      emotion: "shy",
    },
    Pointing_Up: {
      role: "callsign",
      action: "*Sensei menunjuk ke atas*",
      line: "Hm? Ada apa di atas sana?",
      emotion: "neutral",
    },
    Thumb_Down: {
      role: "panic",
      action: "*Sensei menunjukkan jempol ke bawah*",
      line: "Eh... aku salah apa, Sensei?",
      emotion: "surprised",
    },
    Closed_Fist: {
      role: "panic",
      action: "*Sensei mengepalkan tangan di depannya*",
      line: "A-aku nggak bikin salah, kan...?",
      emotion: "surprised",
    },
  },
  GESTURE_HOLD: 0.45, // gestur harus bertahan segini lama (detik)
  GESTURE_COOLDOWN: 2.5, // jeda antar-reaksi gestur (detik)

  // Melambai (tangan bolak-balik kiri-kanan)
  WAVE: {
    role: "public",
    action: "*Sensei melambaikan tangan*",
    line: "Oh, halo Sensei... uhe~",
    emotion: "happy",
    window: 1.4,
    swing: 0.06,
    minReversals: 3,
    cooldown: 3.5,
  },

  // Headpat (tangan di atas kepala karakter sambil digerakkan)
  PAT: {
    role: "reaction",
    action: "*Sensei mengelus kepalamu*",
    line: "...Mmn. Enak. Lanjutin aja, Sensei.",
    emotion: "shy",
    headOffsetY: 0.22, // titik tengah area "kepala" di atas tulang kepala (unit model)
    radiusFactor: 0.16, // radius area kepala = faktor x tinggi layar
    holdSeconds: 0.4,
    minPath: 0.05,
    cooldown: 4,
  },

  // Emosi balasan AI -> peran klip (null = tetap idle)
  EMOTION_TO_ROLE: {
    happy: "victory",
    shy: "reaction",
    surprised: "panic",
    sleepy: null,
    neutral: null,
  },

  TALK_FLAP_MS: 130, // ganti bentuk mulut tiap sekian ms
  TYPE_MS: 28, // kecepatan teks muncul per huruf
};
