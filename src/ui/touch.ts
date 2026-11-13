import { useEffect, useState } from "react";

/** A phone or tablet (a finger, not a mouse): the live game shows its touch controls. `?touch` in the address forces
 *  it on a desktop, for testing. */
export function isTouch() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches || new URLSearchParams(window.location.search).has("touch");
}

// `?iphone` on any page turns the iPhone test on for this tab (the game page's own address has no query)
const IPHONE_TEST = "s5p-iphone-test";
try {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("iphone")) sessionStorage.setItem(IPHONE_TEST, "1");
} catch {
  // storage blocked
}

/** An iPhone in Safari (not a home-screen app): its bars only shrink when the page scrolls. `?iphone` forces it. */
export function isIphoneBrowser() {
  if (typeof window === "undefined") return false;
  let forced = false;
  try {
    forced = sessionStorage.getItem(IPHONE_TEST) === "1";
  } catch {
    // storage blocked: no forcing
  }
  const app = (navigator as { standalone?: boolean }).standalone || window.matchMedia("(display-mode: standalone)").matches;
  return forced || (/iPhone|iPod/.test(navigator.userAgent) && !app);
}

/** TEST, iPhone only: the page gets room to scroll (the game stays pinned in place); the first scroll down tucks
 *  Safari's bars away, then scrolling locks. Returns whether it's still waiting for that scroll, and `again`, which
 *  brings the screen back (scrolled to the top, unlocked) for another go. */
export function useScrollToStart(active = true): [boolean, () => void] {
  const [waiting, setWaiting] = useState(isIphoneBrowser);
  // room to scroll, the game pinned, while it's active (not on the results, which scroll)
  useEffect(() => {
    if (!isIphoneBrowser() || !active) return;
    const root = document.getElementById("root")!;
    const spacer = document.createElement("div");
    spacer.style.height = "200vh"; // something to scroll
    document.body.appendChild(spacer);
    Object.assign(root.style, { position: "fixed", inset: "0", height: "auto" }); // the game stays put as the page scrolls
    return () => {
      spacer.remove();
      Object.assign(root.style, { position: "", inset: "", height: "" });
      window.scrollTo(0, 0);
    };
  }, [active]);
  // waiting: watch for the scroll (sideways only); done: no more scrolling
  useEffect(() => {
    if (!isIphoneBrowser() || !active) return;
    if (!waiting) {
      const lock = (e: TouchEvent) => e.preventDefault();
      document.addEventListener("touchmove", lock, { passive: false });
      return () => document.removeEventListener("touchmove", lock);
    }
    const onScroll = () => {
      if (window.scrollY >= 40 && window.innerWidth > window.innerHeight) setWaiting(false);
    };
    window.addEventListener("scroll", onScroll);
    const poll = window.setInterval(onScroll, 200); // and a check now and then, in case a scroll event is missed
    return () => {
      clearInterval(poll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [waiting, active]);
  const again = () => {
    window.scrollTo(0, 0);
    setWaiting(true);
  };
  return [active && waiting, again];
}

/** A phone or tablet held upright (the title has its own layout for it). */
export function usePortraitTouch() {
  const check = () => isTouch() && window.innerHeight > window.innerWidth;
  const [on, setOn] = useState(check);
  useEffect(() => {
    const update = () => setOn(check());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return on;
}
