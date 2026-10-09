# Hoshino Interactor

Karakter virtual 3D yang **bereaksi pada gestur tanganmu lewat webcam** dan bisa **diajak ngobrol dengan AI**.
Semuanya berjalan di browser dengan Three.js dan MediaPipe, tanpa instalasi library Python.

<!-- Tambahkan demo di sini setelah merekam layar, contoh:
![Demo](docs/demo.gif)
-->

## Fitur

- **Kepala mengikuti tangan.** Karakter menoleh ke arah telapak tanganmu (atau ke mouse bila kamera tidak aktif).
- **Gestur memicu animasi.** 👍 jempol, ✌️ peace, 🤟 I-love-you, ☝️ telunjuk, 👎 jempol bawah, ✊ kepalan.
- **Melambai** membuat karakter menyapa.
- **Headpat.** Gerakkan tanganmu di atas kepala karakter untuk mengelusnya.
- **Chat dengan AI** memakai Ollama (lokal) atau API yang kompatibel OpenAI (Groq, OpenRouter, Gemini). Ada juga mode demo tanpa AI.
- **Reaksi gestur ikut dibahas AI.** Aksi tanganmu dikirim ke AI sebagai konteks, jadi balasannya menyesuaikan.
- **Ekspresi dan lip-sync sederhana.** Emosi balasan AI memilih animasi, dan mulut bergerak saat karakter bicara.
- **Suara opsional** lewat text-to-speech bawaan browser.

## Cara kerja

```
Webcam ──► MediaPipe Gesture Recognizer ──► posisi tangan + nama gestur
                                                   │
        Chat / aksi tangan ──► AI (Ollama / API) ──┤
                                                   ▼
                          Three.js: animasi, menoleh, bentuk mulut, gelembung bicara
```

- **Tracking tangan:** MediaPipe berjalan langsung di browser. Video dari kamera tidak dikirim ke server mana pun.
- **Menoleh:** rotasi tulang leher dan kepala ditumpuk di atas animasi bawaan, dihitung di ruang dunia sehingga tidak bergantung orientasi sumbu tulang.
- **Mulut:** model memakai beberapa mesh mulut; yang aktif adalah mesh dengan morph weight 0. Saat bicara, bentuk mulut berganti cepat di antara pilihan yang kamu tentukan.
- **AI:** balasan diawali tag emosi (`[happy]`, `[shy]`, dan lainnya) yang diterjemahkan menjadi animasi.

## Persyaratan

- Browser modern (Chrome atau Edge disarankan) dengan WebGL dan akses webcam
- Python 3 (hanya untuk menjalankan server lokal; library bawaan sudah cukup)
- Koneksi internet saat pertama dibuka (library dan model tangan diunduh dari CDN)
- File model karakter `.glb` milikmu sendiri (lihat [Catatan model](#catatan-model))

## Menjalankan

1. Taruh model di `models/Hoshino.glb`, atau pilih file lewat tombol di halaman.
2. Jalankan server lokal di folder proyek:
   - Windows: klik dua kali `run.bat`
   - Atau: `python -m http.server 8000`
3. Buka <http://localhost:8000> dan izinkan akses kamera.

> Halaman harus dibuka lewat `http://localhost` atau HTTPS. Membuka `index.html` langsung (`file://`) tidak akan berfungsi karena kamera dan modul JS membutuhkan server.

## Menghubungkan AI

Buka panel **Pengaturan** di kiri atas, pilih penyedia, lalu klik **Simpan**.

| Mode | Cara |
|---|---|
| **Demo** | Tanpa pengaturan. Balasan sederhana berbasis kata kunci. |
| **Ollama (lokal)** | Pasang [Ollama](https://ollama.com), jalankan `ollama pull llama3.2`, lalu pilih Ollama. Model berjalan di komputermu. |
| **API kompatibel OpenAI** | Buat API key di penyedia (Groq, OpenRouter, Google AI Studio), pilih preset, tempel key. |

Nama model gratis berubah dari waktu ke waktu; cek dokumentasi penyedia bila muncul error model tidak ditemukan.

**Keamanan key:** API key disimpan hanya di `localStorage` browser kamu. Key tidak ada di kode dan tidak ikut ke repo. Karena ini aplikasi sisi klien, jangan membagikan browser/profil yang menyimpan key kepada orang lain.

## Kontrol

| Tombol | Fungsi |
|---|---|
| **R** | Putar arah hadap model 180° (bila menghadap ke belakang) |
| **H** | Tampilkan atau sembunyikan zona headpat |
| Klik-tahan mouse + geser | Memutar kamera |
| Scroll | Zoom |

## Kustomisasi

Semua pengaturan ada di [`js/config.js`](js/config.js):

- `GESTURES`: gestur mana memutar animasi apa, serta kalimat cadangan
- `WAVE` dan `PAT`: kepekaan deteksi lambaian dan headpat
- `LOOK`: seberapa jauh dan seberapa halus kepala menoleh
- `EMOTION_TO_CLIP`: emosi AI ke animasi
- `IDLE_CLIP`: animasi saat diam

Untuk mencari animasi yang cocok, pakai dropdown **Animasi** di panel Pengaturan untuk mencoba setiap klip. Panel **Mulut** dipakai untuk memilih bentuk mulut yang cocok saat bicara.

## Struktur proyek

```
hoshino-interactor/
├── index.html           # halaman utama
├── run.bat              # Windows: jalankan server lokal
├── css/style.css
├── js/
│   ├── config.js        # semua pengaturan
│   ├── main.js          # scene 3D, animasi, interaksi, chat
│   ├── hands.js         # tracking tangan & pengenal gestur
│   ├── ai.js            # koneksi AI (demo / Ollama / API)
│   └── logic.js         # deteksi lambaian & parser emosi
└── models/              # taruh Hoshino.glb di sini (tidak ikut repo)
```

## Pemecahan masalah

| Gejala | Solusi |
|---|---|
| Muncul tombol "Pilih file .glb" | Model tidak ada di `models/Hoshino.glb`; letakkan di sana atau pilih manual |
| Layar kosong | Buka Console browser (F12) dan periksa error; pastikan ada koneksi internet untuk memuat library |
| Kamera tidak aktif | Izinkan kamera di browser dan tutup aplikasi lain yang memakainya |
| Tangan tidak terbaca | Pastikan pencahayaan cukup dan tunggu model tangan selesai diunduh |
| Karakter menghadap ke belakang | Tekan **R** |
| `port 8000 already in use` | Tutup server lama, atau pakai port lain: `python -m http.server 8001` |

## Privasi

- Video kamera diproses lokal di browser dan tidak diunggah.
- Teks chat dan deskripsi aksi tanganmu dikirim ke penyedia AI yang kamu pilih (atau tetap lokal bila memakai Ollama).
- Library dimuat dari jsDelivr, dan model pengenal gestur diunduh dari penyimpanan Google MediaPipe.

## Catatan model

Repo ini **tidak menyertakan file model karakter**. Karakter dan modelnya adalah milik pemegang haknya, dan berkas `.glb` sengaja dikecualikan lewat `.gitignore`. Gunakan model yang kamu punya haknya atau yang lisensinya mengizinkan. Proyek ini adalah karya penggemar dan tidak berafiliasi dengan pihak mana pun.

## Teknologi

- [Three.js](https://threejs.org/) untuk render 3D dan animasi
- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) untuk tracking tangan dan pengenalan gestur
- JavaScript (ES modules), tanpa proses build
