import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { DRAFT_REROLLS } from "../../core/ratingConfig.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { clearRun, loadRun, saveDraft, saveRun, saveTeam } from "../../storage.ts";
import { HomeLogo } from "../components/HomeLogo.tsx";
import { ChemistryList } from "../components/ChemistryList.tsx";
import { LineupCard, teamColor } from "../components/LineupCard.tsx";
import { Modal, PlayerModal, StatsButton } from "../components/Modal.tsx";
import { Sprite, TypeChip } from "../components/PlayerCard.tsx";
import { CapMeter, ColorPick, downloadCard, shareUrl } from "../components/TeamControls.tsx";
import { useRated } from "../data.ts";
import { backBlip, blip, moveBlip, selectBlip } from "../sound.ts";
import { inkOn, PALETTE, type PaletteName } from "../theme/palette.ts";
import { Arrow } from "../components/Arrow.tsx";

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
function OfferCard({ offer, p, index, state, chem, spot, onPick, onStats }: {
  offer: Offer; p: RatedPokemon; index: number; state: "open" | "selected" | "picked" | "passed";
  chem: { links: Link[]; boost: number }; spot?: number; onPick: () => void; onStats: () => void;
}) {
  const frame = TIER_COLOR[offer.tier];
  const lit = state === "selected" || state === "picked";
  // with a roster spot chosen first, the card rates the Pokémon there instead of at its best position
  const ovr = spot != null ? slotOvr(spot, p) : p.ovr[p.best];
  const at = spot != null ? `AT ${spot < STARTERS ? SLOTS[spot] : `BENCH (${p.best})`}` : `BEST AT ${p.best}`;
  const drop = spot != null && spot < STARTERS ? p.ovr[p.best] - ovr : 0;
  return (
    <div className="deal relative flex" style={{ animationDelay: `${index * 90}ms` }}>
      <button
        className={`offer flex w-full cursor-pointer flex-col border-4 bg-night text-left disabled:cursor-default ${state === "passed" ? "grayscale" : ""}`}
        style={{ borderColor: PALETTE[lit ? "white" : frame], boxShadow: `2px 2px 0 ${PALETTE.black}` }}
        onClick={onPick}
        disabled={state === "picked" || state === "passed"}
        aria-pressed={state === "selected"}
        aria-label={`${offer.tier}: ${p.name}, ${ovr} OVR ${at.toLowerCase()}, $${salary(p)}M${chem.boost ? `, +${chem.boost} chemistry` : ""}. Press ${index + 1}.`}
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
              <span className="block font-head text-[32px] leading-[32px] text-gold">
                {ovr}
                {drop > 0 && <span className="ml-2 font-body text-[24px] text-red">-{drop}</span>}
              </span>
              <span className="text-[20px] text-cloud">{at}</span>
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
function Roster({ draft, dex, placing, onPlace, spot, onSpot }: {
  draft: Draft; dex: Map<number, RatedPokemon>; placing?: RatedPokemon; onPlace?: (slot: number) => void;
  spot?: number | null; onSpot?: (slot: number) => void;
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
        if (!p && !placing && onSpot) {
          const on = spot === i;
          return (
            <button
              key={slot}
              className={`offer flex cursor-pointer flex-col border-4 px-1 text-left ${on ? "border-gold bg-slate" : "border-slate bg-night hover:bg-navy"}`}
              onClick={() => onSpot(i)}
              aria-pressed={on}
              aria-label={`Fill ${label} first`}
            >
              <span className="text-[20px] leading-[20px] text-gold">{label}</span>
              <span className="flex h-[56px] items-center justify-center">
                <span className={`text-[18px] leading-[18px] ${on ? "blink text-gold" : "text-cloud"}`}>{on ? "FILLING" : "FILL"}</span>
              </span>
              <span className="text-center text-[18px] leading-[18px] text-white">{on ? "▲ PICK" : " "}</span>
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
  const [spot, setSpot] = useState<number | null>(null); // a roster spot chosen before the Pokémon
  const [quitting, setQuitting] = useState(false); // QUIT pressed once: waiting for the confirm
  const [stats, setStats] = useState<RatedPokemon | null>(null);
  const [sharing, setSharing] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const card = useRef<HTMLDivElement>(null);

  // pick up a draft in progress (checked against the data before it's trusted)
  useEffect(() => {
    if (!dex || loaded) return;
    const stored = loadRun() as Run | null;
    const draft = stored && checkDraft(stored.draft, dex);
    if (draft) {
      setRun({ draft, name: String(stored!.name ?? "").slice(0, NAME_MAX), colors: stored!.colors ?? [9, 12] });
      setShowResults(!isOver(draft)); // a finished draft waits in the Last Draft box
    }
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
    setShowResults(true);
  };

  /** Select an offer (or unselect it); placing it on the roster is the second step. With a spot already chosen,
   *  the offer goes straight there. */
  const choose = (id: number) => {
    if (!run || call || isOver(run.draft)) return;
    if (spot != null) return place(spot, id);
    moveBlip();
    setSelected((s) => (s === id ? null : id));
  };

  /** Choose (or unchoose) an empty spot first; the offers then show how they'd rate there. */
  const chooseSpot = (slot: number) => {
    if (!run || call || isOver(run.draft)) return;
    moveBlip();
    setSpot((s) => (s === slot ? null : slot));
  };

  const place = (slot: number, id = selected) => {
    if (!run || !data || !dex || call || id == null || isOver(run.draft)) return;
    const text = pickCall(run.draft, id, slot, dex);
    blip(text === "FRANCHISE PLAYER!" || text === "CHEMISTRY!" ? 1320 : 990, 120);
    setCall({ id, text });
    setSelected(null);
    setSpot(null);
    setTimeout(() => {
      setRun((r) => (r ? { ...r, draft: pickOffer(r.draft, data, dex, id, slot) } : r));
      setCall(null);
    }, CALL_MS);
  };

  const drafting = loaded && !!run && !isOver(run.draft);

  /** Throw the draft away and go back to the draft's start screen, ready for a fresh one. */
  const quit = () => {
    backBlip();
    clearRun(); // now, not in the save effect: the page is gone before that would run
    setRun(null);
    setSelected(null);
    setSpot(null);
    setQuitting(false);
  };

  const doReroll = () => {
    if (!run || !data || !dex || call || run.draft.rerolls <= 0 || isOver(run.draft)) return;
    moveBlip();
    setSelected(null); // the chosen spot stays: the new offers rate there too
    setRun({ ...run, draft: reroll(run.draft, data, dex) });
  };

  // keys: 1–4 select, Enter places at the best fit, R rerolls, Esc unselects or leaves (the draft is kept)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape") {
        backBlip();
        if (selected != null) setSelected(null);
        else if (spot != null) setSpot(null);
        else if (drafting) setQuitting((q) => !q); // Esc asks first; a second Esc takes it back
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
        <HomeLogo />
        THE DRAFT
      </h1>
      {!drafting ? (
        <button className="px-btn" onClick={() => navigate("/", { state: { menu: true } })}>
          <Arrow left /> BACK<span className="hidden sm:inline"> (ESC)</span>
        </button>
      ) : quitting ? (
        <span className="flex flex-wrap justify-end gap-2" role="alert">
          <button className="px-btn" onClick={() => (backBlip(), setQuitting(false))}>KEEP DRAFTING</button>
          <button className="px-btn" style={{ background: PALETTE.red, color: PALETTE.white }} onClick={quit} autoFocus>QUIT, LOSE PICKS</button>
        </span>
      ) : (
        <button className="px-btn" onClick={() => (moveBlip(), setQuitting(true))}>
          ✕ QUIT<span className="hidden sm:inline"> (ESC)</span>
        </button>
      )}
    </div>
  );

  if (error) return <div className="mx-auto max-w-[1200px] p-4">{header}<div className="px-box p-3 text-red">{error}</div></div>;
  if (!dex || !data || !loaded) return <div className="mx-auto max-w-[1200px] p-4">{header}<div className="blink font-head text-[16px] text-cloud">LOADING…</div></div>;

  // ── setup ──────────────────────────────────────────────────────────────
  // the setup screen: no draft yet, or a finished one tucked into a Last Draft box (it stays saved for PLAY)
  if (!run || (isOver(run.draft) && !showResults)) {
    const last = run && isOver(run.draft) ? { ...toLineup(run.draft), name: run.name, colors: run.colors } : null;
    const today = dailySeed();
    return (
      <div className="mx-auto flex min-h-full max-w-[1200px] flex-col p-4">
        {header}
        <section className="mb-4 border-4 border-black bg-red px-4 py-5" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
          <p className="m-0 font-head text-[24px] leading-[1.3] text-white sm:text-[32px]">DRAFT YOUR STARTING 5</p>
        </section>
        {last && (() => {
          const grade = draftGrade(teamRating(last, dex)!);
          return (
            <section className="px-box mb-4 flex flex-wrap items-center gap-4 p-3" aria-label="Last draft">
              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center border-4 border-black bg-black">
                <span className="font-head text-[32px] text-gold">{grade}</span>
              </div>
              <div className="min-w-[180px]">
                <span className="block text-[20px] leading-[20px] text-cloud">LAST DRAFT</span>
                <span className="block font-head text-[16px] leading-[24px] text-white">{last.name || "MY DRAFT"}</span>
                <span className="block text-[20px] leading-[20px] text-cloud">
                  {GRADE_LINE[grade]} · OVR <span className="text-gold">{teamOvr(last, dex)}</span>
                </span>
              </div>
              <div className="flex items-end gap-1">
                {last.ids.slice(0, STARTERS).map((id) => {
                  const p = dex.get(id!)!;
                  return (
                    <span key={id} className="flex h-[56px] w-[56px] items-end justify-center overflow-hidden bg-navy" title={p.name}>
                      <Sprite p={p} eager className="max-w-none" />
                    </span>
                  );
                })}
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <button className="px-btn !bg-gold !text-black" onClick={() => (selectBlip(), navigate("/play", { state: { team: "draft" } }))}>SIM A GAME <Arrow /></button>
                <button className="px-btn" onClick={() => (selectBlip(), setShowResults(true))}>VIEW RESULTS</button>
              </div>
            </section>
          );
        })()}
        <div className="grid gap-4 md:grid-cols-2">
          <button
            className="offer flex cursor-pointer flex-col gap-2 border-4 border-gold bg-night p-4 text-left"
            style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}
            onClick={() => begin(true)}
          >
            <span className="font-head text-[24px] text-gold">DAILY DRAFT</span>
            <span className="text-[24px] leading-[1.2] text-white">Today's offers ({dateLabel(today)}), the same for everyone. Classic pool. Compare grades with friends.</span>
            <span className="mt-2 self-start border-2 border-black bg-gold px-3 py-1 text-[24px] text-black">START <Arrow /></span>
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
              START <Arrow />
            </button>
          </div>
        </div>
        {/* the tier guide and reroll rule sit at the bottom of the window, out of the way of the start buttons */}
        <div className="mt-auto pt-8">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
    const ink = PALETTE[inkOn(home)];
    const { boosts } = chemistry(lineup, dex);
    const stat = (label: string, value: string) => (
      <div className="border-4 border-black bg-black px-3 pb-1 pt-2">
        <span className="block font-head text-[24px] leading-[24px] text-gold">{value}</span>
        <span className="text-[20px] text-cloud">{label}</span>
      </div>
    );
    const panel = (title: string, children: React.ReactNode) => (
      <section className="px-box flex flex-col gap-2 p-3">
        <h2 className="m-0 font-head text-[16px] text-gold">{title}</h2>
        {children}
      </section>
    );
    return (
      <div className="mx-auto max-w-[1200px] p-4">
        {header}

        {/* the verdict: grade, what it means, the numbers behind it, and the next step */}
        <section className="mb-4 flex flex-wrap items-center gap-4 border-4 border-black p-4" style={{ background: PALETTE[home], boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
          <div className="pop flex h-[128px] w-[128px] shrink-0 items-center justify-center border-4 border-black bg-black">
            <span className="font-head text-[64px] leading-[64px] text-gold">{grade}</span>
          </div>
          <div className="flex min-w-[260px] flex-1 flex-col gap-3">
            <p className="m-0 font-head text-[24px] leading-[1.2]" style={{ color: ink }}>{GRADE_LINE[grade]}</p>
            <div className="flex flex-wrap gap-2">
              {stat("TEAM OVR", String(teamOvr(lineup, dex)))}
              {stat("RATING", rating.toFixed(1))}
              {stat("PAYROLL", `$${payroll(lineup, dex)}M`)}
              {stat("CHEMISTRY", `+${boosts.reduce((a, b) => a + b, 0)}`)}
            </div>
            <p className="m-0 text-[20px]" style={{ color: ink }}>
              {draft.daily ? `DAILY DRAFT ${dateLabel(draft.seed)}` : `QUICK DRAFT · ${draft.mode.toUpperCase()}`}
            </p>
          </div>
          {/* straight to Pre-Game with this team picked */}
          <button
            className="offer cursor-pointer border-4 border-black bg-gold px-6 py-4 font-head text-[24px] text-black sm:text-[32px]"
            style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}
            onClick={() => (selectBlip(), navigate("/play", { state: { team: "draft" } }))}
          >
            SIM A GAME <Arrow />
          </button>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          {/* the team on the court: starters big, the bench beneath */}
          <section className="border-4 border-black bg-wood p-3" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }} aria-label="Your roster">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {lineup.ids.map((id, i) => {
                const p = dex.get(id!)!;
                const bench = i >= STARTERS;
                return (
                  <Fragment key={i}>
                    {i === STARTERS && (
                      <div className="col-span-3 my-1 flex items-center gap-2 sm:col-span-5">
                        <span className="h-[4px] flex-1" style={{ background: PALETTE[teamColor(run.colors[1])] }} />
                        <span className="text-[24px] leading-[20px] text-black">BENCH</span>
                        <span className="h-[4px] flex-1" style={{ background: PALETTE[teamColor(run.colors[1])] }} />
                      </div>
                    )}
                  <div
                    className={`relative flex flex-col border-4 bg-night px-2 pb-2 ${bench && i === STARTERS ? "sm:col-start-2" : ""}`}
                    style={{ borderColor: PALETTE[teamColor(run.colors[bench ? 1 : 0])] }}
                  >
                    <span className="flex items-baseline justify-between text-[20px]">
                      <span className="text-cloud">{bench ? p.best : SLOTS[i]}</span>
                      <span>
                        {boosts[i] > 0 && <span className="text-lime">+{boosts[i]} </span>}
                        <span className="font-head text-[16px] text-gold">{boostedOvr(i, p, boosts[i])}</span>
                      </span>
                    </span>
                    <span className="flex h-[96px] items-end justify-center overflow-hidden">
                      <Sprite p={p} eager className="max-w-none" />
                    </span>
                    <span className="truncate text-center text-[20px] leading-[20px] text-white">{p.name}</span>
                    <span className="text-center text-[20px] leading-[20px] text-lime">${salary(p)}M</span>
                    <StatsButton p={p} onOpen={() => setStats(p)} className="absolute -bottom-[10px] -right-[10px]" />
                  </div>
                  </Fragment>
                );
              })}
            </div>
          </section>

          <div className="flex flex-col gap-4">
            {panel(
              "YOUR TEAM",
              <>
                <label>
                  <span className="sr-only">Team name</span>
                  <input className="px-input w-full" value={run.name} maxLength={NAME_MAX} onChange={(e) => setRun({ ...run, name: e.target.value })} />
                </label>
                <div className="flex gap-4">
                  <ColorPick label="HOME" value={run.colors[0]} onChange={(i) => setRun({ ...run, colors: [i, run.colors[1]] })} />
                  <ColorPick label="ACCENT" value={run.colors[1]} onChange={(i) => setRun({ ...run, colors: [run.colors[0], i] })} />
                </div>
                <span className="mt-1 text-[24px] leading-[24px] text-gold">CHEMISTRY</span>
                <ChemistryList lineup={lineup} dex={dex} />
              </>,
            )}
            {panel(
              "SAVE & SHARE",
              <div className="grid grid-cols-2 gap-2">
                <button className="px-btn" onClick={onSave}>SAVE TEAM</button>
                <button className="px-btn" onClick={onCopy}>{draft.daily ? "COPY RESULT" : "COPY LINK"}</button>
                <button className="px-btn col-span-2" onClick={() => (selectBlip(), setSharing(true))}>SHARE CARD</button>
              </div>,
            )}
            {panel(
              "NEXT",
              <div className="grid grid-cols-2 gap-2">
                <button className="px-btn" onClick={() => (selectBlip(), setShowResults(false))}>DRAFT AGAIN</button>
                <button className="px-btn" onClick={() => (saveDraft(lineup), navigate("/build"))}>EDIT IN FREE BUILD</button>
              </div>,
            )}
          </div>
        </div>

        {sharing && (
          <Modal title="SHARE CARD" onClose={() => setSharing(false)}>
            <div className="px-box flex flex-col gap-3 p-3">
              <div className="overflow-x-auto">
                <LineupCard ref={card} lineup={lineup} dex={dex} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="px-btn" onClick={() => card.current && downloadCard(card.current, run.name).catch(() => setToast("Couldn't make the picture"))}>DOWNLOAD PNG</button>
                <button className="px-btn" onClick={onCopy}>{draft.daily ? "COPY RESULT" : "COPY LINK"}</button>
              </div>
            </div>
          </Modal>
        )}
        {stats && <PlayerModal p={stats} onClose={() => setStats(null)} />}
        {toast && <div className="px-box fixed bottom-16 left-1/2 z-40 -translate-x-1/2 px-4 py-2 text-[24px] text-gold" role="status">{toast}</div>}
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
              {placing
                ? `PLACE ${placing.name.toUpperCase()}`
                : spot != null
                  ? `PICK YOUR ${spot < STARTERS ? SLOTS[spot] : "BENCH PLAYER"}`
                  : "PICK A POKéMON"}
            </p>
            <p className="m-0 text-[20px] text-cloud">
              {placing
                ? "CLICK A SPOT ON YOUR ROSTER · ENTER = BEST FIT · ESC = CHANGE PICK"
                : spot != null
                  ? "RATINGS SHOWN FOR THAT SPOT · ESC = CHANGE SPOT"
                  : "PICK ONE, THEN CHOOSE ITS SPOT · OR PICK A SPOT BELOW FIRST"}
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
              spot={spot ?? undefined}
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
      <Roster draft={draft} dex={dex} placing={call ? undefined : placing} onPlace={(s) => place(s)} spot={spot} onSpot={call ? undefined : chooseSpot} />
      {stats && <PlayerModal p={stats} onClose={() => setStats(null)} />}
    </div>
  );
}
