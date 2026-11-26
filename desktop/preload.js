// Tells the app when the mouse (not a finger) moves onto the touchscreen, so it can send the
// mouse back to the main screen. Touch and pen are ignored, so tapping the strip still works.
const { ipcRenderer } = require("electron");

let last = 0;
function onPointer(e) {
  if (e.pointerType !== "mouse") return;
  const now = Date.now();
  if (now - last < 120) return;
  last = now;
  ipcRenderer.send("mouse-on-strip");
}
window.addEventListener("pointermove", onPointer, { capture: true, passive: true });
window.addEventListener("pointerdown", onPointer, { capture: true, passive: true });
