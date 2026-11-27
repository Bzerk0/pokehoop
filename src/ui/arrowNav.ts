/** Arrow keys move between buttons on any page or pop-up, so every menu works with the mouse and the keyboard
 *  (Enter/Space press the button, as browsers already do). It picks the nearest button in the arrow's direction.
 *  It stays out of the way of anything that handles arrows itself (preventDefault: the title menu, the live game),
 *  of text boxes and sliders, and of `[data-arrow-nav="off"]` (the live game) unless a pop-up is open there. */
const FOCUSABLE = 'button:not([disabled]), a[href], [role="menuitem"], [tabindex="0"]';
const DIRS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

function scope(): ParentNode | null {
  const dialogs = document.querySelectorAll('[role="dialog"]');
  if (dialogs.length) return dialogs[dialogs.length - 1]; // the pop-up on top
  return document.querySelector('[data-arrow-nav="off"]') ? null : document.body;
}

type Box = { left: number; top: number; right: number; bottom: number };
const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

/** The best box from `from` in direction [dx, dy]: wholly past its edge that way, scored by the gap ahead plus twice
 *  the sideways gap (0 when they overlap side-on, so a wide card right below wins), centres breaking ties. */
export function nearest(from: Box, [dx, dy]: [number, number], items: Box[]): number {
  let best = -1, score = Infinity;
  items.forEach((b, i) => {
    const ahead = dx > 0 ? b.left - from.right : dx < 0 ? from.left - b.right : dy > 0 ? b.top - from.bottom : from.top - b.bottom;
    if (ahead < -2) return;
    const side = dx ? Math.max(0, b.top - from.bottom, from.top - b.bottom) : Math.max(0, b.left - from.right, from.left - b.right);
    const drift = dx ? Math.abs((b.top + b.bottom - from.top - from.bottom) / 2) : Math.abs((b.left + b.right - from.left - from.right) / 2);
    const sc = ahead + 2 * side + drift / 100;
    if (sc < score) (score = sc), (best = i);
  });
  return best;
}

function onKey(e: KeyboardEvent) {
  const dir = DIRS[e.key];
  if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, select, [contenteditable]")) return;
  // after every other listener has had the key: one that used it (preventDefault) wins
  setTimeout(() => {
    if (e.defaultPrevented) return;
    const root = scope();
    if (!root) return;
    const els = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown);
    if (!els.length) return;
    const at = document.activeElement as HTMLElement | null;
    if (!at || !els.includes(at)) return els[0].focus(); // nothing chosen yet: start at the first
    const i = nearest(at.getBoundingClientRect(), dir, els.map((el) => el.getBoundingClientRect()));
    if (i >= 0) els[i].focus();
  });
}

export function installArrowNav() {
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
