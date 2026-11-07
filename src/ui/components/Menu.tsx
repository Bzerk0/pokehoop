import { useEffect, useState } from "react";
import { backBlip, moveBlip, selectBlip } from "../sound.ts";

export type MenuItem = { label: string; onSelect: () => void; note?: string };

/** Keyboard menu with a blinking ▶ cursor: arrows move, Enter/Space picks, Esc goes back. Mouse works too. */
export function Menu({ items, onBack, active = true }: { items: MenuItem[]; onBack?: () => void; active?: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
        moveBlip();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectBlip();
        items[index].onSelect();
      } else if (e.key === "Escape" && onBack) {
        backBlip();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, items, index, onBack]);

  return (
    <ul role="menu" className="m-0 list-none p-0">
      {items.map((item, i) => (
        <li
          key={item.label}
          role="menuitem"
          aria-current={i === index}
          className={`flex cursor-pointer items-center gap-2 py-[3px] ${i === index ? "text-gold" : "text-white"}`}
          onMouseEnter={() => i !== index && (setIndex(i), moveBlip())}
          onClick={() => (selectBlip(), item.onSelect())}
        >
          <span className={`w-[10px] ${i === index ? "blink" : "invisible"}`}>▶</span>
          <span>{item.label}</span>
          {item.note && <span className="text-fog">{item.note}</span>}
        </li>
      ))}
    </ul>
  );
}
