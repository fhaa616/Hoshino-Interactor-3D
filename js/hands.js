import { GestureRecognizer, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

/**
 * Melacak tangan + mengenali gestur bawaan MediaPipe.
 * state.palm: posisi telapak 0..1, sudah DICERMINKAN agar sama dengan layar.
 *
 * Hemat performa:
 *  - analisis dibatasi `opts.fps` (bukan tiap frame kamera)
 *  - saat belum ada tangan, analisis diperlambat ke `opts.idleFps`
 *  - resolusi kamera & delegate (GPU/CPU) bisa diganti saat berjalan
 */
export class HandTracker {
  constructor(video, overlay, statusEl) {
    this.video = video;
    this.overlay = overlay;
    this.ctx = overlay.getContext("2d");
    this.statusEl = statusEl;
    this.state = { present: false, palm: { x: 0.5, y: 0.5 }, gesture: null, score: 0, hands: 0 };
    this.opts = { fps: 20, idleFps: 8, delegate: "GPU", cam: [480, 360] };
    this.inferFps = 0;
    this._count = 0;
    this._countT = performance.now();
    this._lastInfer = 0;
    this._last = -1;
    this._running = false;
    this.rec = null;
  }

  _status(t) { if (this.statusEl) this.statusEl.textContent = t; }

  /** Ubah pengaturan kapan saja. */
  configure(o) {
    const camChanged = o.cam && (o.cam[0] !== this.opts.cam[0] || o.cam[1] !== this.opts.cam[1]);
    Object.assign(this.opts, o);
    if (camChanged) this._applyCamera();
  }

  _applyCamera() {
    const track = this.video.srcObject?.getVideoTracks?.()[0];
    if (!track) return;
    track.applyConstraints({ width: { ideal: this.opts.cam[0] }, height: { ideal: this.opts.cam[1] } })
      .catch((e) => console.warn("Resolusi kamera tidak bisa diubah:", e));
  }

  _make(delegate) {
    return GestureRecognizer.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
    });
  }

  /** Ganti GPU <-> CPU tanpa memulai ulang kamera. */
  async setDelegate(delegate) {
    this.opts.delegate = delegate;
    if (!this.fileset) return;
    const old = this.rec;
    this.rec = null;                       // jeda analisis selama dibuat ulang
    try { this.rec = await this._make(delegate); }
    catch (e) {
      console.warn("Delegate " + delegate + " gagal, kembali ke CPU:", e);
      this.opts.delegate = "CPU";
      this.rec = await this._make("CPU");
    }
    try { old?.close(); } catch { /* abaikan */ }
  }

  async start() {
    try {
      this._status("Memuat model tangan...");
      this.fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      try { this.rec = await this._make(this.opts.delegate); }
      catch { this.opts.delegate = "CPU"; this.rec = await this._make("CPU"); }

      this._status("Meminta izin kamera...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: this.opts.cam[0] }, height: { ideal: this.opts.cam[1] }, facingMode: "user" },
        audio: false,
      });
      this.video.srcObject = stream;
      await this.video.play();
      this.draw = new DrawingUtils(this.ctx);
      this._running = true;
      this._status("Kamera aktif");
      this._loop();
      return true;
    } catch (e) {
      console.error(e);
      this._status("Kamera/tracking gagal: " + (e?.message || e) + " — kepala mengikuti mouse.");
      return false;
    }
  }

  _loop = () => {
    if (!this._running) return;
    const now = performance.now();
    const v = this.video;
    const fps = this.state.present ? this.opts.fps : Math.min(this.opts.fps, this.opts.idleFps);

    if (this.rec && v.readyState >= 2 && v.currentTime !== this._last && now - this._lastInfer >= 1000 / fps) {
      this._last = v.currentTime;
      this._lastInfer = now;
      let res = null;
      try { res = this.rec.recognizeForVideo(v, now); } catch (e) { console.warn(e); }
      this._count++;
      this._process(res);
    }
    if (now - this._countT >= 1000) {            // hitung laju analisis sebenarnya
      this.inferFps = this._count;
      this._count = 0;
      this._countT = now;
    }
    requestAnimationFrame(this._loop);
  };

  _process(res) {
    const { ctx, overlay, video } = this;
    if (video.videoWidth && (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight)) {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    }
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const lms = res?.landmarks ?? [];
    if (!lms.length) { this.state = { ...this.state, present: false, gesture: null, score: 0, hands: 0 }; return; }

    for (const l of lms) {
      this.draw.drawConnectors(l, GestureRecognizer.HAND_CONNECTIONS, { color: "#7cf5c8", lineWidth: 2 });
      this.draw.drawLandmarks(l, { color: "#ffffff", lineWidth: 1, radius: 2 });
    }

    // Titik tengah telapak: rata-rata pergelangan + pangkal 4 jari
    const idx = [0, 5, 9, 13, 17];
    const l0 = lms[0];
    const px = idx.reduce((s, i) => s + l0[i].x, 0) / idx.length;
    const py = idx.reduce((s, i) => s + l0[i].y, 0) / idx.length;

    const g = res.gestures?.[0]?.[0];
    const ok = g && g.score >= 0.6 && g.categoryName !== "None";
    this.state = {
      present: true,
      palm: { x: 1 - px, y: py },           // cermin horizontal
      gesture: ok ? g.categoryName : null,
      score: ok ? g.score : 0,
      hands: lms.length,
    };
  }
}