// Shared by the tablet sign (index.html) and the editor (edit.html).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const statusRef = doc(db, "sign", "current");
export const settingsRef = doc(db, "sign", "settings");

export const FONTS = {
  bricolage: { name: "Bold Sans", css: '"Bricolage Grotesque", system-ui, sans-serif', w: 800 },
  bebas: { name: "Tall Caps", css: '"Bebas Neue", Impact, sans-serif', w: 400 },
  archivo: { name: "Heavy", css: '"Archivo Black", "Arial Black", sans-serif', w: 400 },
  fraunces: { name: "Classic Serif", css: '"Fraunces", Georgia, serif', w: 600 },
  caveat: { name: "Handwritten", css: '"Caveat", "Comic Sans MS", cursive', w: 700 },
  pacifico: { name: "Script", css: '"Pacifico", "Brush Script MT", cursive', w: 400 },
  mono: { name: "Typewriter", css: '"Space Mono", ui-monospace, monospace', w: 700 }
};

export const DEFAULT_STATUS = {
  text: "Available", sub: "Come on in", emoji: "👋", font: "bricolage",
  bg: "#2f6b4f", fg: "#ffffff", photo: null, updatedAt: null
};

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const safeColor = c => (/^#[0-9a-f]{3,8}$/i.test(c || "") ? c : null);
const safePhoto = p => (typeof p === "string" && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(p) ? p : null);

export function fmtUpdated(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const today = new Date().toDateString() === d.toDateString();
  return "Updated " + (today ? "" : d.toLocaleDateString([], { month: "short", day: "numeric" }) + ", ") +
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Draws a status into a .sign element.
// The sign is rebuilt only when something visible changed (text, emoji, font,
// colors or photo). Otherwise just the small "Updated …" line is refreshed, so
// live updates and the once-a-minute refresh never make the sign flicker.
// With animate: true, a real change plays a short grow-in; the editor preview
// passes animate: false so typing doesn't animate on every keystroke.
export function paint(el, s, { meta = true, animate = true } = {}) {
  const f = FONTS[s.font] || FONTS.bricolage;
  const bg = safeColor(s.bg) || "#2f6b4f";
  const fg = safeColor(s.fg) || "#ffffff";
  const photo = safePhoto(s.photo);
  const key = JSON.stringify([s.text || "", s.sub || "", s.emoji || "", s.font || "", bg, fg, photo ? photo.length + ":" + photo.slice(-64) : ""]);
  const metaText = meta && s.updatedAt ? fmtUpdated(s.updatedAt) : "";

  if (el.dataset.key === key) {
    const m = el.querySelector(".s-meta");
    if (m) { if (m.textContent !== metaText) m.textContent = metaText; }
    else if (metaText) el.insertAdjacentHTML("beforeend", `<div class="s-meta">${esc(metaText)}</div>`);
    return;
  }
  const first = !el.dataset.key;
  el.dataset.key = key;
  el.style.setProperty("--s-bg", bg);
  el.style.setProperty("--s-fg", fg);
  el.style.setProperty("--s-font", f.css);
  el.innerHTML =
    (photo ? `<img class="s-photo" src="${photo}" alt="">` : "") +
    (s.emoji ? `<div class="s-emoji">${esc(s.emoji)}</div>` : "") +
    `<div class="s-text" style="font-weight:${f.w}">${esc(s.text || " ")}</div>` +
    (s.sub ? `<div class="s-sub">${esc(s.sub)}</div>` : "") +
    (metaText ? `<div class="s-meta">${esc(metaText)}</div>` : "");
  if (animate && !first) {
    el.classList.remove("animate"); void el.offsetWidth; el.classList.add("animate");
    clearTimeout(el._animT); el._animT = setTimeout(() => el.classList.remove("animate"), 700);
  }
}

export async function hashPin(p) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("office-door-sign:" + p));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
