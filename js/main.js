import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CONFIG } from "./config.js";
import { HandTracker } from "./hands.js";
import { Brain } from "./ai.js";
import { detectWave, pathLength, pruneSamples } from "./logic.js";

// =====================================================================
//  Util kecil
// =====================================================================
const $ = (id) => document.getElementById(id);
const nowSec = () => performance.now() / 1000;
const PREFS_KEY = "hoshino.prefs.v1";
const STORE_KEY = "hoshino.settings.v1";
const mouthKey = (id) => `hoshino.talkmouths.v2.${id}`;
const lookKey = (id) => `hoshino.look.v1.${id}`;
function loadJSON(k, d) {
  try {
    const s = localStorage.getItem(k);
    return s ? JSON.parse(s) : d;
  } catch {
    return d;
  }
}
function saveJSON(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* abaikan */
  }
}

const prefs = loadJSON(PREFS_KEY, {});
const savePrefs = () => saveJSON(PREFS_KEY, prefs);

// =====================================================================
//  Three.js: renderer, kamera, lampu
// =====================================================================
const canvas = $("stage");
const pointer = $("pointer");
const pctx = pointer.getContext("2d");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.CAMERA.fov, 1, 0.05, 50);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.2;
controls.maxDistance = 6;

function resetCamera(cfg) {
  const c = cfg || CONFIG.CAMERA;
  camera.position.set(...c.position);
  controls.target.set(...c.target);
  controls.update();
}
resetCamera();

scene.add(new THREE.AmbientLight(0xffffff, 1.1));
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a4a6a, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(1.5, 2.5, 3);
scene.add(sun);

function resize() {
  const w = window.innerWidth,
    h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  pointer.width = w;
  pointer.height = h;
}
window.addEventListener("resize", resize);

// =====================================================================
//  State model & animasi
// =====================================================================
let model = null,
  mixer = null,
  idle = null,
  current = null;
let head = null,
  neck = null,
  currentChar = null;
const actions = {};
const mouths = {}; // { Mouth_402: Mesh, ... }

/** Nama klip asli untuk sebuah peran (reaction, victory, ...) pada karakter aktif. */
const clipFor = (role) =>
  role && currentChar ? (currentChar.clips[role] ?? null) : null;

function disposeModel(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const k in m) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    }
    if (o.skeleton) o.skeleton.dispose();
  });
}

/** Lepas model aktif & bebaskan memori (penting di laptop tanpa VGA). */
function unloadModel() {
  if (!model) return;
  scene.remove(model);
  if (mixer) {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
  }
  disposeModel(model);
  model = mixer = idle = current = head = neck = null;
  lookApplied = false;
  for (const k of Object.keys(actions)) delete actions[k];
  for (const k of Object.keys(mouths)) delete mouths[k];
  mouthForce = null;
  talkUntil = 0;
}

function setupModel(gltf, ch) {
  model = gltf.scene;
  model.traverse((o) => {
    o.frustumCulled = false; // cegah model "hilang" karena bounding bind-pose
    if (o.isMesh && CONFIG.HIDE_NODE_REGEX.test(o.name)) o.visible = false;
    if (o.isMesh && /^Mouth_/.test(o.name) && o.morphTargetInfluences)
      mouths[o.name] = o;
  });

  // Nama tulang disanitasi three.js: "Bip001 Head" -> "Bip001_Head"
  const findBone = (re) => {
    let r = null;
    model.traverse((o) => {
      if (!r && o.isBone && re.test(o.name)) r = o;
    });
    return r;
  };
  head = findBone(/^Bip001[_ ]?Head$/i);
  neck = findBone(/^Bip001[_ ]?Neck$/i);
  if (!head)
    console.warn("Tulang kepala tidak ditemukan; fitur menoleh dimatikan.");

  scene.add(model);

  // Animasi
  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations)
    actions[clip.name] = mixer.clipAction(clip);
  const names = Object.keys(actions);
  idle = actions[ch.idle] || null;
  if (!idle) {
    console.warn(
      `Klip idle "${ch.idle}" tidak ada di ${ch.name}. Memakai klip pertama.`,
    );
    idle = actions[names[0]] || null;
  }
  if (idle) {
    idle.setLoop(THREE.LoopRepeat, Infinity);
    idle.play();
    current = idle;
  }
  mixer.addEventListener("finished", (e) => {
    if (e.action === current && current !== idle) returnToIdle();
  });

  // Peringatan bila ada peran yang klipnya tidak ditemukan (salah ketik di config)
  const missing = Object.entries(ch.clips)
    .filter(([, n]) => !actions[n])
    .map(([r, n]) => `${r}: ${n}`);
  if (missing.length)
    addMsg(
      "err",
      `Klip tidak ditemukan di ${ch.name}: ${missing.join(", ")}. Periksa js/config.js.`,
    );

  // Bentuk mulut untuk bicara (tersimpan per karakter)
  const saved = loadJSON(mouthKey(ch.id), ch.mouthTalk);
  talkSet = saved.filter((n) => mouths[n]);
  if (!talkSet.length) talkSet = ch.mouthTalk.filter((n) => mouths[n]);

  resetCamera(ch.camera);
  loadLookCfg(ch);
  buildAnimUi(names);
  buildMouthUi(ch);
  $("loading").classList.add("done");
  addMsg(
    "sys",
    `${ch.name} dimuat: ${names.length} animasi, ${Object.keys(mouths).length} bentuk mulut.`,
  );
}

const busy = () => current !== idle;

function playOnce(name, force = false) {
  const a = name ? actions[name] : null;
  if (!a) {
    console.warn("Klip tidak ditemukan:", name);
    return false;
  }
  if (a === idle) {
    if (current !== idle) returnToIdle();
    return true;
  }
  if (!force && current !== idle) return false;
  a.reset();
  a.setLoop(THREE.LoopOnce, 1);
  a.clampWhenFinished = true;
  a.play();
  if (current && current !== a) current.crossFadeTo(a, 0.25, false);
  current = a;
  return true;
}

function returnToIdle() {
  if (!idle) return;
  idle.reset();
  idle.play();
  if (current && current !== idle) current.crossFadeTo(idle, 0.35, false);
  current = idle;
}

// =====================================================================
//  Memuat karakter (otomatis dari models/, atau pilih file)
// =====================================================================
let loadToken = 0;
const parseGlb = (buf) =>
  new Promise((res, rej) => new GLTFLoader().parse(buf, "", res, rej));

async function loadCharacter(id, fileOverride = null) {
  const ch = CONFIG.CHARACTERS.find((c) => c.id === id) || CONFIG.CHARACTERS[0];
  const token = ++loadToken;
  currentChar = ch;
  $("char-select").value = ch.id;
  $("picker-name").textContent = ch.name;
  prefs.char = ch.id;
  savePrefs();

  unloadModel();
  $("loading").classList.remove("done");
  $("picker").hidden = true;
  $("loading-text").textContent = `Memuat ${ch.name}...`;

  try {
    let buf = null;
    if (fileOverride) buf = await fileOverride.arrayBuffer();
    else {
      for (const path of ch.files) {
        try {
          const r = await fetch(encodeURI(path)); // aman untuk nama berspasi / berkurung
          if (r.ok) {
            buf = await r.arrayBuffer();
            break;
          }
        } catch {
          /* coba nama berikutnya */
        }
      }
    }
    if (token !== loadToken) return;
    if (!buf) throw new Error("NOFILE");
    $("loading-text").textContent = "Memproses model...";
    const gltf = await parseGlb(buf);
    if (token !== loadToken) return;
    setupModel(gltf, ch);
  } catch (e) {
    if (token !== loadToken) return;
    console.warn("Gagal memuat", ch.name, e);
    $("loading-text").textContent =
      e.message === "NOFILE" ? "" : "Gagal membaca model: " + (e?.message || e);
    $("picker").hidden = false;
  }
}

$("pick-btn").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", (e) => {
  if (e.target.files[0]) loadCharacter(currentChar.id, e.target.files[0]);
  e.target.value = "";
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer.files[0])
    loadCharacter(currentChar.id, e.dataTransfer.files[0]);
});

// =====================================================================
//  Menoleh mengikuti tangan (atau mouse bila tak ada tangan)
// =====================================================================
const _q = new THREE.Quaternion(),
  _pq = new THREE.Quaternion(),
  _wq = new THREE.Quaternion();
const _dq = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _v = new THREE.Vector3();

/** Putar tulang di RUANG DUNIA (tidak bergantung orientasi sumbu tulang). */
function rotateBoneWorld(bone, yaw, pitch) {
  if (!bone || !bone.parent) return;
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_wq);
  bone.parent.getWorldQuaternion(_pq);
  _dq.setFromEuler(_e.set(pitch, yaw, 0, "YXZ"));
  _q.copy(_pq).invert().multiply(_dq).multiply(_wq);
  bone.quaternion.copy(_q);
}

const mouse = { x: 0.5, y: 0.5 };
window.addEventListener("mousemove", (e) => {
  mouse.x = e.clientX / window.innerWidth;
  mouse.y = e.clientY / window.innerHeight;
});

let lookYaw = 0,
  lookPitch = 0;
let lookCfg = { ...CONFIG.LOOK }; // batas menoleh karakter aktif (dasar -> config karakter -> slider)

function syncLookUi() {
  const rows = [
    ["look-yaw", lookCfg.maxYaw],
    ["look-pitch", lookCfg.maxPitch],
    ["look-neck", lookCfg.neckShare],
  ];
  for (const [id, v] of rows) {
    $(id).value = v;
    $(id + "-v").textContent = Number(v).toFixed(2);
  }
}
function loadLookCfg(ch) {
  lookCfg = {
    ...CONFIG.LOOK,
    ...(ch.look || {}),
    ...loadJSON(lookKey(ch.id), {}),
  };
  syncLookUi();
}

// PENTING: pada beberapa model (Battle, Swimsuit) klip idle TIDAK menganimasikan tulang leher.
// Mixer tidak menimpa tulang itu tiap frame, sehingga rotasi kita menumpuk terus-menerus
// (leher makin terpuntir). Solusi: simpan pose sebelum di-override, lalu kembalikan
// SEBELUM mixer berjalan di frame berikutnya.
const _saveN = new THREE.Quaternion(),
  _saveH = new THREE.Quaternion();
let lookApplied = false;
function undoLook() {
  if (!lookApplied) return;
  if (neck) neck.quaternion.copy(_saveN);
  if (head) head.quaternion.copy(_saveH);
  lookApplied = false;
}

function updateLook(dt) {
  if (!head) return;
  const hs = tracker.state;
  const src = hs.present ? hs.palm : mouse;
  const targetYaw = (src.x - 0.5) * 2 * lookCfg.maxYaw;
  const targetPitch = -(0.5 - src.y) * 2 * lookCfg.maxPitch;
  const k = 1 - Math.exp(-lookCfg.smooth * dt);
  lookYaw += (targetYaw - lookYaw) * k;
  lookPitch += (targetPitch - lookPitch) * k;
  const share = lookCfg.neckShare;
  if (neck) _saveN.copy(neck.quaternion); // pose asli (hasil mixer) sebelum di-override
  _saveH.copy(head.quaternion);
  lookApplied = true;
  if (neck) rotateBoneWorld(neck, lookYaw * share, lookPitch * share);
  rotateBoneWorld(head, lookYaw * (1 - share), lookPitch * (1 - share));
}

// =====================================================================
//  Mulut: bicara (lip-sync sederhana) & pratinjau
// =====================================================================
let talkSet = [];
let mouthForce = null,
  nextFlap = 0,
  previewUntil = 0,
  lastMouth = null,
  talkUntil = 0;

/** Pada model ini, bentuk mulut AKTIF = mesh dengan morph weight 0, sisanya weight 1. */
function updateMouth(t) {
  const names = Object.keys(mouths);
  if (!names.length) return;
  if (t < previewUntil) {
    /* pertahankan mouthForce hasil klik chip */
  } else if (t < talkUntil && talkSet.length) {
    if (t >= nextFlap) {
      let pick;
      do {
        pick = talkSet[(Math.random() * talkSet.length) | 0];
      } while (talkSet.length > 1 && pick === lastMouth);
      lastMouth = pick;
      mouthForce = pick;
      nextFlap = t + CONFIG.TALK_FLAP_MS / 1000;
    }
  } else mouthForce = null;
  if (!mouthForce) return;
  for (const n of names)
    mouths[n].morphTargetInfluences[0] = n === mouthForce ? 0 : 1;
}

function buildMouthUi(ch) {
  const box = $("mouth-chips");
  box.innerHTML = "";
  for (const name of Object.keys(mouths).sort()) {
    const chip = document.createElement("button");
    chip.className = "chip" + (talkSet.includes(name) ? " on" : "");
    chip.textContent = name.replace("Mouth_", "");
    chip.title = name;
    chip.addEventListener("click", () => {
      talkSet = talkSet.includes(name)
        ? talkSet.filter((n) => n !== name)
        : [...talkSet, name];
      saveJSON(mouthKey(ch.id), talkSet);
      chip.classList.toggle("on", talkSet.includes(name));
      mouthForce = name;
      previewUntil = nowSec() + 1.5; // pratinjau
    });
    box.appendChild(chip);
  }
}

function buildAnimUi(names) {
  const sel = $("anim-select");
  sel.innerHTML = "";
  for (const n of names) {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    sel.appendChild(o);
  }
}
$("anim-play").addEventListener("click", () =>
  playOnce($("anim-select").value, true),
);

// =====================================================================
//  Chat, gelembung bicara, suara
// =====================================================================
const brain = new Brain();
Object.assign(brain.settings, loadJSON(STORE_KEY, {}));
const history = [];
let aiBusy = false,
  typeTimer = null,
  hideTimer = null;

function addMsg(cls, text) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.textContent = text;
  const log = $("chat-log");
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}
function pushHistory(user, assistant) {
  history.push(
    { role: "user", content: user },
    { role: "assistant", content: assistant },
  );
  while (history.length > 20) history.shift();
}
function scheduleHide(ms) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (nowSec() > talkUntil) $("bubble").hidden = true;
  }, ms);
}

function say(text, emotion = "neutral", { clip = true } = {}) {
  addMsg("bot", text);
  const bubble = $("bubble"),
    tx = $("bubble-text");
  $("bubble-name").textContent = currentChar ? currentChar.name : "Hoshino";
  bubble.hidden = false;
  tx.textContent = "";
  clearInterval(typeTimer);
  let i = 0;
  typeTimer = setInterval(() => {
    i++;
    tx.textContent = text.slice(0, i);
    if (i >= text.length) clearInterval(typeTimer);
  }, CONFIG.TYPE_MS);

  const dur = (text.length * CONFIG.TYPE_MS) / 1000 + 0.3;
  talkUntil = nowSec() + dur;
  scheduleHide((dur + 6) * 1000);

  if (clip) {
    const c = clipFor(CONFIG.EMOTION_TO_ROLE[emotion]);
    if (c && !busy()) playOnce(c);
  }

  if (brain.settings.tts && "speechSynthesis" in window) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "id-ID";
      u.onstart = () => {
        talkUntil = Infinity;
      };
      u.onend = u.onerror = () => {
        talkUntil = nowSec() + 0.1;
        scheduleHide(6000);
      };
      speechSynthesis.speak(u);
    } catch (e) {
      console.warn(e);
    }
  }
}

async function sendChat() {
  const input = $("chat-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  addMsg("user", text);
  const typing = addMsg("sys", "Hoshino sedang mengetik...");
  try {
    const r = await brain.reply(history, text);
    typing.remove();
    pushHistory(text, r.text);
    say(r.text, r.emotion);
  } catch (e) {
    typing.remove();
    addMsg("err", e.message || String(e));
  }
}
$("chat-send").addEventListener("click", sendChat);
$("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});

/** Reaksi karakter terhadap aksi tangan: animasi (via peran) + (AI atau kalimat cadangan). */
async function reactToEvent(ev) {
  const clip = clipFor(ev.role);
  if (clip) playOnce(clip);
  addMsg("sys", ev.action);
  if (brain.enabled && !aiBusy) {
    aiBusy = true;
    try {
      const r = await brain.reply(history, ev.action);
      pushHistory(ev.action, r.text);
      say(r.text, r.emotion, { clip: false });
    } catch (e) {
      addMsg("err", e.message || String(e));
      say(ev.line, ev.emotion, { clip: false });
    } finally {
      aiBusy = false;
    }
  } else {
    say(ev.line, ev.emotion, { clip: false });
  }
}

// =====================================================================
//  Panel pengaturan AI
// =====================================================================
const PRESETS = {
  groq: {
    base: "https://api.groq.com/openai/v1",
    model: "llama-3.1-8b-instant",
  },
  openrouter: {
    base: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.3-70b-instruct:free",
  },
  gemini: {
    base: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
  },
};
function syncAiUi() {
  const p = $("ai-provider").value;
  $("ai-ollama").hidden = p !== "ollama";
  $("ai-openai").hidden = p !== "openai";
}
(function initAiUi() {
  const s = brain.settings;
  $("ai-provider").value = s.provider;
  $("ollama-host").value = s.ollamaHost;
  $("ollama-model").value = s.ollamaModel;
  $("api-base").value = s.apiBase;
  $("api-model").value = s.apiModel;
  $("api-key").value = s.apiKey;
  $("tts").checked = !!s.tts;
  syncAiUi();
})();
$("ai-provider").addEventListener("change", syncAiUi);
$("api-preset").addEventListener("change", (e) => {
  const p = PRESETS[e.target.value];
  if (p) {
    $("api-base").value = p.base;
    $("api-model").value = p.model;
  }
});
$("ai-save").addEventListener("click", () => {
  Object.assign(brain.settings, {
    provider: $("ai-provider").value,
    ollamaHost: $("ollama-host").value.trim(),
    ollamaModel: $("ollama-model").value.trim(),
    apiBase: $("api-base").value.trim(),
    apiModel: $("api-model").value.trim(),
    apiKey: $("api-key").value.trim(),
    tts: $("tts").checked,
  });
  saveJSON(STORE_KEY, brain.settings);
  addMsg("sys", "Pengaturan disimpan (mode: " + brain.settings.provider + ").");
});

// =====================================================================
//  Interaksi tangan: gestur, lambaian, headpat
// =====================================================================
const tracker = new HandTracker(
  $("cam-video"),
  $("cam-overlay"),
  $("cam-status"),
);

let headScreen = null,
  showZone = false;
function computeHeadScreen() {
  if (!head) {
    headScreen = null;
    return;
  }
  head.getWorldPosition(_v);
  _v.y += CONFIG.PAT.headOffsetY;
  _v.project(camera);
  headScreen = { x: _v.x * 0.5 + 0.5, y: -_v.y * 0.5 + 0.5 };
}
function isNearHead(x, y) {
  if (!headScreen) return false;
  const W = window.innerWidth,
    H = window.innerHeight;
  return (
    Math.hypot((x - headScreen.x) * W, (y - headScreen.y) * H) <
    CONFIG.PAT.radiusFactor * H
  );
}

let lastGesture = null,
  gestureSince = 0,
  firedGesture = null;
let gestureCooldown = 0,
  waveCooldown = 0,
  patCooldown = 0,
  patAccum = 0;
const waveSamples = [],
  patSamples = [];

function updateInteractions(dt, t) {
  const hs = tracker.state;
  $("hud-gesture").textContent = hs.present
    ? "Gestur: " +
      (hs.gesture ? `${hs.gesture} (${Math.round(hs.score * 100)}%)` : "—")
    : "Gestur: tidak ada tangan";

  if (!hs.present) {
    lastGesture = null;
    firedGesture = null;
    patAccum = 0;
    waveSamples.length = 0;
    patSamples.length = 0;
    return;
  }
  const { x, y } = hs.palm;
  waveSamples.push({ t, x });
  patSamples.push({ t, x, y });
  pruneSamples(waveSamples, t, 2);
  pruneSamples(patSamples, t, 2);

  // --- Headpat: tangan di area kepala + bergerak ---
  const near = isNearHead(x, y);
  patAccum = near ? patAccum + dt : Math.max(0, patAccum - dt * 2);
  if (
    near &&
    patAccum >= CONFIG.PAT.holdSeconds &&
    t > patCooldown &&
    !busy() &&
    pathLength(patSamples, t) >= CONFIG.PAT.minPath
  ) {
    patCooldown = t + CONFIG.PAT.cooldown;
    patAccum = 0;
    reactToEvent(CONFIG.PAT);
    return;
  }

  // --- Melambai ---
  if (
    !near &&
    t > waveCooldown &&
    !busy() &&
    detectWave(waveSamples, t, CONFIG.WAVE)
  ) {
    waveCooldown = t + CONFIG.WAVE.cooldown;
    waveSamples.length = 0;
    reactToEvent(CONFIG.WAVE);
    return;
  }

  // --- Gestur statis bawaan MediaPipe ---
  const g = hs.gesture;
  if (g !== lastGesture) {
    lastGesture = g;
    gestureSince = t;
    firedGesture = null;
  }
  if (
    g &&
    g !== firedGesture &&
    CONFIG.GESTURES[g] &&
    t - gestureSince >= CONFIG.GESTURE_HOLD &&
    t > gestureCooldown &&
    !busy()
  ) {
    firedGesture = g;
    gestureCooldown = t + CONFIG.GESTURE_COOLDOWN;
    reactToEvent(CONFIG.GESTURES[g]);
  }
}

let pointerDrawn = false;
function drawPointer() {
  const hs = tracker.state;
  const needDraw = hs.present || showZone;
  if (!needDraw) {
    // hemat: kosongkan sekali, lalu lewati
    if (pointerDrawn) {
      pctx.clearRect(0, 0, pointer.width, pointer.height);
      pointerDrawn = false;
    }
    return;
  }
  pointerDrawn = true;
  const W = pointer.width,
    H = pointer.height;
  pctx.clearRect(0, 0, W, H);
  if (headScreen) {
    pctx.beginPath();
    pctx.arc(
      headScreen.x * W,
      headScreen.y * H,
      CONFIG.PAT.radiusFactor * H,
      0,
      Math.PI * 2,
    );
    pctx.strokeStyle = showZone
      ? "rgba(255,220,120,.8)"
      : "rgba(255,255,255,.12)";
    pctx.setLineDash([6, 6]);
    pctx.lineWidth = 2;
    pctx.stroke();
    pctx.setLineDash([]);
  }
  if (hs.present) {
    const px = hs.palm.x * W,
      py = hs.palm.y * H;
    const near = isNearHead(hs.palm.x, hs.palm.y);
    pctx.beginPath();
    pctx.arc(px, py, 14, 0, Math.PI * 2);
    pctx.fillStyle = near ? "rgba(255,170,200,.55)" : "rgba(124,245,200,.45)";
    pctx.fill();
    pctx.strokeStyle = "#fff";
    pctx.lineWidth = 2;
    pctx.stroke();
  }
}

// =====================================================================
//  Panel karakter & performa
// =====================================================================
function applyQuality(name) {
  const q = CONFIG.QUALITY[name];
  if (!q) return;
  renderer.setPixelRatio(q.pixelRatio || Math.min(window.devicePixelRatio, 2));
  resize();
  tracker.configure({
    fps: q.handFps,
    idleFps: CONFIG.HAND_IDLE_FPS,
    cam: q.cam,
  });
  prefs.quality = name;
  savePrefs();
}

(function initPanels() {
  // Karakter
  const cs = $("char-select");
  for (const c of CONFIG.CHARACTERS) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name;
    cs.appendChild(o);
  }
  cs.addEventListener("change", () => loadCharacter(cs.value));

  // Kualitas
  const qs = $("quality-select");
  for (const [k, q] of Object.entries(CONFIG.QUALITY)) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = q.label;
    qs.appendChild(o);
  }
  const savedQ = CONFIG.QUALITY[prefs.quality]
    ? prefs.quality
    : CONFIG.DEFAULT_QUALITY;
  qs.value = savedQ;
  const ds = $("delegate-select");
  ds.value = prefs.delegate || CONFIG.QUALITY[savedQ].delegate;
  tracker.configure({ delegate: ds.value });
  applyQuality(savedQ);

  // Slider menoleh (tersimpan per karakter)
  for (const [id, key] of [
    ["look-yaw", "maxYaw"],
    ["look-pitch", "maxPitch"],
    ["look-neck", "neckShare"],
  ]) {
    $(id).addEventListener("input", (e) => {
      lookCfg[key] = parseFloat(e.target.value);
      $(id + "-v").textContent = lookCfg[key].toFixed(2);
    });
    $(id).addEventListener("change", () => {
      if (currentChar)
        saveJSON(lookKey(currentChar.id), {
          maxYaw: lookCfg.maxYaw,
          maxPitch: lookCfg.maxPitch,
          neckShare: lookCfg.neckShare,
        });
    });
  }
  $("look-reset").addEventListener("click", () => {
    if (!currentChar) return;
    try {
      localStorage.removeItem(lookKey(currentChar.id));
    } catch {
      /* abaikan */
    }
    loadLookCfg(currentChar);
  });

  qs.addEventListener("change", () => {
    applyQuality(qs.value);
    ds.value = CONFIG.QUALITY[qs.value].delegate; // preset menyarankan delegate-nya
    delete prefs.delegate;
    savePrefs();
    tracker.setDelegate(ds.value);
  });
  ds.addEventListener("change", () => {
    prefs.delegate = ds.value;
    savePrefs();
    tracker.setDelegate(ds.value);
  });
})();

// =====================================================================
//  Keyboard & loop utama
// =====================================================================
window.addEventListener("keydown", (e) => {
  if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName))
    return;
  const k = e.key.toLowerCase();
  if (k === "r" && model) model.rotation.y += Math.PI; // jika model menghadap ke belakang
  if (k === "h") showZone = !showZone;
});

const clock = new THREE.Clock();
let fpsFrames = 0,
  fpsT = nowSec(),
  fpsShown = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = nowSec();
  undoLook(); // 0) batalkan rotasi menoleh frame lalu (cegah menumpuk)
  if (mixer) mixer.update(dt); // 1) animasi bawaan
  updateLook(dt); // 2) tumpuk rotasi kepala (menoleh)
  updateMouth(t); // 3) tumpuk bentuk mulut (bicara)
  computeHeadScreen();
  updateInteractions(dt, t);
  controls.update();
  renderer.render(scene, camera);
  drawPointer();

  fpsFrames++;
  if (t - fpsT >= 1) {
    fpsShown = Math.round(fpsFrames / (t - fpsT));
    fpsFrames = 0;
    fpsT = t;
    $("hud-perf").textContent =
      `FPS ${fpsShown} · Tangan ${tracker.inferFps}/dtk · ${tracker.opts.delegate}`;
  }
}
animate();

// Mulai
loadCharacter(
  CONFIG.CHARACTERS.some((c) => c.id === prefs.char)
    ? prefs.char
    : CONFIG.DEFAULT_CHARACTER,
);
tracker.start(); // jalan paralel; bila gagal, kepala mengikuti mouse
