import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { BALL_URL } from "./ui/art/ballLogo.ts";
import "./index.css";

// the tab icon is the logo, drawn from the same pixel grid
document.querySelector<HTMLLinkElement>("link[rel=icon]")!.href = BALL_URL;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
