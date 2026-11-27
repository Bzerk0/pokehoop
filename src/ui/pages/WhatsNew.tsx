import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useMusic } from "../bgm.ts";
import { Arrow } from "../components/Arrow.tsx";
import { HomeLogo } from "../components/HomeLogo.tsx";
import { backBlip } from "../sound.ts";
import { markNewsSeen, WHATS_NEW, WHATS_NEW_VERSION } from "../whatsNew.ts";

export function WhatsNew() {
  useMusic("menu");
  const navigate = useNavigate();
  function back() {
    backBlip();
    navigate("/about", { replace: true });
  }

  useEffect(() => {
    markNewsSeen();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mx-auto max-w-[800px] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 font-head text-[20px] text-gold" style={{ textShadow: "2px 2px 0 var(--color-red)" }}>
          <HomeLogo />
          WHAT'S NEW
        </h1>
        <button className="px-btn" onClick={back}><Arrow left /> BACK (ESC)</button>
      </div>

      <p className="mb-4 font-head text-[12px] text-cloud">VERSION {WHATS_NEW_VERSION}</p>
      <div className="flex flex-col gap-4 text-[20px] leading-[22px] text-cloud">
        {WHATS_NEW.map(({ title, bullets }) => (
          <section key={title} className="px-box p-4">
            <h2 className="mb-3 font-head text-[12px] text-gold">{title}</h2>
            <ul className="list-[square] space-y-2 pl-5 marker:text-gold">
              {bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
