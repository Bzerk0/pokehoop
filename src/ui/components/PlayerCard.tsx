import { POSITIONS, type Attribute, type Position, type RatedPokemon } from "../../core/types.ts";
import { PALETTE, typeColor, typeInk } from "../theme/palette.ts";

/** Drawn at 1× its cropped size (2× if under 24px tall), times a whole-number page scale. Never fractional. */
export function Sprite({ p, scale = 1, className = "", eager = false }: { p: RatedPokemon; scale?: number; className?: string; eager?: boolean }) {
  const s = (p.spriteH < 24 ? 2 : 1) * scale;
  return (
    <img
      src={p.sprite}
      alt={p.name}
      width={p.spriteW * s}
      height={p.spriteH * s}
      loading={eager ? "eager" : "lazy"}
      draggable={false}
      className={className}
    />
  );
}

export function TypeChip({ type }: { type: string }) {
  return (
    <span
      className="px-[6px] text-[18px] uppercase leading-[18px]"
      style={{ background: typeColor(type), color: typeInk(type) }}
    >
      {type}
    </span>
  );
}

const ATTR_LABEL: Record<Attribute, string> = {
  speed: "SPEED",
  shooting: "SHOOT",
  finishing: "FINISH",
  handles: "HANDLE",
  passing: "PASS",
  perimeterD: "PER D",
  interiorD: "INT D",
  rebounding: "REBOUND",
  strength: "STRENGTH",
  stamina: "STAMINA",
};

const tierColor = (v: number) => (v >= 80 ? PALETTE.lime : v >= 60 ? PALETTE.gold : v >= 40 ? PALETTE.orange : PALETTE.red);

/** HP-style bar: 10 segments, lit by the value. */
function SegmentBar({ value }: { value: number }) {
  const lit = Math.round(value / 10);
  return (
    <span className="flex gap-[2px] border-2 border-black bg-black p-[2px]">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="h-[8px] w-[8px]" style={{ background: i < lit ? tierColor(value) : PALETTE.slate }} />
      ))}
    </span>
  );
}

/** Small grid tile: sprite, name, types, big OVR. */
export function MiniCard({ p, pos, onOpen }: { p: RatedPokemon; pos?: Position; onOpen: () => void }) {
  const shown = pos ?? p.best;
  return (
    <button
      onClick={onOpen}
      className="flex cursor-pointer flex-col border-4 bg-night p-2 text-left hover:bg-navy"
      style={{ borderColor: typeColor(p.types[0]), boxShadow: `3px 3px 0 ${PALETTE.black}` }}
    >
      <span className="flex items-start justify-between">
        <span className="font-head text-[8px] text-fog">#{String(p.id).padStart(4, "0")}</span>
        <span className="text-right">
          <span className="block font-head text-[16px] text-gold">{p.ovr[shown]}</span>
          <span className="block font-head text-[8px] text-cloud">{shown}</span>
        </span>
      </span>
      <span className="flex h-[96px] items-end justify-center">
        <Sprite p={p} />
      </span>
      <span className="mt-1 truncate text-[22px] text-white">{p.name}</span>
      <span className="flex flex-wrap gap-1">{p.types.map((t) => <TypeChip key={t} type={t} />)}</span>
    </button>
  );
}

/** The full card: type-coloured pixel frame, sprite, big OVR, every position OVR, segmented attribute bars. */
export function PlayerCard({ p }: { p: RatedPokemon }) {
  const frame = typeColor(p.types[0]);
  return (
    <div className="w-[300px] border-[6px] bg-night p-3" style={{ borderColor: frame, boxShadow: `4px 4px 0 ${PALETTE.black}` }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-head text-[8px] text-fog">#{String(p.id).padStart(4, "0")} · GEN {p.generation}</div>
          <div className="font-head text-[12px] leading-[18px] text-white">{p.name.toUpperCase()}</div>
          <div className="mt-1 flex gap-1">{p.types.map((t) => <TypeChip key={t} type={t} />)}</div>
        </div>
        <div className="text-right">
          <div className="font-head text-[28px] leading-[30px] text-gold" style={{ textShadow: `2px 2px 0 ${PALETTE.black}` }}>
            {p.ovr[p.best]}
          </div>
          <div className="font-head text-[10px] text-cloud">{p.best}</div>
        </div>
      </div>

      <div className="my-2 flex h-[200px] items-end justify-center bg-navy pb-2" style={{ borderBottom: `4px solid ${PALETTE.wood}` }}>
        <Sprite p={p} scale={2} />
      </div>

      <div className="mb-2 grid grid-cols-5 gap-1 text-center">
        {POSITIONS.map((pos) => (
          <div key={pos} className={`border-2 py-1 ${pos === p.best ? "border-gold" : "border-slate"}`}>
            <div className="font-head text-[8px] text-fog">{pos}</div>
            <div className="font-head text-[10px] text-white">{p.ovr[pos]}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-[3px]">
        {(Object.keys(ATTR_LABEL) as Attribute[]).map((a) => (
          <div key={a} className="flex items-center justify-between gap-2 text-[20px] leading-[18px]">
            <span className="w-[80px] text-cloud">{ATTR_LABEL[a]}</span>
            <span className="w-[24px] text-right text-white">{p.attrs[a]}</span>
            <SegmentBar value={p.attrs[a]} />
          </div>
        ))}
      </div>

      <div className="mt-2 text-[18px] text-fog">
        {p.heightM} m · {p.weightKg} kg{p.isLegendary ? " · LEGENDARY" : ""}{p.isMythical ? " · MYTHICAL" : ""}
      </div>
    </div>
  );
}
