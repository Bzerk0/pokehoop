import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ATTRIBUTES, POSITIONS, type Attribute, type Position, type RatedPokemon } from "../../core/types.ts";
import { HomeLogo } from "../components/HomeLogo.tsx";
import { PlayerModal } from "../components/Modal.tsx";
import { MiniCard } from "../components/PlayerCard.tsx";
import { useRated } from "../data.ts";
import { backBlip } from "../sound.ts";
import { TYPE_COLOR } from "../theme/palette.ts";

type Sort = "ovr" | "dex" | "name" | Attribute;
const PAGE = 120;

const SORT_LABEL: Record<Sort, string> = {
  ovr: "OVR",
  dex: "DEX #",
  name: "NAME",
  speed: "SPEED",
  shooting: "SHOOTING",
  finishing: "FINISHING",
  handles: "HANDLES",
  passing: "PASSING",
  perimeterD: "PERIMETER D",
  interiorD: "INTERIOR D",
  rebounding: "REBOUNDING",
  strength: "STRENGTH",
  stamina: "STAMINA",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-head text-[8px] text-fog">{label}</span>
      {children}
    </label>
  );
}

export function Dex() {
  const navigate = useNavigate();
  const { data, error } = useRated();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [gen, setGen] = useState(0);
  const [mode, setMode] = useState<"classic" | "unlimited">("unlimited");
  const [pos, setPos] = useState<Position | "">("");
  const [sort, setSort] = useState<Sort>("ovr");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<RatedPokemon | null>(null);

  useEffect(() => setLimit(PAGE), [query, type, gen, mode, pos, sort]);

  // Esc goes back to the title menu (an open card closes first: PlayerModal takes that Esc)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      backBlip();
      navigate("/", { state: { menu: true } });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const list = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase().replace(/^#/, "");
    const ovrOf = (p: RatedPokemon) => p.ovr[pos || p.best];
    const out = data.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || String(p.id) === q) &&
        (!type || p.types.includes(type)) &&
        (!gen || p.generation === gen) &&
        (mode === "unlimited" || (!p.isLegendary && !p.isMythical)),
    );
    const key: (p: RatedPokemon) => number | string =
      sort === "ovr" ? ovrOf : sort === "dex" ? (p) => p.id : sort === "name" ? (p) => p.name : (p) => p.attrs[sort];
    const dir = sort === "dex" || sort === "name" ? 1 : -1; // numbers high → low, dex/name A → Z
    return out.sort((a, b) => {
      const ka = key(a), kb = key(b);
      return (ka < kb ? -1 : ka > kb ? 1 : a.id - b.id) * (ka === kb ? 1 : dir);
    });
  }, [data, query, type, gen, mode, pos, sort]);

  const gens = useMemo(() => [...new Set(data?.map((p) => p.generation))].sort((a, b) => a - b), [data]);

  return (
    <div className="mx-auto max-w-[1200px] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="m-0 flex items-center gap-3 font-head text-[20px] text-gold" style={{ textShadow: "2px 2px 0 var(--color-red)" }}>
          <HomeLogo />
          POKéDEX
        </h1>
        <button className="px-btn" onClick={() => navigate("/", { state: { menu: true } })}>◀ BACK (ESC)</button>
      </div>

      <div className="px-box mb-4 flex flex-wrap items-end gap-3 p-3">
        <Field label="SEARCH">
          <input className="px-input w-[180px]" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="name or #" autoFocus />
        </Field>
        <Field label="TYPE">
          <select className="px-input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">ALL</option>
            {Object.keys(TYPE_COLOR).sort().map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
          </select>
        </Field>
        <Field label="GEN">
          <select className="px-input" value={gen} onChange={(e) => setGen(Number(e.target.value))}>
            <option value={0}>ALL</option>
            {gens.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="POSITION">
          <select className="px-input" value={pos} onChange={(e) => setPos(e.target.value as Position | "")}>
            <option value="">BEST</option>
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="SORT BY">
          <select className="px-input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {(["ovr", "dex", "name", ...ATTRIBUTES] as Sort[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="POOL">
          <span className="flex gap-1">
            {(["classic", "unlimited"] as const).map((m) => (
              <button key={m} className="px-btn" aria-pressed={mode === m} onClick={() => setMode(m)}>{m.toUpperCase()}</button>
            ))}
          </span>
        </Field>
        <span className="ml-auto font-head text-[8px] text-cloud">{data ? `${list.length} POKéMON` : ""}</span>
      </div>

      {error && <div className="px-box p-3 text-red">{error}</div>}
      {!data && !error && <div className="font-head text-[10px] text-cloud blink">LOADING…</div>}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {list.slice(0, limit).map((p) => <MiniCard key={p.id} p={p} pos={pos || undefined} onOpen={() => setOpen(p)} />)}
      </div>
      {list.length > limit && (
        <div className="mt-4 text-center">
          <button className="px-btn" onClick={() => setLimit((l) => l + PAGE)}>SHOW MORE ▼</button>
        </div>
      )}
      {data && list.length === 0 && <div className="text-cloud">No Pokémon match those filters.</div>}

      {open && <PlayerModal p={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
