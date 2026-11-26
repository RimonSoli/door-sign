// Door Sign Desk — the Windows app for the desk touchscreen strip (1920×480).
// It shows the Door Sign touch page full screen on the strip, starts when you sign in
// to Windows, and keeps a small tray menu. The page itself comes from the website, so
// new features reach every desk without reinstalling this app.

const { app, BrowserWindow, screen, Tray, Menu, shell, nativeImage, powerMonitor, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

const SITE = "https://rimonsoli.github.io/door-sign/";
const STRIP_URL = SITE + "strip.html";
const EDITOR_URL = SITE + "edit.html";
const RETRY_MS = 20000;

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null, tray = null, quitting = false, retryTimer = null, placeTimer = null, lastReloadDay = "";
let cfg = {};

/* ---------- Settings kept between runs ---------- */
const cfgPath = () => path.join(app.getPath("userData"), "settings.json");
function loadCfg() { try { return JSON.parse(fs.readFileSync(cfgPath(), "utf8")); } catch { return {}; } }
function saveCfg() { try { fs.writeFileSync(cfgPath(), JSON.stringify(cfg, null, 2)); } catch { /* not fatal */ } }

/* ---------- Which screen: the strip ---------- */
const ratio = d => d.bounds.width / d.bounds.height;
/** The screen picked in the tray menu, otherwise the widest-for-its-height screen (the 4:1 strip). */
function pickDisplay() {
  const all = screen.getAllDisplays();
  const saved = all.find(d => String(d.id) === String(cfg.displayId));
  if (saved) return { display: saved, strip: true };
  const strips = all.filter(d => ratio(d) >= 2.5).sort((a, b) => ratio(b) - ratio(a));
  if (strips.length) return { display: strips[0], strip: true };
  const primary = screen.getPrimaryDisplay();
  const touch = all.find(d => d.id !== primary.id && d.touchSupport === "available");
  if (touch) return { display: touch, strip: true };
  // No strip plugged in: a small window at the bottom of the main screen, not on top of everything.
  return { display: primary, strip: false };
}

function placeWindow() {
  if (!win) return;
  const { display, strip } = pickDisplay();
  const b = display.bounds;
  if (win.isFullScreen()) win.setFullScreen(false);
  if (strip) {
    win.setAlwaysOnTop(true, "floating");
    win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    win.setFullScreen(true);
  } else {
    win.setAlwaysOnTop(false);
    const wa = display.workArea, w = Math.min(1280, wa.width), h = Math.round(w / 4);
    win.setBounds({ x: wa.x + Math.round((wa.width - w) / 2), y: wa.y + wa.height - h, width: w, height: h });
  }
  if (!win.isVisible()) win.show();
}
const placeSoon = () => { clearTimeout(placeTimer); placeTimer = setTimeout(() => { placeWindow(); applyMouseLimit(); }, 600); };

/* ---------- Keep the mouse off the touchscreen ----------
   Windows is told to keep the mouse inside the other screens (ClipCursor), so it stops at
   the edge of the main screen just like at any outer edge. Fingers aren't affected: touch
   doesn't use the mouse pointer. Windows drops this limit after some events (locking the PC,
   some full-screen apps), so it's set again every second. If the other screens don't make a
   clean rectangle that leaves the strip out, the mouse is instead moved back to the edge.
   It can be turned off in the tray menu. */
let setCursorPos = null, clipCursor = null, clipTimer = null;
function loadCursorTools() {
  if (process.platform !== "win32") return;
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    koffi.struct("RECT", { left: "int32", top: "int32", right: "int32", bottom: "int32" });
    setCursorPos = user32.func("int __stdcall SetCursorPos(int x, int y)");
    clipCursor = user32.func("int __stdcall ClipCursor(const RECT *lpRect)");
  } catch (e) { setCursorPos = null; clipCursor = null; }
}
const keepMouseOff = () => cfg.keepMouseOff !== false;
const toPhys = r => (screen.dipToScreenRect ? screen.dipToScreenRect(null, r) : r);
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The rectangle covering every screen except the strip, or null if that rectangle would include the strip. */
function mouseArea() {
  const { display, strip } = pickDisplay();
  if (!strip) return null;
  const others = screen.getAllDisplays().filter(d => d.id !== display.id);
  if (!others.length) return null;
  const x1 = Math.min(...others.map(d => d.bounds.x)), y1 = Math.min(...others.map(d => d.bounds.y));
  const x2 = Math.max(...others.map(d => d.bounds.x + d.bounds.width)), y2 = Math.max(...others.map(d => d.bounds.y + d.bounds.height));
  const area = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  return overlaps(area, display.bounds) ? null : area;
}
function applyMouseLimit() {
  if (!clipCursor) return;
  const area = keepMouseOff() && win && win.isVisible() ? mouseArea() : null;
  try {
    if (!area) { clipCursor(null); return; }
    const p = toPhys(area);
    clipCursor({ left: p.x, top: p.y, right: p.x + p.width, bottom: p.y + p.height });
  } catch (e) { /* leave the mouse free */ }
}
function startMouseLimit() { clearInterval(clipTimer); applyMouseLimit(); clipTimer = setInterval(applyMouseLimit, 1000); }
function releaseMouse() { clearInterval(clipTimer); try { if (clipCursor) clipCursor(null); } catch (e) {} }

/** Backup for screen layouts the limit can't cover: put the mouse right back at the edge it crossed. */
let lastPush = 0;
function pushMouseBack() {
  if (!setCursorPos || !keepMouseOff() || !win || !win.isVisible()) return;
  const { display, strip } = pickDisplay();
  if (!strip) return;
  const now = Date.now(); if (now - lastPush < 100) return; lastPush = now;
  const p = screen.getCursorScreenPoint(), b = display.bounds;
  if (p.x < b.x || p.x >= b.x + b.width || p.y < b.y || p.y >= b.y + b.height) return;
  const others = screen.getAllDisplays().filter(d => d.id !== display.id);
  if (!others.length) return;
  let best = null;
  for (const d of others) {
    const r = d.bounds;
    const x = Math.min(Math.max(p.x, r.x), r.x + r.width - 1);
    const y = Math.min(Math.max(p.y, r.y), r.y + r.height - 1);
    const dist = (x - p.x) ** 2 + (y - p.y) ** 2;
    if (!best || dist < best.dist) best = { x, y, dist };
  }
  try {
    const phys = screen.dipToScreenPoint ? screen.dipToScreenPoint({ x: best.x, y: best.y }) : best;
    setCursorPos(Math.round(phys.x), Math.round(phys.y));
  } catch (e) { /* leave the mouse where it is */ }
  applyMouseLimit();
}
ipcMain.on("mouse-on-strip", pushMouseBack);

/* ---------- The window ---------- */
function offlinePage() {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;
    background:#eef0ec;color:#1c211d;font:600 4.5vh system-ui,sans-serif;text-align:center">
    <div>Can't reach the door sign right now.<br><span style="font-weight:400;color:#5e665f">Check the internet connection. Trying again in 20 seconds…</span></div>`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}
function loadStrip() { clearTimeout(retryTimer); if (win) win.loadURL(STRIP_URL); }

function createWindow() {
  win = new BrowserWindow({
    show: false, frame: false, backgroundColor: "#eef0ec", title: "Door Sign Desk",
    icon: path.join(__dirname, "assets", "icon.png"),
    skipTaskbar: true, autoHideMenuBar: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false,
      preload: path.join(__dirname, "preload.js") }
  });
  const wc = win.webContents;

  // Only the door sign website opens here; any other link opens in the normal browser.
  wc.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  wc.on("will-navigate", (e, url) => { if (!url.startsWith(SITE)) { e.preventDefault(); shell.openExternal(url); } });

  // No pinch or Ctrl+wheel zoom on a touch strip.
  wc.on("did-finish-load", () => { wc.setVisualZoomLevelLimits(1, 1).catch(() => {}); wc.setZoomFactor(1); });
  wc.on("zoom-changed", () => wc.setZoomFactor(1));

  // No internet: show a message and keep retrying.
  wc.on("did-fail-load", (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = navigation replaced, not a failure
    win.loadURL(offlinePage());
    clearTimeout(retryTimer); retryTimer = setTimeout(loadStrip, RETRY_MS);
  });
  wc.on("render-process-gone", () => setTimeout(loadStrip, 2000));

  // The strip is dedicated: closing (Alt+F4) just keeps it there. Quit is in the tray menu.
  win.on("close", e => { if (!quitting) e.preventDefault(); });

  placeWindow();
  loadStrip();
}

/* ---------- Tray menu ---------- */
function startsWithWindows() { return app.getLoginItemSettings().openAtLogin; }
function buildMenu() {
  const primaryId = screen.getPrimaryDisplay().id;
  const current = pickDisplay().display.id;
  const screens = screen.getAllDisplays().map((d, i) => ({
    label: `Screen ${i + 1}: ${d.size.width}×${d.size.height}${d.id === primaryId ? " (main screen)" : ""}`,
    type: "radio", checked: d.id === current,
    click: () => { cfg.displayId = d.id; saveCfg(); placeWindow(); }
  }));
  return Menu.buildFromTemplate([
    { label: "Door Sign Desk", enabled: false },
    { type: "separator" },
    { label: "Show it on", submenu: screens },
    { label: "Reload", click: () => loadStrip() },
    { label: "Open the full editor", click: () => shell.openExternal(EDITOR_URL) },
    { label: "Sign out of this desk", click: () => win && win.webContents.executeJavaScript("window.doorStrip && window.doorStrip.signOut()").catch(() => {}) },
    { type: "separator" },
    { label: "Keep the mouse off the touchscreen", type: "checkbox", checked: keepMouseOff(),
      click: item => { cfg.keepMouseOff = item.checked; saveCfg(); applyMouseLimit(); } },
    { label: "Start when I sign in to Windows", type: "checkbox", checked: startsWithWindows(),
      click: item => app.setLoginItemSettings({ openAtLogin: item.checked }) },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { label: "Quit Door Sign Desk", click: () => { quitting = true; app.quit(); } }
  ]);
}
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "assets", "tray.png")));
  tray.setToolTip("Door Sign Desk");
  tray.on("click", () => placeWindow());
  tray.on("right-click", () => tray.popUpContextMenu(buildMenu()));
  tray.setContextMenu(null);
}

/* ---------- Start ---------- */
app.on("second-instance", () => placeWindow());
app.whenReady().then(() => {
  cfg = loadCfg();
  loadCursorTools();
  // Start with Windows from the first run; it can be turned off in the tray menu.
  if (!cfg.autoStartSet) { app.setLoginItemSettings({ openAtLogin: true }); cfg.autoStartSet = true; saveCfg(); }
  createWindow();
  createTray();
  startMouseLimit();
  screen.on("display-added", placeSoon);
  screen.on("display-removed", placeSoon);
  screen.on("display-metrics-changed", placeSoon);
  powerMonitor.on("resume", () => { placeSoon(); setTimeout(loadStrip, 5000); });
  // Pick up website updates overnight: reload once a day around 4 a.m.
  setInterval(() => {
    const now = new Date(), day = now.toDateString();
    if (now.getHours() === 4 && lastReloadDay !== day) { lastReloadDay = day; loadStrip(); }
  }, 10 * 60 * 1000);
});
app.on("before-quit", () => { quitting = true; releaseMouse(); });
app.on("window-all-closed", () => { if (quitting) app.quit(); });
