import { GestureRecognizer, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

/**
 * Melacak tangan + mengenali gestur bawaan MediaPipe (Thumb_Up, Victory, dst.).
 * state.palm: posisi telapak 0..1, sudah DICERMINKAN agar sama dengan layar.
 */
export class HandTracker {
  constructor(video, overlay, statusEl) {
    this.video = video;
    this.overlay = overlay;
    this.ctx = overlay.getContext("2d");
    this.statusEl = statusEl;
    this.state = { present: false, palm: { x: 0.5, y: 0.5 }, gesture: null, score: 0, hands: 0 };
    this._last = -1;
    this._running = false;
  }

  _status(t) { if (this.statusEl) this.statusEl.textContent = t; }

  async start() {
    try {
      this._status("Memuat model tangan...");
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const make = (delegate) => GestureRecognizer.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
      });
      try { this.rec = await make("GPU"); } catch { this.rec = await make("CPU"); }

      this._status("Meminta izin kamera...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" }, audio: false,
      });
      this.video.srcObject = stream;
      await this.video.play();
      this.overlay.width = this.video.videoWidth || 640;
      this.overlay.height = this.video.videoHeight || 480;
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
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this._last) {
      this._last = v.currentTime;
      let res = null;
      try { res = this.rec.recognizeForVideo(v, performance.now()); } catch (e) { console.warn(e); }
      this._process(res);
    }
    requestAnimationFrame(this._loop);
  };

  _process(res) {
    const { ctx, overlay } = this;
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