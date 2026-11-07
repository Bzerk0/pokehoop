// Everything kept in this browser (localStorage): the team you're building, and up to MAX_TEAMS saved teams.
// Teams are stored as share codes, so a stored team is checked the same way as a shared link.
import { decodeLineup, encodeLineup, type Lineup } from "./core/lineup.ts";
import { PALETTE } from "./ui/theme/palette.ts";

export const MAX_TEAMS = 20;
const DRAFT_KEY = "s5p-draft-v1";
const TEAMS_KEY = "s5p-teams-v1";
const COLORS = Object.keys(PALETTE).length;

export type SavedTeam = { id: string; code: string; saved: number };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback; // blocked storage or damaged data: start fresh
  }
}
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // private mode or full
  }
}

export const loadDraft = (): Lineup | null => {
  const code = read<string | null>(DRAFT_KEY, null);
  return code ? decodeLineup(code, COLORS) : null;
};
export const saveDraft = (l: Lineup) => write(DRAFT_KEY, encodeLineup(l));

export const listTeams = (): SavedTeam[] => read<SavedTeam[]>(TEAMS_KEY, []).filter((t) => decodeLineup(t.code, COLORS));
export const teamLineup = (t: SavedTeam) => decodeLineup(t.code, COLORS)!;

/** Save a new team, or overwrite `id`. Returns the saved team, or an error message. */
export function saveTeam(l: Lineup, id?: string): SavedTeam | string {
  const teams = listTeams();
  const existing = id ? teams.find((t) => t.id === id) : undefined;
  if (!existing && teams.length >= MAX_TEAMS) return `You can save up to ${MAX_TEAMS} teams. Delete one first.`;
  const team: SavedTeam = { id: existing?.id ?? `${Date.now().toString(36)}${teams.length}`, code: encodeLineup(l), saved: Date.now() };
  const next = existing ? teams.map((t) => (t.id === team.id ? team : t)) : [team, ...teams];
  return write(TEAMS_KEY, next) ? team : "Couldn't save: this browser is blocking storage.";
}

export function renameTeam(id: string, name: string) {
  const teams = listTeams().map((t) => (t.id === id ? { ...t, code: encodeLineup({ ...teamLineup(t), name }) } : t));
  write(TEAMS_KEY, teams);
}

export const deleteTeam = (id: string) => write(TEAMS_KEY, listTeams().filter((t) => t.id !== id));

// The draft in progress (or just finished), as stored. Check it with core/draft.ts checkDraft before using it.
const RUN_KEY = "s5p-draft-run-v1";
export const loadRun = (): unknown => read<unknown>(RUN_KEY, null);
export const saveRun = (run: unknown) => write(RUN_KEY, run);
export const clearRun = () => {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    // storage blocked: nothing to clear
  }
};
