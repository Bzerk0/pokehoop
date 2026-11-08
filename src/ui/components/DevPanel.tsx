import { useState } from "react";
import { liveDev, type Dev, type DevKey } from "../../game/dev.ts";
import { backBlip, moveBlip } from "../sound.ts";

/** A sensible nudge for a number: about a tenth of its default's size (0.01 at the least). */
function stepFor(dev: Dev, key: DevKey) {
  const d = Math.abs(dev.defaults[key]) || 1;
  return Math.max(0.001, 10 ** (Math.floor(Math.log10(d)) - 1));
}

/** The dev menu: every tuning number in one settings group (the live game's by default), grouped, searchable,
 *  changed in place and saved in this browser. */
export function DevPanel({ onClose, dev = liveDev, note = "CHANGES WORK AS SOON AS YOU RESUME AND ARE SAVED IN THIS BROWSER. COURT SIZE NEEDS A RESTART." }: {
  onClose: () => void;
  dev?: Dev;
  note?: string;
}) {
  const { defaults: DEV_DEFAULTS, groups: DEV_GROUPS, changed: devChanged, get: getDev, reset: resetDev, set: setDev } = dev;
  const [query, setQuery] = useState("");
  const [, refresh] = useState(0);
  const known = new Set(DEV_GROUPS.flatMap((g) => g.items.map(([k]) => k)));
  const groups = [
    ...DEV_GROUPS,
    { title: "EVERYTHING ELSE", items: Object.keys(DEV_DEFAULTS).filter((k) => !known.has(k)).map((k) => [k, ""] as [DevKey, string]) },
  ];
  const q = query.trim().toLowerCase();
  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter(([k, note]) => !q || k.toLowerCase().includes(q) || note.toLowerCase().includes(q) || g.title.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length);
  const changed = devChanged();

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80" role="dialog" aria-label="Dev menu">
      <div className="px-box flex max-h-[350px] w-[620px] flex-col gap-1 p-2">
        <div className="flex items-center gap-2">
          <p className="m-0 font-head text-[12px] text-gold">DEV MENU</p>
          <input
            className="px-input min-w-0 flex-1 !py-0 !text-[18px]"
            placeholder="search (e.g. quick, block)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button className="px-btn !py-0 !text-[18px]" disabled={!changed} onClick={() => (backBlip(), resetDev(), refresh((n) => n + 1))}>
            RESET ALL{changed ? ` (${changed})` : ""}
          </button>
          <button className="px-btn !py-0 !text-[18px]" onClick={() => (backBlip(), onClose())}>CLOSE (`)</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {shown.map((g) => (
            <div key={g.title} className="mb-1">
              <p className="m-0 mt-1 text-[16px] leading-[16px] text-fog">{g.title}</p>
              {g.items.map(([k, note]) => {
                const v = getDev(k), d = DEV_DEFAULTS[k], off = v !== d;
                return (
                  <label key={k} className="flex items-center gap-2 border-b border-slate py-[1px] text-[16px] leading-[18px]">
                    <span className={`w-[150px] shrink-0 truncate ${off ? "text-gold" : "text-white"}`}>{k}</span>
                    <span className="min-w-0 flex-1 truncate text-cloud">{note}</span>
                    <input
                      type="number"
                      className="px-input w-[80px] !py-0 text-right !text-[16px]"
                      value={v}
                      step={stepFor(dev, k)}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        if (Number.isFinite(n)) {
                          setDev(k, n);
                          refresh((x) => x + 1);
                        }
                      }}
                    />
                    <button
                      className="w-[56px] shrink-0 text-right text-[14px] text-steel hover:text-white disabled:invisible"
                      disabled={!off}
                      title={`back to ${d}`}
                      onClick={(e) => (e.preventDefault(), moveBlip(), resetDev(k), refresh((x) => x + 1))}
                    >
                      ↺ {d}
                    </button>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        <p className="m-0 text-center text-[14px] leading-[14px] text-steel">
          {note}
        </p>
      </div>
    </div>
  );
}
