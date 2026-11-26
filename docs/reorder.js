/* Press and hold a button, then drag it to a new spot. Shared by the editor and the desk touchscreen.

   A quick tap still taps, and a quick swipe still scrolls. Only a hold of about half a
   second picks the button up; then it follows the finger or mouse, the others make room,
   and letting go calls onDrop(newIdOrder). Dragging near the top or bottom edge scrolls.

   makeReorderable(container, {
     items: ".card",                   // which children can be moved
     idOf: el => el.dataset.p,         // each item's id
     scroller: element or window,      // what scrolls while dragging near an edge
     ignore: ".thumb-x",               // parts that never start a drag (e.g. delete buttons)
     onDrop: ids => save(ids)
   })  →  { get active() }   (true while something is being dragged; hold off redrawing then) */

const HOLD_MS = 450, SLOP = 10, EDGE = 60;
let styleAdded = false;
function addStyle() {
  if (styleAdded) return; styleAdded = true;
  const st = document.createElement("style");
  st.textContent = `.ro-ghost{position:fixed;z-index:50;pointer-events:none;margin:0;transform:scale(1.05);
      box-shadow:0 14px 40px rgba(0,0,0,.45)!important;opacity:.96;transition:none!important}
    .ro-spot{opacity:.25!important;outline:2px dashed rgba(127,127,127,.8);outline-offset:-2px}
    .ro-held{transform:scale(.96)!important;transition:transform .2s}
    body.ro-on, body.ro-on *{user-select:none!important;-webkit-user-select:none!important;cursor:grabbing!important}`;
  document.head.appendChild(st);
}

export function makeReorderable(container, { items, idOf, scroller = window, ignore = null, onDrop }) {
  addStyle();
  let press = null;   // {el, id, x, y, timer, pointerId}
  let drag = null;    // {el, ghost, dx, dy, startOrder, pointerId}
  let swallowClick = false, raf = 0, lastPt = null;

  const list = () => [...container.querySelectorAll(":scope > " + items)];
  const order = () => list().map(idOf);

  container.addEventListener("pointerdown", e => {
    if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (ignore && e.target.closest(ignore)) return;
    const el = e.target.closest(items);
    if (!el || el.parentElement !== container) return;
    cancelPress();
    press = { el, x: e.clientX, y: e.clientY, pointerId: e.pointerId,
      timer: setTimeout(() => startDrag(e.clientX, e.clientY), HOLD_MS) };
    el.classList.add("ro-held");
  });

  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer); press.el.classList.remove("ro-held"); press = null;
  }

  function startDrag() {
    if (!press) return;
    const el = press.el, r = el.getBoundingClientRect();
    el.classList.remove("ro-held");
    const ghost = el.cloneNode(true);
    ghost.classList.add("ro-ghost");
    ghost.style.width = r.width + "px"; ghost.style.height = r.height + "px";
    ghost.style.left = r.left + "px"; ghost.style.top = r.top + "px";
    document.body.appendChild(ghost);
    el.classList.add("ro-spot");
    document.body.classList.add("ro-on");
    drag = { el, ghost, dx: press.x - r.left, dy: press.y - r.top, startOrder: order(), pointerId: press.pointerId };
    try { el.setPointerCapture(press.pointerId); } catch (e) {}
    lastPt = { x: press.x, y: press.y };
    press = null;
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    raf = requestAnimationFrame(autoScroll);
  }

  addEventListener("pointermove", e => {
    if (press && e.pointerId === press.pointerId) {
      // Moved before the hold finished: it's a scroll or a swipe, not a drag.
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) cancelPress();
      return;
    }
    if (!drag || e.pointerId !== drag.pointerId) return;
    lastPt = { x: e.clientX, y: e.clientY };
    moveTo(e.clientX, e.clientY);
  }, { passive: true });

  function moveTo(x, y) {
    drag.ghost.style.left = (x - drag.dx) + "px";
    drag.ghost.style.top = (y - drag.dy) + "px";
    const under = document.elementFromPoint(x, y);
    const target = under && under.closest(items);
    if (!target || target === drag.el || target.parentElement !== container) return;
    const all = list(), from = all.indexOf(drag.el), to = all.indexOf(target);
    if (to > from) target.after(drag.el); else target.before(drag.el);
  }

  // While dragging, keep the page from scrolling under the finger.
  addEventListener("touchmove", e => { if (drag) e.preventDefault(); }, { passive: false });

  function autoScroll() {
    if (!drag) return;
    if (lastPt) {
      const box = scroller === window ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
      let dy = 0;
      if (lastPt.y < box.top + EDGE) dy = -Math.ceil((box.top + EDGE - lastPt.y) / 4);
      else if (lastPt.y > box.bottom - EDGE) dy = Math.ceil((lastPt.y - (box.bottom - EDGE)) / 4);
      if (dy) { (scroller === window ? window : scroller).scrollBy(0, dy); moveTo(lastPt.x, lastPt.y); }
    }
    raf = requestAnimationFrame(autoScroll);
  }

  function endDrag(save) {
    if (!drag) return;
    cancelAnimationFrame(raf);
    const { el, ghost, startOrder } = drag;
    ghost.remove(); el.classList.remove("ro-spot"); document.body.classList.remove("ro-on");
    drag = null;
    swallowClick = true; setTimeout(() => { swallowClick = false; }, 400);
    const now = order();
    if (save && now.join() !== startOrder.join()) onDrop(now);
    else if (!save) startOrder.forEach(id => { const n = list().find(x => idOf(x) === id); if (n) container.appendChild(n); });
  }

  addEventListener("pointerup", e => {
    if (press && e.pointerId === press.pointerId) cancelPress();
    if (drag && e.pointerId === drag.pointerId) endDrag(true);
  });
  addEventListener("pointercancel", e => {
    if (press && e.pointerId === press.pointerId) cancelPress();
    if (drag && e.pointerId === drag.pointerId) endDrag(true);
  });
  addEventListener("keydown", e => { if (e.key === "Escape" && drag) endDrag(false); });
  // A hold that picked something up is never also a tap.
  container.addEventListener("click", e => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
  container.addEventListener("contextmenu", e => { if (e.target.closest(items)) e.preventDefault(); });

  return { get active() { return !!drag; } };
}
