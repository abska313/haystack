// EventBus, IndexedDB save, Audio system, utility helpers

export class EventBus {
  constructor() { this.listeners = {}; }
  on(evt, cb) { (this.listeners[evt] = this.listeners[evt] || []).push(cb); return () => this.off(evt, cb); }
  off(evt, cb) {
    const a = this.listeners[evt]; if (!a) return;
    const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1);
  }
  emit(evt, data) {
    const a = this.listeners[evt]; if (!a) return;
    for (const cb of a) { try { cb(data); } catch (e) { console.error('[EventBus]', evt, e); } }
  }
}

/* ---------- IndexedDB KV ---------- */
const DB_NAME = 'haystack_db';
const DB_VER = 1;
const STORE = 'save';
let _dbp = null;

function openDB() {
  if (_dbp) return _dbp;
  _dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbp;
}

export async function idbSet(key, val) {
  try {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) {
    try { localStorage.setItem('haystack_' + key, JSON.stringify(val)); } catch (_) {}
  }
}

export async function idbGet(key) {
  try {
    const db = await openDB();
    const val = await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (val !== undefined) return val;
  } catch (e) {}
  try {
    const s = localStorage.getItem('haystack_' + key);
    return s ? JSON.parse(s) : null;
  } catch (_) { return null; }
}

/* ---------- Audio ---------- */
export class AudioSystem {
  constructor() { this.ctx = null; this.master = null; this.enabled = true; }
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    } catch (e) { console.warn('Audio unavailable', e); }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(()=>{}); }
  setVolume(v) { if (this.master) this.master.gain.value = v; }
  _tone(freq, dur, type, vol, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  _noise(dur, vol = 0.1, filterHz = 1200) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'hay_remove':
        this._noise(0.14, 0.09, 1400);
        this._tone(180 + Math.random() * 90, 0.09, 'sawtooth', 0.04);
        break;
      case 'hay_remove_big':
        this._noise(0.22, 0.13, 1000);
        this._tone(140 + Math.random() * 60, 0.14, 'sawtooth', 0.06);
        break;
      case 'find_item':
        this._tone(880, 0.14, 'triangle', 0.09);
        this._tone(1320, 0.18, 'triangle', 0.08, 0.06);
        break;
      case 'find_rare':
        [660, 880, 1320, 1760].forEach((f, i) => this._tone(f, 0.32, 'triangle', 0.13, i * 0.07));
        break;
      case 'coin':
        this._tone(1200, 0.08, 'square', 0.07);
        this._tone(1600, 0.1, 'square', 0.07, 0.06);
        break;
      case 'buy':
        this._tone(600, 0.1, 'square', 0.09);
        this._tone(900, 0.16, 'square', 0.08, 0.08);
        break;
      case 'sell':
        this._tone(500, 0.1, 'triangle', 0.09);
        this._tone(720, 0.12, 'triangle', 0.09, 0.08);
        break;
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.4, 'sine', 0.13, i * 0.09));
        break;
      case 'jump':
        this._tone(320, 0.1, 'sine', 0.06);
        break;
      case 'step':
        this._noise(0.05, 0.025, 900);
        break;
      case 'land':
        this._noise(0.09, 0.06, 700);
        this._tone(120, 0.08, 'sine', 0.05);
        break;
      case 'error':
        this._tone(200, 0.14, 'square', 0.08);
        break;
    }
  }
}

/* ---------- Helpers ---------- */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const randRange = (a, b) => a + Math.random() * (b - a);