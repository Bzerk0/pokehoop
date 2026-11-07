// The box score. The sim fills it now and the live game will fill the same shape (PLAN.md §10), so the Results
// screen shows both the same way.
export type Line = {
  id: number; // dex number
  slot: number; // roster slot (SLOTS order)
  sec: number; // seconds played
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  fgm: number;
  fga: number;
  tpm: number; // threes made
  tpa: number; // threes attempted
};
export type TeamBox = { name: string; lines: Line[]; periods: number[] };

export const newLine = (id: number, slot: number): Line => ({
  id, slot, sec: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0,
});

export const score = (t: TeamBox) => t.periods.reduce((a, b) => a + b, 0);

/** Every counting stat added up over a team's lines. */
export function totals(lines: Line[]): Omit<Line, "id" | "slot"> {
  const sum = newLine(0, 0);
  for (const l of lines) for (const k of Object.keys(sum) as (keyof Line)[]) if (k !== "id" && k !== "slot") sum[k] += l[k];
  const { id: _id, slot: _slot, ...rest } = sum;
  return rest;
}

/** 95 seconds → "1:35" */
export const clock = (sec: number) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
