// Door Sign Desk — the Windows app for the desk touchscreen strip (1920×480).
// It shows the Door Sign touch page full screen on the strip, starts when you sign in
// to Windows, and keeps a small tray menu. The page itself comes from the website, so
// new features reach every desk without reinstalling this app.

const { app, BrowserWindow, screen, Tray, Menu, shell, nativeImage, powerMonitor } = require("electron");
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
const placeSoon = () => { clearTimeout(placeTimer); placeTimer = setTimeout(placeWindow, 600); };

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
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
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
  // Start with Windows from the first run; it can be turned off in the tray menu.
  if (!cfg.autoStartSet) { app.setLoginItemSettings({ openAtLogin: true }); cfg.autoStartSet = true; saveCfg(); }
  createWindow();
  createTray();
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
app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", () => { if (quitting) app.quit(); });
