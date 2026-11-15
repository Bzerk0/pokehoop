import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Arrow } from "../components/Arrow.tsx";
import { DISCLAIMER } from "../components/Footer.tsx";
import { HomeLogo } from "../components/HomeLogo.tsx";
import { useMusic } from "../bgm.ts";
import { CREDITS } from "../credits.ts";
import { GAME_NAME } from "../name.ts";
import { backBlip } from "../sound.ts";

/** What the game is, who made what in it (credits.ts) and the fan disclaimer. */
export function About() {
  useMusic("menu");
  const navigate = useNavigate();
  const back = () => (backBlip(), navigate("/", { state: { menu: true } }));

  // Esc goes back to the title menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && back();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const heading = "mb-3 font-head text-[12px] text-gold";
  return (
    <div className="mx-auto max-w-[800px] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-3 font-head text-[20px] text-gold" style={{ textShadow: "2px 2px 0 var(--color-red)" }}>
          <HomeLogo />
          ABOUT
        </h1>
        <button className="px-btn" onClick={back}><Arrow left /> BACK (ESC)</button>
      </div>

      <div className="flex flex-col gap-4 text-[20px] leading-[22px] text-cloud">
        <section className="px-box p-4">
          <h2 className={heading}>{GAME_NAME}</h2>
          <p>A free fan-made arcade hoops game where the players are Pokémon. Draft a team, then play it live or sim the game. Made by Hudson Bjerkness.</p>
          <p className="mt-2">No ads, no payments, no accounts. Your teams are saved in this browser only.</p>
        </section>

        <section className="px-box p-4">
          <h2 className={heading}>CREDITS</h2>
          <ul className="flex flex-col gap-2">
            {CREDITS.map((c) => (
              <li key={c.what}>
                <span className="text-white">{c.what}</span>: {c.who} ({c.where})
              </li>
            ))}
          </ul>
          <p className="mt-3">The music and the other sound effects are made in code for this game.</p>
        </section>

        <section className="px-box p-4">
          <h2 className={heading}>FAN PROJECT</h2>
          <p>{DISCLAIMER}</p>
        </section>
      </div>
    </div>
  );
}
