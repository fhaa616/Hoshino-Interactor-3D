import { parseEmotion } from "./logic.js";

const SYSTEM_PROMPT = `Kamu adalah Hoshino, karakter virtual yang santai, agak pemalas, dan suka tidur siang. Kamu memanggil pengguna "Sensei".
Jawab singkat (1-3 kalimat), hangat, dan sedikit jahil. Gunakan bahasa yang dipakai pengguna (default bahasa Indonesia).
Awali SETIAP jawaban dengan satu tag emosi dalam kurung siku, pilih salah satu: [neutral], [happy], [shy], [surprised], [sleepy].
Pesan yang diawali tanda * adalah aksi fisik yang dilakukan pengguna (mis. mengelus kepalamu atau melambai). Tanggapi aksinya secara natural.
Tetap dalam karakter.`;

const DEMO_REPLIES = [
  [/\*.*(elus|kepala)/i,       "[shy] ...Mmn. Enak. Lanjutin aja, Sensei."],
  [/\*.*(lambai|halo)/i,       "[happy] Oh, halo Sensei... uhe~"],
  [/\*/,                       "[surprised] E-eh? Barusan itu apa, Sensei?"],
  [/halo|hai|hi\b|hello/i,     "[happy] Oh, halo Sensei... uhe~ Baru bangun nih."],
  [/tidur|ngantuk|capek/i,     "[sleepy] Tidur siang itu penting, Sensei... lima menit lagi, ya?"],
  [/makan|lapar/i,             "[happy] Makan? Boleh. Asal Sensei yang traktir, hehe."],
  [/nama|siapa/i,              "[neutral] Aku Hoshino. Kalau butuh apa-apa... bilang aja, pelan-pelan ya."],
];

export class Brain {
  constructor() {
    this.settings = {
      provider: "demo",                      // demo | ollama | openai
      ollamaHost: "http://localhost:11434",
      ollamaModel: "llama3.2",
      apiBase: "https://api.groq.com/openai/v1",
      apiModel: "llama-3.1-8b-instant",
      apiKey: "",
      tts: false,
    };
  }
  get enabled() { return this.settings.provider !== "demo"; }

  /** history: [{role:'user'|'assistant', content}] ; mengembalikan {text, emotion} */
  async reply(history, userText) {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-10),
      { role: "user", content: userText },
    ];
    let raw;
    switch (this.settings.provider) {
      case "ollama": raw = await this._ollama(messages); break;
      case "openai": raw = await this._openai(messages); break;
      default:       raw = this._demo(userText);
    }
    return parseEmotion(raw);
  }

  _demo(text) {
    for (const [re, out] of DEMO_REPLIES) if (re.test(text)) return out;
    return "[neutral] Hmm... gitu ya. (Mode demo: sambungkan AI di panel Pengaturan biar aku bisa ngobrol beneran.)";
  }

  async _ollama(messages) {
    const host = this.settings.ollamaHost.replace(/\/+$/, "");
    let res;
    try {
      res = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.settings.ollamaModel, messages, stream: false }),
      });
    } catch (e) {
      throw new Error("Tidak bisa terhubung ke Ollama. Pastikan Ollama sedang berjalan dan alamatnya benar.");
    }
    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data?.message?.content ?? "";
  }

  async _openai(messages) {
    const base = this.settings.apiBase.replace(/\/+$/, "");
    if (!this.settings.apiKey) throw new Error("API key belum diisi di panel Pengaturan.");
    let res;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.settings.apiKey}` },
        body: JSON.stringify({ model: this.settings.apiModel, messages, temperature: 0.8, max_tokens: 200 }),
      });
    } catch (e) {
      throw new Error("Gagal menghubungi layanan API (cek koneksi internet / alamat API).");
    }
    if (!res.ok) throw new Error(`API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  }
}