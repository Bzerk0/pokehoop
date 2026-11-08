// The menus' background music: one shared player for every page outside a live game (the title, Play, Draft,
// Pokédex, Free Build, a shared team). A page asks for a song with useMusic; a live game asks for none (it plays its
// own). Browsers won't play sound before the first click or key press, so it waits for one. M mutes, as in a game.
import { useEffect } from "react";
import { Music, type SongName } from "../game/music.ts";

const music = new Music("menu");
let want: { song: SongName; muffled: boolean } | null = null;
let unlocked = false;
let pending = 0;

function apply() {
  if (!want) return music.stop();
  music.setSong(want.song);
  music.muffle(want.muffled);
  if (unlocked) music.start();
}

if (typeof window !== "undefined") {
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    apply();
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("keydown", (e) => {
    const el = e.target as HTMLElement | null;
    if (e.code !== "KeyM" || e.repeat || !want || el?.closest("input, textarea, select, [contenteditable]")) return;
    music.toggle();
  });
  // a hidden tab starves the music's timer: stop, and pick up again on return
  document.addEventListener("visibilitychange", () => (document.hidden ? music.stop() : apply()));
}

/** Play `song` while this page is up (null: no menu music here), muffled or clear. */
export function useMusic(song: SongName | null, muffled = false) {
  useEffect(() => {
    clearTimeout(pending);
    want = song ? { song, muffled } : null;
    apply();
    return () => {
      // a moment's grace, so going from one menu page to the next doesn't stop and restart the song
      want = null;
      pending = window.setTimeout(apply, 50);
    };
  }, [song, muffled]);
}
