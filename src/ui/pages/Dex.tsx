import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { RatedPokemon } from "../../core/types.ts";
import { HomeLogo } from "../components/HomeLogo.tsx";
import { PlayerModal } from "../components/Modal.tsx";
import { DexBrowser } from "../components/DexBrowser.tsx";
import { useRated } from "../data.ts";
import { backBlip } from "../sound.ts";
import { Arrow } from "../components/Arrow.tsx";
import { useMusic } from "../bgm.ts";

export function Dex() {
  useMusic("menu");
  const navigate = useNavigate();
  const { data, error } = useRated();
  const [open, setOpen] = useState<RatedPokemon | null>(null);

  // Esc goes back to the title menu (an open card closes first: PlayerModal takes that Esc)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      backBlip();
      navigate("/", { state: { menu: true } });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="mx-auto max-w-[1200px] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="m-0 flex items-center gap-3 font-head text-[20px] text-gold" style={{ textShadow: "2px 2px 0 var(--color-red)" }}>
          <HomeLogo />
          POKéDEX
        </h1>
        <button className="px-btn" onClick={() => navigate("/", { state: { menu: true } })}><Arrow left /> BACK (ESC)</button>
      </div>

      {error && <div className="px-box p-3 text-red">{error}</div>}
      {!data && !error && <div className="font-head text-[10px] text-cloud blink">LOADING…</div>}
      {data && <DexBrowser data={data} onCard={setOpen} autoFocus />}

      {open && <PlayerModal p={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
