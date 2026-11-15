import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { BALL_URL } from "./ui/art/ballLogo.ts";
import { audio } from "./ui/sound.ts";
import "./index.css";

// the tab icon is the logo, drawn from the same pixel grid
document.querySelector<HTMLLinkElement>("link[rel=icon]")!.href = BALL_URL;

// the sound engine takes up to half a second to make: make it now, while the page loads (see audio() in sound.ts),
// just after the first frame is up (the title's opening zoom has started by then, and it runs on the graphics side)
requestAnimationFrame(() => setTimeout(audio, 50));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
