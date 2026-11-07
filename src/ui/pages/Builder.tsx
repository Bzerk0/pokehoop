import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { chemistry } from "../../core/chemistry.ts";
import {
  autoFill,
  boostedOvr,
  budgetFor,
  payroll,
  salary,
  dexOf,
  emptyLineup,
  isEligible,
  NAME_MAX,
  problems,
  randomTeam,
  SLOTS,
  slotOvr,
  slotPosition,
  STARTERS,
  teamOvr,
  warnings,
  withMode,
  type Lineup,
} from "../../core/lineup.ts";
import { makeRng } from "../../core/rng.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { deleteTeam, listTeams, loadDraft, MAX_TEAMS, renameTeam, saveDraft, saveTeam, teamLineup, type SavedTeam } from "../../storage.ts";
import { BALL_SIZE, BALL_URL } from "../art/ballLogo.ts";
import { HomeLogo } from "../components/HomeLogo.tsx";
import { ChemistryList } from "../components/ChemistryList.tsx";
import { LineupCard, teamColor } from "../components/LineupCard.tsx";
import { Modal, PlayerModal, StatsButton } from "../components/Modal.tsx";
import { ProfOak } from "../components/ProfOak.tsx";
import { Sprite, TypeChip } from "../components/PlayerCard.tsx";
import { CapMeter, ColorPick, downloadCard, shareUrl } from "../components/TeamControls.tsx";
import { useRated } from "../data.ts";
import { backBlip, selectBlip } from "../sound.ts";
import { inkOn, PALETTE } from "../theme/palette.ts";

const PAGE = 50;
type Panel = null | "teams" | "share";

/** One of the 8 slots on the court: position, OVR there (with chemistry), sprite, name. Corner badges remove the
 *  player (top right) and open their stats (bottom right). */
function SlotTile({ slot, p, boost, selected, color, onPick, onClear, onStats }: {
  slot: number; p?: RatedPokemon; boost: number; selected: boolean; color: string; onPick: () => void; onClear: () => void; onStats: () => void;
}) {
  const label = slot < STARTERS ? SLOTS[slot] : `BENCH ${slot - STARTERS + 1}`;
  return (
    <div className="relative border-4 bg-night" style={{ borderColor: selected ? PALETTE.gold : color, boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
      <button
        className={`flex w-full cursor-pointer flex-col px-[6px] pb-[4px] pt-[2px] text-left hover:bg-navy ${selected ? "bg-navy" : ""}`}
        onClick={onPick}
        aria-pressed={selected}
        aria-label={`${label}: ${p ? `${p.name}, ${boostedOvr(slot, p, boost)} OVR${boost ? ` with +${boost} chemistry` : ""}, $${salary(p)}M` : "empty"}`}
      >
        <span className="flex items-center justify-between">
          <span className={`text-[20px] ${selected ? "text-gold" : "text-cloud"}`}>
            {slot < STARTERS ? SLOTS[slot] : p ? slotPosition(slot, p) : "BENCH"}
          </span>
          {p && (
            <span className="flex items-baseline gap-1">
              {boost > 0 && <span className="text-[20px] leading-[16px] text-lime">+{boost}</span>}
              <span className="font-head text-[16px] text-gold">{boostedOvr(slot, p, boost)}</span>
            </span>
          )}
        </span>
        <span className="flex h-[100px] items-end justify-center overflow-hidden">
          {p ? (
            <Sprite key={p.id} p={p} eager className="land max-w-none" />
          ) : (
            <span className="mb-[24px] flex flex-col items-center gap-1">
              <span className="font-head text-[24px] text-slate">+</span>
              {selected && <span className="blink text-[20px] text-gold">PICK ▶</span>}
            </span>
          )}
        </span>
        <span className="line-clamp-2 min-h-[36px] break-words text-center text-[20px] leading-[18px] text-white">{p?.name ?? ""}</span>
        <span className="text-center text-[20px] leading-[20px] text-lime">{p ? `$${salary(p)}M` : " "}</span>
      </button>
      {p && (
        <button
          className="absolute -right-[12px] -top-[12px] flex h-[22px] w-[22px] cursor-pointer items-center justify-center border-2 border-black bg-red hover:bg-maroon"
          onClick={onClear}
          aria-label={`Remove ${p.name}`}
        >
          {/* a pixel X */}
          <svg width="10" height="10" viewBox="0 0 5 5" shapeRendering="crispEdges" aria-hidden="true">
            <path d="M0 0h1v1H0zM4 0h1v1H4zM1 1h1v1H1zM3 1h1v1H3zM2 2h1v1H2zM1 3h1v1H1zM3 3h1v1H3zM0 4h1v1H0zM4 4h1v1H4z" fill={PALETTE.white} />
          </svg>
        </button>
      )}
      {p && <StatsButton p={p} onOpen={onStats} className="absolute -bottom-[12px] -right-[12px]" />}
    </div>
  );
}

export function Builder() {
  const navigate = useNavigate();
  const { data, error } = useRated();
  const dex = useMemo(() => (data ? dexOf(data) : new Map<number, RatedPokemon>()), [data]);
  const [lineup, setLineup] = useState<Lineup>(() => loadDraft() ?? emptyLineup());
  const [slot, setSlot] = useState(0);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [panel, setPanel] = useState<Panel>(null);
  const [teams, setTeams] = useState<SavedTeam[]>(() => listTeams());
  const [savedId, setSavedId] = useState<string | undefined>();
  const [toast, setToast] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false); // also list players over the budget
  const [stats, setStats] = useState<RatedPokemon | null>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => void saveDraft(lineup), [lineup]);
  useEffect(() => setLimit(PAGE), [slot, query, lineup.mode]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Esc leaves for the title menu (an open window or colour palette takes the Esc first)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      backBlip();
      navigate("/", { state: { menu: true } });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const budget = budgetFor(lineup, slot, dex);
  const candidates = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase().replace(/^#/, "");
    return data
      .filter((p) => isEligible(p, lineup.mode) && !lineup.ids.includes(p.id) && (!q || p.name.toLowerCase().includes(q) || String(p.id) === q))
      .filter((p) => showAll || salary(p) <= budget)
      .sort((a, b) => slotOvr(slot, b) - slotOvr(slot, a) || salary(a) - salary(b) || a.id - b.id);
  }, [data, query, slot, lineup.mode, lineup.ids, showAll, budget]);

  const update = setLineup; // edits stay linked to the loaded/saved team: SAVE CHANGES overwrites it
  const pick = (p: RatedPokemon) => {
    if (salary(p) > budget) return;
    selectBlip();
    const ids = [...lineup.ids];
    ids[slot] = p.id;
    update({ ...lineup, ids });
    const nextEmpty = ids.findIndex((id, i) => id == null && i > slot);
    const anyEmpty = ids.findIndex((id) => id == null);
    setSlot(nextEmpty >= 0 ? nextEmpty : anyEmpty >= 0 ? anyEmpty : slot);
    setQuery("");
  };
  const clearSlot = (i: number) => {
    const ids = [...lineup.ids];
    ids[i] = null;
    update({ ...lineup, ids });
    setSlot(i);
  };

  const onSave = () => {
    const out = saveTeam(lineup, savedId);
    if (typeof out === "string") return setToast(out);
    setSavedId(out.id);
    setTeams(listTeams());
    setToast(savedId ? "Team updated" : "Team saved");
  };

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(lineup));
      setToast("Link copied");
    } catch {
      setToast("Copy blocked: select the link and copy it");
    }
  };

  const onDownload = async () => {
    if (!card.current) return;
    try {
      await downloadCard(card.current, lineup.name);
    } catch {
      setToast("Couldn't make the picture");
    }
  };

  const ovr = teamOvr(lineup, dex);
  const issues = problems(lineup, dex);
  const advice = warnings(lineup, dex);
  const [home, accent] = lineup.colors.map(teamColor);
  const ink = inkOn(home);
  const filledCount = lineup.ids.filter((id) => id != null).length;
  const { boosts } = chemistry(lineup, dex);
  const tile = (i: number, color: string) => (
    <SlotTile
      slot={i}
      p={dex.get(lineup.ids[i] ?? -1)}
      boost={boosts[i]}
      selected={slot === i}
      color={color}
      onPick={() => setSlot(i)}
      onClear={() => clearSlot(i)}
      onStats={() => setStats(dex.get(lineup.ids[i]!)!)}
    />
  );

  // On a desktop the page itself never scrolls: only the picker's list does
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col p-4 lg:h-full">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h1 className="m-0 flex items-center gap-2 font-head text-[16px] text-gold">
          <HomeLogo />
          FREE BUILD
        </h1>
        <button className="px-btn" onClick={() => navigate("/", { state: { menu: true } })}>
          ◀ BACK<span className="hidden sm:inline"> (ESC)</span>
        </button>
      </div>

      {error && <div className="px-box mb-4 p-3 text-red">{error}</div>}

      {/* the team banner: your team in its own colours, name and rating large */}
      <section className="mb-4 shrink-0 border-4 border-black" style={{ background: PALETTE[home], boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
        <div className="flex flex-wrap items-center gap-4 px-4 pb-4 pt-4">
          <img src={BALL_URL} width={BALL_SIZE * 2} height={BALL_SIZE * 2} alt="" className="hidden sm:block" />
          <label className="min-w-[200px] flex-1">
            <span className="sr-only">Team name</span>
            <input
              className="team-name w-full border-0 border-b-4 bg-transparent px-0 pb-1 font-head text-[16px] uppercase leading-[1.2] sm:text-[24px] lg:text-[32px]"
              style={{ color: PALETTE[ink], borderColor: PALETTE[ink] }}
              value={lineup.name}
              maxLength={NAME_MAX}
              placeholder="NAME YOUR TEAM"
              onChange={(e) => update({ ...lineup, name: e.target.value })}
            />
          </label>
          <div className="flex flex-1 items-baseline justify-between gap-2 border-4 border-black bg-black px-3 pb-2 pt-3 sm:flex-none" aria-label={`Team OVR ${ovr ?? "none yet"}`}>
            <span className="font-head text-[48px] leading-[48px] text-gold">{ovr ?? "--"}</span>
            <span className="text-[24px] text-cloud">OVR</span>
          </div>
        </div>
        <div className="h-[8px]" style={{ background: PALETTE[accent] }} />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 bg-night px-4 py-3">
          <CapMeter used={payroll(lineup, dex)} />
          <div className="flex gap-4">
            <ColorPick label="HOME" value={lineup.colors[0]} onChange={(i) => update({ ...lineup, colors: [i, lineup.colors[1]] })} />
            <ColorPick label="ACCENT" value={lineup.colors[1]} onChange={(i) => update({ ...lineup, colors: [lineup.colors[0], i] })} />
          </div>
          <div className="flex gap-1" role="group" aria-label="Pool">
            {(["classic", "unlimited"] as const).map((m) => (
              <button key={m} className="px-btn" aria-pressed={lineup.mode === m} onClick={() => update(withMode(lineup, m, dex))}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_380px] lg:grid-rows-[minmax(0,1fr)]">
        {/* shortcut: a window too short for the court scrolls this column, not the page */}
        <div className="lg:min-h-0 lg:overflow-y-auto">
          {/* the court: wood floor, white boundary line, starters up top, the bench below the sideline */}
          <div className="relative border-4 border-black bg-wood px-4 pb-4 pt-5">
            <div className="pointer-events-none absolute inset-[6px] border-2 border-white" />
            <div className="relative grid grid-cols-3 gap-3 sm:grid-cols-5">
              {SLOTS.slice(0, STARTERS).map((_, i) => <div key={i}>{tile(i, PALETTE[home])}</div>)}
            </div>
            <div className="relative mb-2 mt-4 flex items-center gap-2">
              <span className="h-[4px] flex-1" style={{ background: PALETTE[accent] }} />
              <span className="text-[24px] leading-[20px] text-black">BENCH</span>
              <span className="h-[4px] flex-1" style={{ background: PALETTE[accent] }} />
            </div>
            <div className="relative grid grid-cols-3 gap-3 sm:grid-cols-5">
              {SLOTS.slice(STARTERS).map((_, j) => (
                <div key={j} className={j === 0 ? "sm:col-start-2" : ""}>
                  {tile(STARTERS + j, PALETTE[accent])}
                </div>
              ))}
              {/* chemistry fills the empty corner beside the bench; it scrolls inside so it never grows the court */}
              <div className="relative col-span-3 border-4 border-black bg-night sm:col-span-1">
                <div className="flex flex-col gap-1 overflow-y-auto p-2 sm:absolute sm:inset-0">
                  <span className="text-[24px] leading-[24px] text-gold">CHEMISTRY</span>
                  <ChemistryList lineup={lineup} dex={dex} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <button className="px-btn" onClick={() => data && update(autoFill(lineup, data))} disabled={!data || filledCount === SLOTS.length}>AUTO-FILL</button>
              <button className="px-btn" onClick={() => data && update(randomTeam(lineup, data, makeRng(Date.now())))} disabled={!data}>RANDOM</button>
              <button className="px-btn" onClick={() => (update({ ...lineup, ids: SLOTS.map(() => null) }), setSlot(0))} disabled={!filledCount}>CLEAR</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="px-btn" onClick={onSave} disabled={!filledCount}>{savedId ? "SAVE CHANGES" : "SAVE TEAM"}</button>
              <button className="px-btn" aria-pressed={panel === "teams"} onClick={() => (setTeams(listTeams()), setPanel(panel === "teams" ? null : "teams"))}>
                MY TEAMS {teams.length}/{MAX_TEAMS}
              </button>
              <button className="px-btn" aria-pressed={panel === "share"} onClick={() => setPanel(panel === "share" ? null : "share")} disabled={!filledCount || issues.length > 0}>
                SHARE
              </button>
            </div>
          </div>

          {panel === "teams" && (
            <Modal title={`MY TEAMS ${teams.length}/${MAX_TEAMS}`} onClose={() => (setPanel(null), setRenaming(null))}>
            <div className="px-box w-[min(760px,90vw)] p-3">
              {teams.length === 0 && <div className="text-cloud">No saved teams yet. Build one and press SAVE TEAM.</div>}
              {teams.map((t) => {
                const l = teamLineup(t);
                const doRename = () => {
                  if (!renaming) return;
                  const name = renaming.name.trim().slice(0, NAME_MAX) || l.name;
                  renameTeam(t.id, name);
                  setTeams(listTeams());
                  if (savedId === t.id) update({ ...lineup, name });
                  setRenaming(null);
                };
                return (
                  <div key={t.id} className={`flex flex-wrap items-center gap-2 border-b-2 border-slate py-2 last:border-b-0 ${savedId === t.id ? "bg-navy" : ""}`}>
                    <span className="h-[16px] w-[16px] border-2 border-black" style={{ background: PALETTE[teamColor(l.colors[0])] }} />
                    <span className="h-[16px] w-[16px] border-2 border-black" style={{ background: PALETTE[teamColor(l.colors[1])] }} />
                    {renaming?.id === t.id ? (
                      <input
                        className="px-input min-w-[160px] flex-1"
                        value={renaming.name}
                        maxLength={NAME_MAX}
                        autoFocus
                        onChange={(e) => setRenaming({ id: t.id, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") doRename();
                          if (e.key === "Escape") (e.stopPropagation(), e.nativeEvent.stopImmediatePropagation(), setRenaming(null));
                        }}
                      />
                    ) : (
                      <span className="min-w-[160px] flex-1 truncate text-[22px]">{l.name || "UNNAMED TEAM"}</span>
                    )}
                    <span className="font-head text-[16px] text-gold">{teamOvr(l, dex) ?? "--"}</span>
                    <span className="w-[96px] text-[20px] text-cloud">{l.mode.toUpperCase()}</span>
                    {renaming?.id === t.id ? (
                      <>
                        <button className="px-btn" onClick={doRename}>OK</button>
                        <button className="px-btn" onClick={() => setRenaming(null)}>CANCEL</button>
                      </>
                    ) : (
                      <>
                        <button className="px-btn" onClick={() => (setLineup(l), setSavedId(t.id), setPanel(null), setToast(`Loaded ${l.name}`))}>LOAD</button>
                        <button className="px-btn" onClick={() => (setRenaming({ id: t.id, name: l.name }), setDeleting(null))}>RENAME</button>
                        <button
                          className={`px-btn ${deleting === t.id ? "!bg-red" : ""}`}
                          onClick={() => {
                            if (deleting !== t.id) return setDeleting(t.id); // first click asks, second deletes
                            deleteTeam(t.id);
                            setTeams(listTeams());
                            setDeleting(null);
                            if (savedId === t.id) setSavedId(undefined);
                          }}
                          onBlur={() => deleting === t.id && setDeleting(null)}
                        >
                          {deleting === t.id ? "SURE?" : "DELETE"}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            </Modal>
          )}

          {panel === "share" && (
            <Modal title="SHARE" onClose={() => setPanel(null)}>
            <div className="px-box flex flex-col gap-3 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input className="px-input min-w-0 flex-1" readOnly value={shareUrl(lineup)} onFocus={(e) => e.target.select()} />
                <button className="px-btn" onClick={onCopyLink}>COPY LINK</button>
                <button className="px-btn" onClick={onDownload}>DOWNLOAD PNG</button>
              </div>
              <div className="overflow-x-auto">
                <LineupCard ref={card} lineup={lineup} dex={dex} />
              </div>
            </div>
            </Modal>
          )}
        </div>

        {/* the picker: on a desktop it fills the column's height and only its list scrolls */}
        <div className="px-box flex max-h-[75vh] flex-col p-3 lg:max-h-none lg:min-h-0">
          <div className="mb-2 flex items-baseline justify-between font-head text-[16px] text-gold">
            <span>PICK {slot < STARTERS ? `A ${SLOTS[slot]}` : `BENCH ${slot - STARTERS + 1}`}</span>
            <span className="font-body text-[24px] leading-[16px] text-lime">BUDGET ${budget}M</span>
          </div>
          <input className="px-input mb-2" placeholder="search name or #" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-[20px] text-cloud">
            <input type="checkbox" className="accent-gold" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            SHOW PLAYERS YOU CAN'T AFFORD
          </label>
          {!data && !error && <div className="font-head text-[16px] text-cloud blink">LOADING…</div>}
          <div className="flex-1 overflow-y-auto">
            {candidates.slice(0, limit).map((p) => {
              const cost = salary(p);
              const tooMuch = cost > budget;
              return (
                <div key={p.id} className="flex items-center gap-1 border-b-2 border-slate pr-1">
                <button
                  className={`flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left ${tooMuch ? "cursor-not-allowed" : "cursor-pointer hover:bg-navy focus:bg-navy"}`}
                  onClick={() => pick(p)}
                  disabled={tooMuch}
                  aria-label={`${p.name}, ${slotOvr(slot, p)} OVR here, best at ${p.best}, $${cost}M${tooMuch ? ", over your budget" : ""}`}
                >
                  <span className={`flex h-[64px] w-[84px] shrink-0 items-center justify-center overflow-hidden ${tooMuch ? "grayscale" : ""}`}>
                    <Sprite p={p} className="max-w-none" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[20px] leading-[20px] ${tooMuch ? "text-steel" : ""}`}>{p.name}</span>
                    <span className="flex gap-1">{p.types.map((t) => <TypeChip key={t} type={t} />)}</span>
                  </span>
                  <span className="text-right">
                    <span className={`block font-head text-[16px] ${tooMuch ? "text-steel" : "text-gold"}`}>{slotOvr(slot, p)}</span>
                    <span className={`block text-[20px] leading-[20px] ${tooMuch ? "text-red" : "text-lime"}`}>${cost}M</span>
                    <span className="block text-[20px] leading-[20px] text-cloud">BEST {p.best}</span>
                  </span>
                </button>
                <StatsButton p={p} onOpen={() => setStats(p)} />
                </div>
              );
            })}
            {candidates.length > limit && (
              <button className="px-btn mt-2 w-full" onClick={() => setLimit((l) => l + PAGE)}>SHOW MORE ▼</button>
            )}
            {data && candidates.length === 0 && <div className="text-cloud">No Pokémon match.</div>}
          </div>
        </div>
      </div>

      {toast && (
        <div className="px-box fixed bottom-16 left-1/2 z-20 -translate-x-1/2 px-4 py-2 text-[24px] text-gold" role="status">
          {toast}
        </div>
      )}
      <ProfOak problems={issues} advice={advice} />
      {stats && <PlayerModal p={stats} onClose={() => setStats(null)} />}
    </div>
  );
}
