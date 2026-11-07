import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { chemistry, type Link } from "../../core/chemistry.ts";
import {
  bestSpot,
  checkDraft,
  chemPreview,
  dailySeed,
  draftGrade,
  isOver,
  openSlots,
  pickCall,
  pickOffer,
  reroll,
  startDraft,
  toLineup,
  type Draft,
  type Offer,
  type Tier,
} from "../../core/draft.ts";
import { boostedOvr, budgetFor, dexOf, NAME_MAX, payroll, salary, SLOTS, slotOvr, STARTERS, teamOvr, teamRating, type Lineup, type Mode } from "../../core/lineup.ts";
import { DRAFT_REROLLS, SALARY_CAP } from "../../core/ratingConfig.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { clearRun, loadRun, saveDraft, saveRun, saveTeam } from "../../storage.ts";
import { BALL_SIZE, BALL_URL } from "../art/ballLogo.ts";
import { ChemistryList } from "../components/ChemistryList.tsx";
import { LineupCard, teamColor } from "../components/LineupCard.tsx";
import { PlayerModal, StatsButton } from "../components/Modal.tsx";
import { Sprite, TypeChip } from "../components/PlayerCard.tsx";
import { CapMeter, ColorPick, downloadCard, shareUrl } from "../components/TeamControls.tsx";
import { useRated } from "../data.ts";
import { backBlip, blip, moveBlip, selectBlip } from "../sound.ts";
import { inkOn, PALETTE, type PaletteName } from "../theme/palette.ts";

/** Each tier's frame colour, like card rarities. */
const TIER_COLOR: Record<Tier, PaletteName> = { STAR: "gold", STARTER: "sky", ROLE: "green", SLEEPER: "lavender" };
const GRADE_LINE: Record<string, string> = {
  "A+": "CHAMPIONSHIP ROSTER",
  A: "TITLE CONTENDER",
  B: "PLAYOFF TEAM",
  C: "ON THE BUBBLE",
  D: "REBUILDING YEAR",
  F: "TANKING FOR PICKS",
};
const CALL_MS = 900;

/** The finished team's name and colours, kept with the draft so a reload doesn't lose them. */
type Run = { draft: Draft; name: string; colors: [number, number] };

const dateLabel = (seed: number) => `${String(seed).slice(0, 4)}-${String(seed).slice(4, 6)}-${String(seed).slice(6, 8)}`;

/** One offer: a card framed in its tier's colour, rated at its best position, with the chemistry it would bring. */
function OfferCard({ offer, p, index, state, chem, onPick, onStats }: {
  offer: Offer; p: RatedPokemon; index: number; state: "open" | "selected" | "picked" | "passed";
  chem: { links: Link[]; boost: number }; onPick: () => void; onStats: () => void;
}) {
  const frame = TIER_COLOR[offer.tier];
  const lit = state === "selected" || state === "picked";
  return (
    <div className="deal relative flex" style={{ animationDelay: `${index * 90}ms` }}>
      <button
        className={`offer flex w-full cursor-pointer flex-col border-4 bg-night text-left disabled:cursor-default ${state === "passed" ? "grayscale" : ""}`}
        style={{ borderColor: PALETTE[lit ? "white" : frame], boxShadow: `2px 2px 0 ${PALETTE.black}` }}
        onClick={onPick}
        disabled={state === "picked" || state === "passed"}
        aria-pressed={state === "selected"}
        aria-label={`${offer.tier}: ${p.name}, ${p.ovr[p.best]} OVR at ${p.best}, $${salary(p)}M${chem.boost ? `, +${chem.boost} chemistry` : ""}. Press ${index + 1}.`}
      >
        <span className="flex items-center justify-between px-2 py-[2px] pr-[36px] text-[20px]" style={{ background: PALETTE[frame], color: PALETTE[inkOn(frame)] }}>
          <span>{offer.tier}</span>
          <span>{state === "selected" ? "SELECTED" : `[${index + 1}]`}</span>
        </span>
        <span className="flex h-[200px] items-end justify-center overflow-hidden bg-navy pb-2">
          <Sprite p={p} scale={2} eager className="max-w-none" />
        </span>
        <span className="flex flex-col gap-1 p-2">
          <span className="truncate text-[24px] leading-[24px] text-white">{p.name}</span>
          <span className="flex flex-wrap gap-1">{p.types.map((t) => <TypeChip key={t} type={t} />)}</span>
          <span className="mt-1 flex items-end justify-between">
            <span>
              <span className="block font-head text-[32px] leading-[32px] text-gold">{p.ovr[p.best]}</span>
              <span className="text-[20px] text-cloud">BEST AT {p.best}</span>
            </span>
            <span className="text-[28px] leading-[28px] text-lime">${salary(p)}M</span>
          </span>
          {chem.boost > 0 && (
            <span className="text-[20px] leading-[18px] text-lime">
              +{chem.boost} CHEM: {chem.links.map((k) => k.name).join(", ")}
            </span>
          )}
        </span>
      </button>
      <StatsButton p={p} onOpen={onStats} className="absolute right-[6px] top-[4px]" />
    </div>
  );
}

/** The roster: one tile per spot. While a pick is selected, every open spot is a button showing how it would rate
 *  there; its best spot blinks. */
function Roster({ draft, dex, placing, onPlace }: {
  draft: Draft; dex: Map<number, RatedPokemon>; placing?: RatedPokemon; onPlace?: (slot: number) => void;
}) {
  const { boosts } = chemistry(toLineup(draft), dex);
  const best = placing && bestSpot(draft, placing);
  return (
    <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
      {SLOTS.map((slot, i) => {
        const p = draft.ids[i] != null ? dex.get(draft.ids[i]!) : undefined;
        const label = i < STARTERS ? slot : "BENCH";
        if (!p && placing && onPlace) {
          return (
            <button
              key={slot}
              className={`offer flex cursor-pointer flex-col border-4 bg-navy px-1 text-left hover:bg-slate ${i === best ? "border-gold" : "border-white"}`}
              onClick={() => onPlace(i)}
              aria-label={`Place ${placing.name} at ${label}: ${slotOvr(i, placing)} OVR${i === best ? ", best fit" : ""}`}
            >
              <span className="text-[20px] leading-[20px] text-gold">{label}</span>
              <span className="flex h-[56px] flex-col items-center justify-center">
                <span className="font-head text-[16px] text-gold">{slotOvr(i, placing)}</span>
                <span className={`text-[18px] leading-[18px] ${i === best ? "blink text-gold" : "text-cloud"}`}>{i === best ? "BEST FIT" : "PLACE"}</span>
              </span>
              <span className="text-center text-[18px] leading-[18px] text-white">▼ HERE</span>
            </button>
          );
        }
        return (
          <div key={slot} className={`flex flex-col border-4 bg-night px-1 ${p ? "border-slate" : "border-night"}`}>
            <span className="flex justify-between text-[20px] leading-[20px]">
              <span className="text-cloud">{label}</span>
              {p && (
                <span>
                  {boosts[i] > 0 && <span className="text-lime">+{boosts[i]} </span>}
                  <span className="text-gold">{boostedOvr(i, p, boosts[i])}</span>
                </span>
              )}
            </span>
            <span className="flex h-[56px] items-end justify-center overflow-hidden">
              {p && <Sprite key={p.id} p={p} eager className="land max-w-none" />}
            </span>
            <span className="truncate text-center text-[18px] leading-[18px] text-white">{p?.name ?? " "}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DraftPage() {
  const navigate = useNavigate();
  const { data, error } = useRated();
  const dex = useMemo(() => (data ? dexOf(data) : null), [data]);
  const [run, setRun] = useState<Run | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [call, setCall] = useState<{ id: number; text: string } | null>(null);
  const [quickMode, setQuickMode] = useState<Mode>("classic");
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [stats, setStats] = useState<RatedPokemon | null>(null);
  const card = useRef<HTMLDivElement>(null);

  // pick up a draft in progress (checked against the data before it's trusted)
  useEffect(() => {
    if (!dex || loaded) return;
    const stored = loadRun() as Run | null;
    const draft = stored && checkDraft(stored.draft, dex);
    if (draft) setRun({ draft, name: String(stored!.name ?? "").slice(0, NAME_MAX), colors: stored!.colors ?? [9, 12] });
    setLoaded(true);
  }, [dex, loaded]);
  useEffect(() => void (loaded && (run ? saveRun(run) : clearRun())), [run, loaded]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const begin = (daily: boolean) => {
    if (!data || !dex) return;
    selectBlip();
    const seed = daily ? dailySeed() : Date.now();
    const draft = startDraft(data, dex, daily ? "classic" : quickMode, seed, daily);
    setRun({ draft, name: daily ? `DAILY ${dateLabel(seed).slice(5)}` : "MY DRAFT", colors: [9, 12] });
  };

  /** Select an offer (or unselect it); placing it on the roster is the second step. */
  const choose = (id: number) => {
    if (!run || call || isOver(run.draft)) return;
    moveBlip();
    setSelected((s) => (s === id ? null : id));
  };

  const place = (slot: number) => {
    if (!run || !data || !dex || call || selected == null || isOver(run.draft)) return;
    const id = selected;
    const text = pickCall(run.draft, id, slot, dex);
    blip(text === "FRANCHISE PLAYER!" || text === "CHEMISTRY!" ? 1320 : 990, 120);
    setCall({ id, text });
    setSelected(null);
    setTimeout(() => {
      setRun((r) => (r ? { ...r, draft: pickOffer(r.draft, data, dex, id, slot) } : r));
      setCall(null);
    }, CALL_MS);
  };

  const doReroll = () => {
    if (!run || !data || !dex || call || run.draft.rerolls <= 0 || isOver(run.draft)) return;
    moveBlip();
    setSelected(null);
    setRun({ ...run, draft: reroll(run.draft, data, dex) });
  };

  // keys: 1–4 select, Enter places at the best fit, R rerolls, Esc unselects or leaves (the draft is kept)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape") {
        backBlip();
        if (selected != null) setSelected(null);
        else navigate("/", { state: { menu: true } });
      } else if (run && !isOver(run.draft) && /^[1-4]$/.test(e.key)) {
        const offer = run.draft.offers[Number(e.key) - 1];
        if (offer) choose(offer.id);
      } else if (e.key === "Enter" && run && dex && selected != null) {
        e.preventDefault();
        place(bestSpot(run.draft, dex.get(selected)!));
      } else if (e.key === "r" || e.key === "R") doReroll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const header = (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h1 className="m-0 flex items-center gap-2 font-head text-[16px] text-gold">
        <img src={BALL_URL} width={BALL_SIZE} height={BALL_SIZE} alt="" />
        THE DRAFT
      </h1>
      <button className="px-btn" onClick={() => navigate("/", { state: { menu: true } })}>
        ◀ BACK<span className="hidden sm:inline"> (ESC)</span>
      </button>
    </div>
  );

  if (error) return <div className="mx-auto max-w-[1200px] p-4">{header}<div className="px-box p-3 text-red">{error}</div></div>;
  if (!dex || !data || !loaded) return <div className="mx-auto max-w-[1200px] p-4">{header}<div className="blink font-head text-[16px] text-cloud">LOADING…</div></div>;

  // ── setup ──────────────────────────────────────────────────────────────
  if (!run) {
    const today = dailySeed();
    return (
      <div className="mx-auto max-w-[1200px] p-4">
        {header}
        <section className="mb-4 border-4 border-black bg-red px-4 py-5" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
          <p className="m-0 font-head text-[24px] leading-[1.3] text-white sm:text-[32px]">DRAFT YOUR STARTING 5</p>
          <p className="m-0 mt-3 max-w-[60ch] text-[24px] leading-[1.2] text-white">
            Eight rounds. Four Pokémon a round, one from each tier. Pick one, put it on any open spot, chase chemistry, stay under the ${SALARY_CAP}M cap, and see how your team grades out.
          </p>
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          <button
            className="offer flex cursor-pointer flex-col gap-2 border-4 border-gold bg-night p-4 text-left"
            style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}
            onClick={() => begin(true)}
          >
            <span className="font-head text-[24px] text-gold">DAILY DRAFT</span>
            <span className="text-[24px] leading-[1.2] text-white">Today's offers ({dateLabel(today)}), the same for everyone. Classic pool. Compare grades with friends.</span>
            <span className="mt-2 self-start border-2 border-black bg-gold px-3 py-1 text-[24px] text-black">START ▶</span>
          </button>
          <div className="flex flex-col gap-2 border-4 border-sky bg-night p-4" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
            <span className="font-head text-[24px] text-sky">QUICK DRAFT</span>
            <span className="text-[24px] leading-[1.2] text-white">New offers every time. Choose the pool:</span>
            <span className="flex gap-1" role="group" aria-label="Pool">
              {(["classic", "unlimited"] as const).map((m) => (
                <button key={m} className="px-btn" aria-pressed={quickMode === m} onClick={() => setQuickMode(m)}>{m}</button>
              ))}
            </span>
            <button className="offer mt-2 cursor-pointer self-start border-2 border-black bg-sky px-3 py-1 text-[24px] text-black" onClick={() => begin(false)}>
              START ▶
            </button>
          </div>
        </div>
        <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(TIER_COLOR) as Tier[]).map((t) => (
            <div key={t} className="border-4 bg-night p-3" style={{ borderColor: PALETTE[TIER_COLOR[t]] }}>
              <span className="block text-[24px]" style={{ color: PALETTE[TIER_COLOR[t]] }}>{t}</span>
              <span className="text-[20px] leading-[1.2] text-cloud">
                {{ STAR: "90+ OVR. Game-changers, priced like it.", STARTER: "78–89 OVR. Solid every night.", ROLE: "64–77 OVR. Fill a need cheaply.", SLEEPER: "Under 64. Bargains that fit the slot." }[t]}
              </span>
            </div>
          ))}
        </section>
        <p className="mt-3 text-[20px] text-cloud">{DRAFT_REROLLS} rerolls per draft: press R to swap a round's offers. Every offer is one you can afford.</p>
      </div>
    );
  }

  const { draft } = run;
  const lineup: Lineup = { ...toLineup(draft), name: run.name, colors: run.colors };

  // ── results ────────────────────────────────────────────────────────────
  if (isOver(draft)) {
    const rating = teamRating(lineup, dex)!;
    const grade = draftGrade(rating);
    const home = teamColor(run.colors[0]);
    const onSave = () => {
      const out = saveTeam(lineup);
      setToast(typeof out === "string" ? out : "Team saved to My Teams");
    };
    const onCopy = async () => {
      const text = draft.daily
        ? `STARTING 5 DAILY DRAFT ${dateLabel(draft.seed)}: GRADE ${grade}, OVR ${teamOvr(lineup, dex)} ${shareUrl(lineup)}`
        : shareUrl(lineup);
      try {
        await navigator.clipboard.writeText(text);
        setToast(draft.daily ? "Result and link copied" : "Link copied");
      } catch {
        setToast("Copy blocked by the browser");
      }
    };
    return (
      <div className="mx-auto max-w-[1200px] p-4">
        {header}
        <section className="mb-4 flex flex-wrap items-center gap-6 border-4 border-black px-4 py-4" style={{ background: PALETTE[home], boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
          <div className="pop flex h-[144px] w-[144px] shrink-0 items-center justify-center border-4 border-black bg-black">
            <span className="font-head text-[64px] leading-[64px] text-gold">{grade}</span>
          </div>
          <div className="min-w-[220px] flex-1">
            <p className="m-0 font-head text-[24px] leading-[1.3]" style={{ color: PALETTE[inkOn(home)] }}>{GRADE_LINE[grade]}</p>
            <p className="m-0 mt-2 text-[24px]" style={{ color: PALETTE[inkOn(home)] }}>
              TEAM OVR {teamOvr(lineup, dex)} (RATING {rating.toFixed(1)}) · PAYROLL ${payroll(lineup, dex)}M
              {draft.daily ? ` · DAILY ${dateLabel(draft.seed)}` : ` · ${draft.mode.toUpperCase()}`}
            </p>
          </div>
        </section>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-4">
            <div className="px-box flex flex-wrap items-center gap-4 p-3">
              <label className="min-w-[220px] flex-1">
                <span className="sr-only">Team name</span>
                <input className="px-input w-full" value={run.name} maxLength={NAME_MAX} onChange={(e) => setRun({ ...run, name: e.target.value })} />
              </label>
              <ColorPick label="HOME" value={run.colors[0]} onChange={(i) => setRun({ ...run, colors: [i, run.colors[1]] })} />
              <ColorPick label="ACCENT" value={run.colors[1]} onChange={(i) => setRun({ ...run, colors: [run.colors[0], i] })} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="px-btn" onClick={onSave}>SAVE TEAM</button>
              <button className="px-btn" onClick={onCopy}>{draft.daily ? "COPY RESULT" : "COPY LINK"}</button>
              <button className="px-btn" onClick={() => card.current && downloadCard(card.current, run.name).catch(() => setToast("Couldn't make the picture"))}>DOWNLOAD PNG</button>
              <button className="px-btn" onClick={() => (saveDraft(lineup), navigate("/build"))}>OPEN IN FREE BUILD</button>
              <button className="px-btn" onClick={() => (selectBlip(), setRun(null))}>DRAFT AGAIN</button>
            </div>
            <div className="px-box flex flex-col gap-2 p-3">
              <span className="font-head text-[16px] text-gold">CHEMISTRY</span>
              <ChemistryList lineup={lineup} dex={dex} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <LineupCard ref={card} lineup={lineup} dex={dex} />
          </div>
        </div>
        {toast && <div className="px-box fixed bottom-16 left-1/2 z-20 -translate-x-1/2 px-4 py-2 text-[24px] text-gold" role="status">{toast}</div>}
      </div>
    );
  }

  // ── a round ────────────────────────────────────────────────────────────
  const budget = budgetFor(toLineup(draft), openSlots(draft)[0], dex);
  const placing = selected != null ? dex.get(selected) : undefined;
  return (
    <div className="mx-auto max-w-[1200px] p-4">
      {header}
      <section className="mb-4 border-4 border-black bg-navy" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-4">
          <div>
            <p className="m-0 text-[24px] text-cloud">
              ROUND {draft.round + 1} OF {SLOTS.length}
              {draft.daily ? ` · DAILY ${dateLabel(draft.seed)}` : ` · ${draft.mode.toUpperCase()}`}
            </p>
            <p className="m-0 font-head text-[24px] leading-[1.3] text-gold sm:text-[32px]">
              {placing ? `PLACE ${placing.name.toUpperCase()}` : "PICK A POKéMON"}
            </p>
            <p className="m-0 text-[20px] text-cloud">
              {placing ? "CLICK A SPOT ON YOUR ROSTER · ENTER = BEST FIT · ESC = CHANGE PICK" : "PICK ONE, THEN CHOOSE ITS SPOT"}
            </p>
          </div>
          <button className="px-btn" onClick={doReroll} disabled={draft.rerolls <= 0 || !!call}>
            REROLL ({draft.rerolls}) <span className="hidden sm:inline">[R]</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-night px-4 py-3">
          <CapMeter used={payroll(toLineup(draft), dex)} />
          <span className="text-[24px] text-lime">BUDGET THIS PICK ${budget}M</span>
        </div>
      </section>

      <div className="relative">
        <div key={draft.deals} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {draft.offers.map((o, i) => (
            <OfferCard
              key={o.id}
              offer={o}
              p={dex.get(o.id)!}
              index={i}
              state={call ? (call.id === o.id ? "picked" : "passed") : selected === o.id ? "selected" : "open"}
              chem={chemPreview(draft, o.id, dex)}
              onPick={() => choose(o.id)}
              onStats={() => setStats(dex.get(o.id)!)}
            />
          ))}
        </div>
        {call && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status">
            <span className="pop border-4 border-black bg-black px-5 py-3 font-head text-[24px] text-gold sm:text-[32px]">{call.text}</span>
          </div>
        )}
      </div>

      <h2 className="mb-2 mt-5 font-head text-[16px] text-cloud">YOUR ROSTER</h2>
      <Roster draft={draft} dex={dex} placing={call ? undefined : placing} onPlace={place} />
      {stats && <PlayerModal p={stats} onClose={() => setStats(null)} />}
    </div>
  );
}
