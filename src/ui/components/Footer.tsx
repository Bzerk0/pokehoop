import { useState } from "react";
import { useLocation } from "react-router";
import { isTouch } from "../touch.ts";

export const DISCLAIMER =
  "Free fan project. Not affiliated with or endorsed by Nintendo, Game Freak, Creatures, or The Pokémon Company. Pokémon names and sprites belong to their respective owners.";

const STORE = "s5p-footer-small";
const read = () => {
  try {
    return localStorage.getItem(STORE) === "1";
  } catch {
    return false;
  }
};

/** The disclaimer on every page. Click it to fold it down to a small "i" in the corner (remembered); click that to
 *  bring it back. */
export function Footer() {
  const [small, setSmall] = useState(read);
  const [peek, setPeek] = useState(false);
  // a live game on a phone needs the whole screen (and its bottom corners for the thumbs): a small "i" up top-left,
  // tap it for the disclaimer
  const path = useLocation().pathname;
  if (isTouch() && path === "/play/live") {
    return peek ? (
      <button className="fixed inset-x-2 top-2 z-50 border-2 border-slate bg-black px-3 py-2 text-center text-[18px] text-fog" onClick={() => setPeek(false)}>
        {DISCLAIMER}
      </button>
    ) : (
      <button
        className="fixed left-[36px] top-[16px] z-50 flex h-[24px] w-[24px] items-center justify-center border-2 border-slate bg-black font-head text-[12px] text-fog"
        onClick={() => setPeek(true)}
        aria-label="Show the fan project disclaimer"
      >
        i
      </button>
    );
  }
  const toggle = () => {
    const next = !small;
    setSmall(next);
    try {
      localStorage.setItem(STORE, next ? "1" : "0");
    } catch {
      // not saved: it still folds for this visit
    }
  };
  if (small) {
    return (
      <button
        className="fixed bottom-2 left-2 z-50 flex h-[24px] w-[24px] cursor-pointer items-center justify-center border-2 border-slate bg-black font-head text-[12px] text-fog hover:text-white"
        onClick={toggle}
        aria-label="Show the fan project disclaimer"
        title={DISCLAIMER}
      >
        i
      </button>
    );
  }
  return (
    <footer className="shrink-0 border-t-2 border-slate bg-black px-4 py-2 text-center text-[18px] text-fog">
      <button className="cursor-pointer text-fog hover:text-cloud" onClick={toggle} title="Click to hide">
        {DISCLAIMER}
      </button>
    </footer>
  );
}
