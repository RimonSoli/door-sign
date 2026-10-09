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
  bg: "#2f6b4f", bg2: "", fg: "#ffffff", photo: null, updatedAt: null
};

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const safeColor = c => (/^#[0-9a-f]{3,8}$/i.test(c || "") ? c : null);
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
  const bg2 = safeColor(s.bg2) || "";
  const fg = safeColor(s.fg) || "#ffffff";
  const photo = safePhoto(s.photo);
  const key = JSON.stringify([s.text || "", s.sub || "", s.emoji || "", s.font || "", bg, bg2, fg, photo ? photo.length + ":" + photo.slice(-64) : ""]);
  const metaText = meta && s.updatedAt ? fmtUpdated(s.updatedAt) : "";

  if (el.dataset.key === key) {
    const m = el.querySelector(".s-meta");
    if (m) { if (m.textContent !== metaText) m.textContent = metaText; }
    else if (metaText) el.insertAdjacentHTML("beforeend", `<div class="s-meta">${esc(metaText)}</div>`);
    return;
  }
  const first = !el.dataset.key;
  el.dataset.key = key;
  // A second background color makes a top-to-bottom gradient.
  el.style.setProperty("--s-bg", bg2 ? `linear-gradient(180deg, ${bg}, ${bg2})` : bg);
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

/* ---------- Scheduled statuses ----------
   settings.schedules = [{ id, statusId, type: "daily" | "dates", start, end, days }]
   daily: start/end "HH:MM", days = [0..6] (Sunday = 0); end at or before start runs past midnight.
   dates: start/end "YYYY-MM-DD", whole days, both included. */

function atTime(day, hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  const d = new Date(day); d.setHours(h || 0, m || 0, 0, 0); return d;
}
function atDate(ymd, addDays = 0) {
  const [y, mo, d] = String(ymd || "").split("-").map(Number);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d + addDays, 0, 0, 0, 0);
}

/** The window of this schedule that contains `now`, as {start, end} Dates, or null. */
export function activeWindow(sc, now = new Date()) {
  if (!sc || !sc.start || !sc.end) return null;
  if (sc.type === "dates") {
    const start = atDate(sc.start), end = atDate(sc.end, 1);
    return start && end && now >= start && now < end ? { start, end } : null;
  }
  const days = Array.isArray(sc.days) && sc.days.length ? sc.days : [0, 1, 2, 3, 4, 5, 6];
  for (const back of [0, 1]) {          // today's window, or last night's if it runs past midnight
    const day = new Date(now); day.setDate(day.getDate() - back);
    if (!days.includes(day.getDay())) continue;
    const start = atTime(day, sc.start);
    let end = atTime(day, sc.end);
    if (end <= start) end.setDate(end.getDate() + 1);
    if (now >= start && now < end) return { start, end };
  }
  return null;
}

/** The scheduled status showing right now, if any: {schedule, status, start, end}.
    Date ranges beat daily times; otherwise the window that started last wins. */
export function activeSchedule(schedules, statuses, now = new Date()) {
  let best = null;
  for (const sc of Array.isArray(schedules) ? schedules : []) {
    const status = (statuses || []).find(p => p && p.id === sc.statusId);
    if (!status) continue;
    const w = activeWindow(sc, now);
    if (!w) continue;
    const rank = sc.type === "dates" ? 1 : 0;
    if (!best || rank > best.rank || (rank === best.rank && w.start > best.start)) best = { schedule: sc, status, rank, ...w };
  }
  return best;
}

/** What the sign should show: the manual status, unless a schedule window started after the last manual update. */
export function effectiveStatus(current, settings, now = new Date()) {
  const act = activeSchedule(settings && settings.schedules, settings && settings.statuses, now);
  if (!act) return { status: current, scheduled: null };
  const manualAt = current && current.updatedAt ? Date.parse(current.updatedAt) : 0;
  if (manualAt && manualAt >= act.start.getTime()) return { status: current, scheduled: null };
  const { id, ...look } = act.status;
  return { status: { ...DEFAULT_STATUS, ...look, photo: null, updatedAt: null }, scheduled: act };
}
