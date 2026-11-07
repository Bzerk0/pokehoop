import { useEffect, useState } from "react";

/** RPG-style text that types itself out. Pressing Enter or Space while it types shows it all at once
 *  (and that key press goes no further, so it doesn't also pick a menu item). */
export function Typewriter({ text, cps = 40 }: { text: string; cps?: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => setShown(0), [text]);

  useEffect(() => {
    if (shown >= text.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 1000 / cps);
    const skip = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setShown(text.length);
      }
    };
    window.addEventListener("keydown", skip, { capture: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", skip, { capture: true });
    };
  }, [shown, text, cps]);

  return <span>{text.slice(0, shown)}</span>;
}
