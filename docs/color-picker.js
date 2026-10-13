/* Colour picker — shared component.
   Ported from the Financial Tracker (RimonSoli/Financial-Tracker-, index.html "colour picker")
   so every app uses the same picker: a saturation/brightness square, a hue bar, before/after
   preview, hex box, "Save to palette", and an editable list of saved colours.

   Use it in any app:
     import { createColorPicker } from "./color-picker.js";
     const picker = createColorPicker({
       getPalette: () => myPaletteArray,               // ["#RRGGBB", ...]
       setPalette: list => saveSomewhere(list),        // called when a colour is saved or removed
       emptyText: "Colours you save appear here."      // optional
     });
     picker.open("#1D5466", hex => { use the chosen hex });

   It brings its own styles (all class names start with "cpk-") and reads the page's
   --surface, --line, --bg, --ink (or --fg), --muted and --accent colours when they exist. */

const CSS = `
.cpk{position:fixed;inset:0;z-index:30;background:rgb(0 0 0/.5);display:flex;align-items:flex-end;justify-content:center}
.cpk[hidden]{display:none}
.cpk>div{background:var(--surface,#fff);color:var(--ink,var(--fg,#14212A));width:100%;max-width:420px;max-height:94%;overflow:auto;border-radius:16px 16px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));display:grid;gap:12px;box-sizing:border-box}
@media (min-width:640px){.cpk{align-items:center}.cpk>div{border-radius:16px}}
.cpk h2{font-size:20px;margin:0;font-weight:700}
.cpk-row{display:flex;align-items:center;gap:10px}
.cpk-between{justify-content:space-between}
.cpk-wrapr{flex-wrap:wrap}
.cpk-x{width:36px;height:36px;border-radius:50%;border:1px solid var(--line,#D3DBD9);background:var(--surface,#fff);color:inherit;font-size:20px;line-height:1;cursor:pointer}
.cpk-sv{position:relative;height:210px;border-radius:10px;touch-action:none;cursor:crosshair;background-image:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent)}
.cpk-hue{position:relative;height:22px;border-radius:11px;touch-action:none;cursor:pointer;background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)}
.cpk-th{position:absolute;width:22px;height:22px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px rgb(0 0 0/.35),0 2px 6px rgb(0 0 0/.35);transform:translate(-50%,-50%);pointer-events:none;box-sizing:border-box}
.cpk-hue .cpk-th{top:50%}
.cpk-pv{display:flex;border-radius:8px;overflow:hidden;border:1px solid var(--line,#D3DBD9);flex:none}
.cpk-pv i{display:block;width:34px;height:34px}
.cpk-hex{width:100px;font:600 15px ui-monospace,Menlo,monospace;padding:7px 9px;border:1px solid var(--line,#D3DBD9);border-radius:8px;background:var(--bg,#EDF1F0);color:var(--ink,var(--fg,#14212A));text-transform:uppercase;box-sizing:border-box}
.cpk-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#58686F);font-weight:600}
.cpk-pal{display:grid;grid-template-columns:repeat(auto-fill,minmax(34px,1fr));gap:6px}
.cpk-pal button{position:relative;aspect-ratio:1;max-width:100%;border-radius:8px;border:1px solid var(--line,#D3DBD9);padding:0;cursor:pointer}
.cpk-pal button.on{box-shadow:0 0 0 2px var(--surface,#fff),0 0 0 4px var(--ink,var(--fg,#14212A))}
.cpk-pal button span{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:var(--ink,var(--fg,#14212A));color:var(--bg,#fff);font-size:12px;line-height:18px}
.cpk-pal p{margin:0;grid-column:1/-1;font-size:12px;color:var(--muted,#58686F)}
.cpk-btn{border:1px solid var(--line,#D3DBD9);background:var(--surface,#fff);color:inherit;border-radius:8px;padding:8px 12px;font:inherit;font-weight:600;font-size:14px;cursor:pointer}
.cpk-btn.sm{padding:5px 9px;font-size:13px}
.cpk-btn.primary{background:var(--accent,#1D5466);color:var(--accent-ink,var(--accent-fg,#fff));border-color:var(--accent,#1D5466)}
.cpk-btn.link{border:0;background:none;padding:4px 0;color:var(--accent,#1D5466);font-size:12px}
.cpk-sv:focus-visible,.cpk-hue:focus-visible,.cpk button:focus-visible,.cpk input:focus-visible{outline:2px solid var(--accent,#1D5466);outline-offset:3px}
`;

const HTML = `<div role="dialog" aria-modal="true" aria-labelledby="cpkTitle">
  <div class="cpk-row cpk-between"><h2 id="cpkTitle">Choose a colour</h2><button type="button" class="cpk-x" data-cpk="cancel" aria-label="Close">×</button></div>
  <div class="cpk-sv" data-el="sv" tabindex="0" role="slider" aria-label="Shade: left to right is more colour, top to bottom is darker"><span class="cpk-th" data-el="svt"></span></div>
  <div class="cpk-hue" data-el="h" tabindex="0" role="slider" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><span class="cpk-th" data-el="ht"></span></div>
  <div class="cpk-row cpk-wrapr"><span class="cpk-pv" title="Before and after"><i data-el="old"></i><i data-el="new"></i></span><input class="cpk-hex" data-el="hex" maxlength="7" aria-label="Hex colour code" spellcheck="false"><button type="button" class="cpk-btn sm" data-cpk="save">Save to palette</button></div>
  <div><div class="cpk-row cpk-between" style="margin-bottom:6px"><span class="cpk-label">Saved colours</span><button type="button" class="cpk-btn link" data-cpk="edit" data-el="editBtn">Edit</button></div><div class="cpk-pal" data-el="pal"></div></div>
  <div class="cpk-row"><button type="button" class="cpk-btn primary" data-cpk="apply">Use this colour</button><button type="button" class="cpk-btn" data-cpk="cancel">Cancel</button></div>
</div>`;

const clamp = x => Math.max(0, Math.min(1, x));
export function hsv2hex(h, s, v) { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return "#" + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase(); }
export function hex2hsv(hex) { const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return { h, s: mx ? d / mx : 0, v: mx }; }

/** "#abc" or "#aabbcc" (any case) to "#AABBCC"; anything else gives the fallback. */
export function normHex(c, fallback = "#888888") {
  let v = String(c || "").trim(); if (v[0] !== "#") v = "#" + v;
  if (/^#[0-9a-f]{3}$/i.test(v)) v = "#" + [...v.slice(1)].map(x => x + x).join("");
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : fallback;
}

function drag(el, fn) { el.addEventListener("pointerdown", e => { e.preventDefault(); el.setPointerCapture(e.pointerId); fn(e); const mv = ev => fn(ev), up = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); }; el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); }); }

export function createColorPicker({ getPalette = () => [], setPalette = () => {}, emptyText = "Colours you save appear here, ready to reuse." } = {}) {
  if (!document.getElementById("cpk-style")) {
    const st = document.createElement("style"); st.id = "cpk-style"; st.textContent = CSS; document.head.appendChild(st);
  }
  const root = document.createElement("div");
  root.className = "cpk"; root.hidden = true; root.innerHTML = HTML;
  document.body.appendChild(root);
  const $ = n => root.querySelector(`[data-el="${n}"]`);
  const PK = { h: 0, s: 0, v: 0, orig: "#000000", edit: false, onApply: null, back: null };
  const pkHex = () => hsv2hex(PK.h, PK.s, PK.v);
  const pal = () => (getPalette() || []).map(c => normHex(c, null)).filter(Boolean);

  function pkUpd() {
    const hex = pkHex(), sv = $("sv"), palette = pal();
    sv.style.backgroundColor = "hsl(" + PK.h + ",100%,50%)";
    const t = $("svt"); t.style.left = PK.s * 100 + "%"; t.style.top = (1 - PK.v) * 100 + "%"; t.style.background = hex;
    const ht = $("ht"); ht.style.left = PK.h / 360 * 100 + "%"; ht.style.background = "hsl(" + PK.h + ",100%,50%)"; $("h").setAttribute("aria-valuenow", Math.round(PK.h));
    sv.setAttribute("aria-valuetext", hex);
    $("new").style.background = hex;
    if (document.activeElement !== $("hex")) $("hex").value = hex;
    $("editBtn").textContent = PK.edit ? "Done" : "Edit"; $("editBtn").hidden = !palette.length;
    $("pal").innerHTML = palette.length
      ? palette.map(c => '<button type="button" data-cpk="use" data-hex="' + c + '" style="background:' + c + '" class="' + (c === hex ? "on" : "") + '" aria-label="' + (PK.edit ? "Remove " : "Use ") + c + '">' + (PK.edit ? '<span aria-hidden="true">×</span>' : "") + "</button>").join("")
      : "<p></p>";
    if (!palette.length) $("pal").firstChild.textContent = emptyText;
  }

  drag($("sv"), e => { const r = $("sv").getBoundingClientRect(); PK.s = clamp((e.clientX - r.left) / r.width); PK.v = 1 - clamp((e.clientY - r.top) / r.height); pkUpd(); });
  drag($("h"), e => { const r = $("h").getBoundingClientRect(); PK.h = Math.min(359.9, clamp((e.clientX - r.left) / r.width) * 360); pkUpd(); });
  $("sv").addEventListener("keydown", e => { const st = e.shiftKey ? .1 : .02, m = { ArrowLeft: ["s", -st], ArrowRight: ["s", st], ArrowUp: ["v", st], ArrowDown: ["v", -st] }[e.key]; if (m) { e.preventDefault(); PK[m[0]] = clamp(PK[m[0]] + m[1]); pkUpd(); } });
  $("h").addEventListener("keydown", e => { const st = e.shiftKey ? 20 : 3, m = { ArrowLeft: -st, ArrowRight: st }[e.key]; if (m) { e.preventDefault(); PK.h = (PK.h + m + 360) % 360; pkUpd(); } });
  $("hex").addEventListener("input", e => { let v = e.target.value.trim(); if (v[0] !== "#") v = "#" + v; if (/^#[0-9a-f]{6}$/i.test(v)) { const x = hex2hsv(v); PK.s = x.s; PK.v = x.v; if (x.s) PK.h = x.h; pkUpd(); } });
  $("hex").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); apply(); } });
  root.addEventListener("click", e => {
    if (e.target === root) { close(); return; }
    const b = e.target.closest("[data-cpk]"); if (!b) return;
    const act = b.dataset.cpk;
    if (act === "cancel") close();
    else if (act === "apply") apply();
    else if (act === "edit") { PK.edit = !PK.edit; pkUpd(); }
    else if (act === "save") { const h = pkHex(), list = pal(); if (!list.includes(h)) setPalette([...list, h]); pkUpd(); }
    else if (act === "use") {
      const h = b.dataset.hex;
      if (PK.edit) { const list = pal().filter(x => x !== h); if (!list.length) PK.edit = false; setPalette(list); }
      else { const x = hex2hsv(h); PK.s = x.s; PK.v = x.v; if (x.s) PK.h = x.h; }
      pkUpd();
    }
  });
  root.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); close(); } });

  function close() { root.hidden = true; const back = PK.back; PK.back = null; if (back && back.focus) back.focus({ preventScroll: true }); }
  function apply() { const hex = pkHex(), fn = PK.onApply; close(); if (fn) fn(hex); }

  return {
    /** Opens on `current` (so it starts on the colour already in use) and calls onApply(hex) on "Use this colour". */
    open(current, onApply) {
      PK.onApply = onApply; PK.back = document.activeElement;
      PK.orig = normHex(current); Object.assign(PK, hex2hsv(PK.orig)); PK.edit = false;
      $("old").style.background = PK.orig; root.hidden = false; pkUpd(); $("sv").focus({ preventScroll: true });
    },
    close,
    /** Redraws the saved colours, e.g. after they change on another device. */
    refresh() { if (!root.hidden) pkUpd(); },
    get isOpen() { return !root.hidden; }
  };
}
