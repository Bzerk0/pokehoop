export const WHATS_NEW_VERSION = "2.0";

export const WHATS_NEW = [
  {
    title: "FRANCHISE MODE",
    bullets: [
      "Run a team in an 8-team league. Finish the season in the top four to make the playoffs.",
      "In the off-season, see which Pokémon evolved and choose who to re-sign.",
      "Pick a prospect in the rookie draft and fill open spots in free agency before the next season tips off.",
    ],
  },
  {
    title: "IN THE DRAFT ROOM",
    bullets: [
      "Swap two Pokémon between positions during a draft.",
      "Stars cost less to sign, so you have more room under the salary cap.",
      "The slot machine reels spin properly again before they reveal your picks.",
      "Roll a new team name and both colours with one button.",
      "Compare your best drafts on a board saved in this browser.",
      "A finished draft now plays an 82-game season. Your record is the score to beat. Can you go 82-0?",
    ],
  },
  {
    title: "ON THE COURT",
    bullets: [
      "The controls card has move icons and tips for dunks, floaters and quick shots. Choose PLAY TUTORIAL on the card to practise.",
      "On defence, press J to take control of the defender nearest the ball every time.",
      "Big blocks are easier to pull off when you jump to contest a shot.",
      "New counters: quick shots and floaters are easier to block, a defender who sticks to a eurostep can strip it, and a defender who jumps can swat an alley-oop. Alley-oops now need a better finisher and passer.",
    ],
  },
  {
    title: "AT THE TITLE SCREEN",
    bullets: [
      "The cabinet zooms in more smoothly while the highlights play.",
      "Open ABOUT for the game credits, including who made the art and sounds.",
      "Open ABOUT, then WHAT'S NEW, to read these notes again.",
    ],
  },
];

const SEEN_VERSION_KEY = "s5p-seen-version-v1";
let seenThisVisit: "saved" | "memory" | undefined;

export function hasUnseenNews(): boolean {
  if (seenThisVisit === "memory") return false;
  try {
    return localStorage.getItem(SEEN_VERSION_KEY) !== WHATS_NEW_VERSION;
  } catch {
    return seenThisVisit === undefined;
  }
}

export function markNewsSeen(): void {
  try {
    localStorage.setItem(SEEN_VERSION_KEY, WHATS_NEW_VERSION);
    seenThisVisit = "saved";
  } catch {
    seenThisVisit = "memory"; // BACK still works when storage is blocked or full.
  }
}
