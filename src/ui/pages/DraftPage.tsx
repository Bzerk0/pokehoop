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
import { ARCADE, DRAFT_REROLLS } from "../../core/ratingConfig.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { clearRun, loadRun, saveDraft, saveRun, saveTeam } from "../../storage.ts";
import { HomeLogo } from "../components/HomeLogo.tsx";
import { ChemistryList } from "../components/ChemistryList.tsx";
import { LineupCard, teamColor } from "../components/LineupCard.tsx";
import { Modal, PlayerModal, StatsButton } from "../components/Modal.tsx";
import { Sprite, TypeChip } from "../components/PlayerCard.tsx";
import { CapMeter, ColorPick, downloadCard, shareUrl } from "../components/TeamControls.tsx";
import { useRated } from "../data.ts";
import { backBlip, blip, moveBlip, selectBlip, slotSpin } from "../sound.ts";
import { inkOn, PALETTE, type PaletteName } from "../theme/palette.ts";
import { Arrow } from "../components/Arrow.tsx";
import { GAME_NAME } from "../name.ts";
import { draftDev } from "../../game/dev.ts";
import { DevPanel } from "../components/DevPanel.tsx";
import { FullDraftView } from "../components/FullDraftView.tsx";
import { BALL_URL } from "../art/ballLogo.ts";
import { ARCH, corners, GOLD, Lights, Shine, SpinReel } from "../components/slotParts.tsx";
import { useMusic } from "../bgm.ts";

draftDev.apply(); // the slot machine odds you set in the draft dev menu (` on this page)

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
        <span className="flex h-[120px] items-end justify-center overflow-hidden bg-navy pb-1">
          <Sprite p={p} scale={p.spriteH > 60 ? 1 : 2} eager className="max-w-none" />
        </span>
        <span className="flex flex-col gap-[2px] px-2 py-1">
          <span className="truncate text-[22px] leading-[22px] text-white">{p.name}</span>
          <span className="flex flex-wrap gap-1">{p.types.map((t) => <TypeChip key={t} type={t} />)}</span>
          <span className="mt-1 flex items-end justify-between">
            <span>
              <span className="block font-head text-[24px] leading-[26px] text-gold">
                {ovr}
                {drop > 0 && <span className="ml-2 font-body text-[24px] text-red">-{drop}</span>}
              </span>
              <span className="text-[20px] text-cloud">{at}</span>
            </span>
            <span className="text-[28px] leading-[28px] text-lime">${salary(p)}M</span>
          </span>
          {/* always one line, even when empty, so a chemistry bonus never makes this card taller than the others */}
          <span className="h-[18px] truncate text-[18px] leading-[18px] text-lime" title={chem.links.map((k) => k.name).join(", ")}>
            {chem.boost > 0 ? `+${chem.boost} CHEM: ${chem.links.map((k) => k.name).join(", ")}` : ""}
          </span>
        </span>
      </button>
      <StatsButton p={p} onOpen={onStats} className="absolute right-[6px] top-[4px]" />
    </div>
  );
}

/** The roster: one tile per spot. While a pick is selected, every open spot is a button showing how it would rate
 *  there; its best spot blinks. */
function Roster({ draft, dex, placing, onPlace, spot, onSpot, onStats }: {
  draft: Draft; dex: Map<number, RatedPokemon>; placing?: RatedPokemon; onPlace?: (slot: number) => void;
  spot?: number | null; onSpot?: (slot: number) => void; onStats?: (p: RatedPokemon) => void;
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
          <div key={slot} className={`relative flex flex-col border-4 bg-night px-1 ${p ? "border-slate" : "border-night"}`}>
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
            {p && onStats && <StatsButton p={p} onOpen={() => onStats(p)} className="absolute -bottom-[10px] -right-[10px] z-10" />}
          </div>
        );
      })}
    </div>
  );
}

export function DraftPage() {
  useMusic("menu");
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
  // the slot machine: which deal's reels have been pulled and shown, how many reels have stopped, the handle
  const [revealed, setRevealed] = useState(-1);
  const [spinning, setSpinning] = useState(false);
  const [stopped, setStopped] = useState(0);
  const [lever, setLever] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [full, setFull] = useState<{ mode: Mode; seed: number } | null>(null); // a FULL DRAFT in progress
  const [fullMode, setFullMode] = useState<Mode>("classic");
  const latest = useRef<Draft | null>(null);
  latest.current = run?.draft ?? null;

  // pick up a draft in progress (checked against the data before it's trusted)
  useEffect(() => {
    if (!dex || loaded) return;
    const stored = loadRun() as Run | null;
    const draft = stored && checkDraft(stored.draft, dex);
    if (draft) {
      setRun({ draft, name: String(stored!.name ?? "").slice(0, NAME_MAX), colors: stored!.colors ?? [9, 12] });
      setShowResults(!isOver(draft)); // a finished draft waits in the Last Draft box
      setRevealed(draft.deals);
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
    if (ARCADE.price.perDraft >= 1) draftDev.set("price.seed", seed % 100000); // new price tweaks for this draft
    const draft = startDraft(data, dex, daily ? "classic" : quickMode, seed, daily);
    setRun({ draft, name: daily ? `DAILY ${dateLabel(seed).slice(5)}` : "MY DRAFT", colors: [9, 12] });
    setShowResults(true);
    setRevealed(-1); // pull the handle for the first round
  };

  /** Pull the handle: the reels spin, then stop one by one (a STAR lands with a flash and a jingle). */
  const pull = () => {
    const d = latest.current;
    if (!d || spinning || call || isOver(d)) return;
    blip(196, 90, 0.06);
    setLever(true);
    setTimeout(() => setLever(false), 700);
    setSpinning(true);
    setStopped(0);
    const reels = d.offers.length;
    slotSpin((650 + (reels - 1) * 380) / 1000); // the whirl until the last reel stops
    for (let i = 0; i < reels; i++)
      setTimeout(() => {
        setStopped(i + 1);
        blip(260 + i * 90, 70, 0.06);
        if (latest.current?.offers[i]?.tier === "STAR") [1047, 1319, 1568, 2093].forEach((f, k) => setTimeout(() => blip(f, 70, 0.05), 80 + k * 70));
      }, 650 + i * 380);
    setTimeout(() => {
      setSpinning(false);
      setRevealed(latest.current?.deals ?? -1);
    }, 650 + (reels - 1) * 380 + 150);
  };

  /** The Full Draft's finished picks become this draft's team (results, PLAY and all). */
  const finishFull = (ids: (number | null)[]) => {
    if (!full) return;
    const draft: Draft = { seed: full.seed, mode: full.mode, daily: false, round: SLOTS.length, ids, offers: [], rerolls: 0, deals: 0 };
    setRun({ draft, name: "MY DRAFT", colors: [9, 12] });
    setFull(null);
    setShowResults(true);
  };

  /** Select an offer (or unselect it); placing it on the roster is the second step. With a spot already chosen,
   *  the offer goes straight there. */
  const choose = (id: number) => {
    if (!run || call || isOver(run.draft) || revealed !== run.draft.deals) return;
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

  const drafting = (loaded && !!run && !isOver(run.draft)) || !!full;

  /** Throw the draft away and go back to the draft's start screen, ready for a fresh one. */
  const quit = () => {
    backBlip();
    clearRun(); // now, not in the save effect: the page is gone before that would run
    setRun(null);
    setSelected(null);
    setSpot(null);
    setQuitting(false);
    setFull(null);
  };

  const doReroll = () => {
    if (!run || !data || !dex || call || spinning || run.draft.rerolls <= 0 || isOver(run.draft) || revealed !== run.draft.deals) return;
    setSelected(null); // the chosen spot stays: the new offers rate there too
    const next = reroll(run.draft, data, dex);
    latest.current = next;
    setRun({ ...run, draft: next });
    pull();
  };

  // keys: 1–4 select, Enter places at the best fit, R rerolls, Esc unselects or leaves (the draft is kept)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Backquote") return void (e.preventDefault(), setDevOpen((o) => !o)); // the draft dev menu
      if (devOpen || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if ((e.key === " " || e.key === "Enter") && run && !isOver(run.draft) && revealed !== run.draft.deals) return void (e.preventDefault(), pull());
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

  const devMenu = devOpen && (
    <div className="fixed inset-0 z-50">
      <DevPanel dev={draftDev} onClose={() => setDevOpen(false)} note="SLOT MACHINE ODDS: THEY APPLY FROM THE NEXT PULL, AND ARE SAVED IN THIS BROWSER." />
    </div>
  );

  if (full)
    return (
      <div className="mx-auto max-w-[1200px] p-4">
        {header}
        <FullDraftView pool={data} dex={dex} mode={full.mode} seed={full.seed} onDone={finishFull} />
        {devMenu}
      </div>
    );

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
          <p className="m-0 mt-1 text-[24px] text-white">ARCADE DRAFT: 8 pulls of the slot machine. FULL DRAFT: a real draft against 7 CPU teams.</p>
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
                <button className="px-btn !bg-gold !text-black" onClick={() => (selectBlip(), navigate("/play", { state: { team: "draft" } }))}>TEST YOUR TEAM <Arrow /></button>
                <button className="px-btn" onClick={() => (selectBlip(), setShowResults(true))}>VIEW RESULTS</button>
              </div>
            </section>
          );
        })()}
        <div className="grid gap-4 md:grid-cols-3">
          <button
            className="offer flex cursor-pointer flex-col gap-2 border-4 border-gold bg-night p-4 text-left"
            style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}
            onClick={() => begin(true)}
          >
            <span className="font-head text-[24px] text-gold">DAILY ARCADE</span>
            <span className="text-[24px] leading-[1.2] text-white">Today's offers ({dateLabel(today)}), the same for everyone. Classic pool. Compare grades with friends.</span>
            <span className="mt-2 self-start border-2 border-black bg-gold px-3 py-1 text-[24px] text-black">START <Arrow /></span>
          </button>
          <div className="flex flex-col gap-2 border-4 border-sky bg-night p-4" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
            <span className="font-head text-[24px] text-sky">QUICK ARCADE</span>
            <span className="text-[24px] leading-[1.2] text-white">New pulls every time. Choose the pool:</span>
            <span className="flex gap-1" role="group" aria-label="Pool">
              {(["classic", "unlimited"] as const).map((m) => (
                <button key={m} className="px-btn" aria-pressed={quickMode === m} onClick={() => setQuickMode(m)}>{m}</button>
              ))}
            </span>
            <button className="offer mt-2 cursor-pointer self-start border-2 border-black bg-sky px-3 py-1 text-[24px] text-black" onClick={() => begin(false)}>
              START <Arrow />
            </button>
          </div>
          <div className="flex flex-col gap-2 border-4 border-red bg-night p-4" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
            <span className="font-head text-[24px] text-red">FULL DRAFT</span>
            <span className="text-[24px] leading-[1.2] text-white">A real draft: a lottery sets the order, 7 CPU teams pick too. Choose the pool:</span>
            <span className="flex gap-1" role="group" aria-label="Full draft pool">
              {(["classic", "unlimited"] as const).map((m) => (
                <button key={m} className="px-btn" aria-pressed={fullMode === m} onClick={() => setFullMode(m)}>{m}</button>
              ))}
            </span>
            <button className="offer mt-2 cursor-pointer self-start border-2 border-black bg-red px-3 py-1 text-[24px] text-white" onClick={() => {
                selectBlip();
                const seed = Date.now() >>> 0;
                if (ARCADE.price.perDraft >= 1) draftDev.set("price.seed", seed % 100000); // new price tweaks for this draft
                setFull({ mode: fullMode, seed });
              }}>
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
        <p className="mt-3 text-[20px] text-cloud">ARCADE: {DRAFT_REROLLS} re-spins per draft (R). Better ranks are rarer, but most pulls land a STAR. Every Pokémon offered is one you can afford.</p>
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
        ? `${GAME_NAME} DAILY DRAFT ${dateLabel(draft.seed)}: GRADE ${grade}, OVR ${teamOvr(lineup, dex)} ${shareUrl(lineup)}`
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
            className="offer flash-outline cursor-pointer border-4 border-black bg-gold px-6 py-4 font-head text-[24px] text-black sm:text-[32px]"
            style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}
            onClick={() => (selectBlip(), navigate("/play", { state: { team: "draft" } }))}
          >
            TEST YOUR TEAM <Arrow />
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
                <button className="px-btn mt-2 w-full" onClick={onSave}>SAVE TEAM</button>
              </>,
            )}
            {panel(
              "SHARE",
              <div className="grid grid-cols-2 gap-2">
                <button className="px-btn" onClick={onCopy}>{draft.daily ? "COPY RESULT" : "COPY LINK"}</button>
                <button className="px-btn" onClick={() => (selectBlip(), setSharing(true))}>SHARE CARD</button>
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
  // faces to flick past on each spinning reel (just for show)
  const reelFaces = draft.offers.map((_, i) => Array.from({ length: 6 }, (_, k) => data[(draft.deals * 97 + i * 31 + k * 53) % data.length]));
  const placing = selected != null ? dex.get(selected) : undefined;
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-2">
      {header}
      <section className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 border-4 border-black bg-navy px-3 py-2" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
        <div className="min-w-0">
          <p className="m-0 text-[20px] leading-[20px] text-cloud">
            ROUND {draft.round + 1} OF {SLOTS.length}
            {draft.daily ? ` · DAILY ${dateLabel(draft.seed)}` : ` · ${draft.mode.toUpperCase()}`}
          </p>
          <p className="m-0 font-head text-[18px] leading-[26px] text-gold">
            {revealed !== draft.deals && !spinning
              ? "PULL THE HANDLE!"
              : spinning
                ? "SPINNING…"
                : placing
                  ? `PLACE ${placing.name.toUpperCase()}`
                  : spot != null
                    ? `PICK YOUR ${spot < STARTERS ? SLOTS[spot] : "BENCH PLAYER"}`
                    : "PICK A POKéMON"}
          </p>
          <p className="m-0 text-[18px] leading-[18px] text-cloud">
            {placing
              ? "CLICK A SPOT ON YOUR ROSTER · ENTER = BEST FIT · ESC = CHANGE PICK"
              : spot != null
                ? "RATINGS SHOWN FOR THAT SPOT · ESC = CHANGE SPOT"
                : "PICK ONE, THEN ITS SPOT · OR A SPOT BELOW FIRST"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          <CapMeter used={payroll(toLineup(draft), dex)} />
          <span className="text-[22px] text-lime">BUDGET ${budget}M</span>
          <button className="px-btn !py-0 !text-[20px]" onClick={doReroll} disabled={draft.rerolls <= 0 || !!call}>
            RE-SPIN ({draft.rerolls}) <span className="hidden sm:inline">[R]</span>
          </button>
        </div>
      </section>

      {/* the slot machine: a gold cabinet under a JACKPOT sign, three reels, a control deck, a big gold handle */}
      <div className="relative flex">
        <div className="min-w-0 flex-1">
          {/* the sign: a stepped gold arch (outlined in brown), a red panel with chasing bulbs */}
          <div className="mx-auto w-[70%] bg-brown p-[4px]" style={{ clipPath: ARCH }}>
            <div className="px-[6%] pb-[6px] pt-[12px]" style={{ ...GOLD, clipPath: ARCH }}>
              <div className="border-4 border-brown bg-maroon px-2 py-[2px]">
                <Lights n={18} />
                <p className="m-0 text-center font-head text-[20px] leading-[26px] text-gold" style={{ textShadow: `2px 2px 0 ${PALETTE.red}, 4px 4px 0 ${PALETTE.black}` }}>JACKPOT</p>
                <Lights n={18} />
              </div>
            </div>
          </div>
          {/* the body: a brown outline round gold, both with pixel-rounded corners, and a hard drop shadow */}
          <div style={{ filter: `drop-shadow(6px 6px 0 ${PALETTE.black})` }}>
          <div className="bg-brown p-[4px]" style={{ clipPath: corners(4) }}>
          <section className="relative p-[12px]" style={{ ...GOLD, clipPath: corners(3) }}>
            <Shine />
            {/* the reel window, sunk into the gold */}
            <div className="relative bg-brown p-[8px]" style={{ boxShadow: `inset 0 0 0 4px ${PALETTE.amber}`, clipPath: corners(3) }}>
              <Lights />
              <div className="my-[6px] grid grid-cols-1 gap-[6px] sm:grid-cols-3">
                {draft.offers.map((o, i) => {
                  const landed = revealed === draft.deals || (spinning && i < stopped);
                  if (!landed && spinning) return <SpinReel key={`spin${i}`} faces={reelFaces[i] ?? []} />;
                  if (!landed)
                    return (
                      <button key={`idle${i}`} className="flex h-[284px] items-center justify-center border-4 border-amber bg-cream font-head text-[64px] text-red" onClick={pull}>
                        ?
                      </button>
                    );
                  return (
                    <div key={o.id} className={`relative ${o.tier === "STAR" ? "slot-star" : ""}`}>
                      <OfferCard
                        offer={o}
                        p={dex.get(o.id)!}
                        index={i}
                        state={call ? (call.id === o.id ? "picked" : "passed") : selected === o.id ? "selected" : "open"}
                        chem={chemPreview(draft, o.id, dex)}
                        spot={spot ?? undefined}
                        onPick={() => choose(o.id)}
                        onStats={() => setStats(dex.get(o.id)!)}
                      />
                      {o.tier === "STAR" && revealed !== draft.deals && (
                        <span className="pop pointer-events-none absolute left-1/2 top-[90px] -translate-x-1/2 border-4 border-black bg-gold px-3 py-1 font-head text-[24px] text-black">STAR!</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <Lights />
            </div>
            {/* the control deck: the WIN plate, three buttons, the coin tray */}
            <div className="relative mt-[8px] flex items-center justify-center gap-[14px]">
              <span className="border-4 border-brown bg-black px-4 py-[6px] font-head text-[14px] text-gold" style={{ boxShadow: `inset 0 0 0 2px ${PALETTE.maroon}` }}>
                {revealed !== draft.deals ? (spinning ? "GOOD LUCK!" : "PULL!") : draft.offers.some((o) => o.tier === "STAR") ? "STAR!" : "PICK ONE!"}
              </span>
              {[0, 1, 2].map((k) => (
                <span key={k} className="relative h-[20px] w-[28px] border-4 border-brown bg-amber" style={{ boxShadow: `inset 0 -4px 0 ${PALETTE.orange}` }}>
                  <span className="absolute left-[3px] top-[2px] h-[3px] w-[6px] bg-white" />
                </span>
              ))}
              <span className="h-[22px] w-[120px] border-4 border-brown bg-black" style={{ boxShadow: `inset 0 6px 0 ${PALETTE.brown}` }} />
            </div>
          </section>
          </div>
          </div>
        </div>
        {/* the handle: a gold mount on the cabinet's side and a big gold lever with the ball on top. Pull it to spin
            (or, with the reels showing, to spend a re-spin) */}
        <button
          className="relative flex w-[64px] shrink-0 flex-col items-center justify-end pb-[34px] disabled:opacity-60"
          onClick={revealed === draft.deals ? doReroll : pull}
          disabled={spinning || !!call || (revealed === draft.deals && draft.rerolls <= 0)}
          aria-label={revealed === draft.deals ? `Re-spin (${draft.rerolls} left)` : "Pull the handle"}
        >
          {/* in perspective: the arm swings down toward you round its base; the ball keeps facing you, so it grows */}
          <span className="lever">
            <span className={`lever-arm flex flex-col items-center ${lever ? "lever-pull" : ""}`}>
              <img className="lever-ball" src={BALL_URL} width={64} height={64} alt="" style={{ imageRendering: "pixelated" }} />
              <span className="relative h-[230px] w-[18px] border-4 border-brown" style={{ ...GOLD, boxShadow: `inset 4px 0 0 ${PALETTE.cream}, inset -4px 0 0 ${PALETTE.amber}` }}>
                <span className="absolute left-[2px] top-[10px] h-[60%] w-[2px] bg-white" />
              </span>
            </span>
          </span>
          {/* the mount, bolted to the cabinet */}
          <span className="relative -ml-[24px] h-[70px] w-[52px] bg-brown p-[4px]" style={{ clipPath: corners(3) }}>
            <span className="absolute inset-[4px]" style={{ ...GOLD, clipPath: corners(2) }} />
            <span className="absolute left-[4px] top-[4px] h-[4px] w-[4px] bg-white" />
            <span className="absolute bottom-[6px] right-[6px] h-[6px] w-[6px] border-2 border-brown bg-amber" />
          </span>
          <span className="absolute bottom-[8px] text-center font-head text-[10px] text-gold">{revealed === draft.deals ? `RE-SPIN ${draft.rerolls}` : "PULL!"}</span>
        </button>
        {call && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status">
            <span className="pop border-4 border-black bg-black px-5 py-3 font-head text-[24px] text-gold sm:text-[32px]">{call.text}</span>
          </div>
        )}
      </div>

      <h2 className="mb-1 mt-3 font-head text-[12px] text-cloud">YOUR ROSTER</h2>
      <Roster draft={draft} dex={dex} placing={call ? undefined : placing} onPlace={(s) => place(s)} spot={spot} onSpot={call ? undefined : chooseSpot} onStats={setStats} />
      {stats && <PlayerModal p={stats} onClose={() => setStats(null)} />}
      {devMenu}
    </div>
  );
}
