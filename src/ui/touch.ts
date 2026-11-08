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
 *  Safari's bars away, then scrolling locks. True while it's still waiting for that scroll. */
export function useScrollToStart() {
  const [waiting, setWaiting] = useState(isIphoneBrowser);
  useEffect(() => {
    if (!isIphoneBrowser()) return;
    const root = document.getElementById("root")!;
    const spacer = document.createElement("div");
    spacer.style.height = "200vh"; // something to scroll
    document.body.appendChild(spacer);
    Object.assign(root.style, { position: "fixed", inset: "0", height: "auto" }); // the game stays put as the page scrolls
    const lock = (e: TouchEvent) => e.preventDefault();
    const onScroll = () => {
      if (window.scrollY < 40 || window.innerHeight > window.innerWidth) return; // (only once it's sideways)
      setWaiting(false);
      clearInterval(poll);
      window.removeEventListener("scroll", onScroll);
      document.addEventListener("touchmove", lock, { passive: false }); // scrolled: no more scrolling
    };
    window.addEventListener("scroll", onScroll);
    const poll = window.setInterval(onScroll, 200); // and a check now and then, in case a scroll event is missed
    return () => {
      clearInterval(poll);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("touchmove", lock);
      spacer.remove();
      Object.assign(root.style, { position: "", inset: "", height: "" });
      window.scrollTo(0, 0);
    };
  }, []);
  return waiting;
}
