import { useEffect, useState, type ReactNode } from "react";
import { Cabinet3D, reducedMotion, SETTLE_MS } from "./Cabinet3D.tsx";
import { Band, Bezel, CAB_W, Stripes } from "./cabinetParts.tsx";
import { PixelStage, STAGE_H } from "./PixelStage.tsx";

const PAD = 8; // bezel above and below the screen
const LIP = 8; // thin navy strip under the bezel
const PANEL_H = STAGE_H + 2 * PAD + LIP;

/** The 640×360 screen in its bezel, as big as whole-number scaling allows. view "3d" shows it inside a swaying
 *  3D arcade cabinet you can spin; switching to "flat" turns the cabinet to face you and zooms in until just the
 *  screen panel (bezel and side trim) fills the window, then drops the rest of the cabinet. */
export function ArcadeCabinet({ children, view = "flat", portrait = false }: { children: ReactNode; view?: "3d" | "flat"; portrait?: boolean }) {
  const [shown, setShown] = useState(view);
  useEffect(() => {
    if (view === "3d") return setShown("3d");
    const t = setTimeout(() => setShown("flat"), reducedMotion() ? 0 : SETTLE_MS);
    return () => clearTimeout(t);
  }, [view]);

  // portrait (a phone held upright): the whole cabinet filling the screen; zoomed in, it stays 3D with the screen
  // across the width and the marquee and control panel above and below it
  if (portrait) {
    return (
      <PixelStage width={CAB_W} minHeight={PANEL_H} exact>
        {(height) => (
          <Cabinet3D front={view === "flat"} whole screenTop={Math.max(PAD + 220, Math.floor(height / 2 - 455 + 72))} stageH={height}>
            {children}
          </Cabinet3D>
        )}
      </PixelStage>
    );
  }

  return (
    <PixelStage width={CAB_W} minHeight={PANEL_H}>
      {(height) => {
        const panelTop = Math.floor((height - PANEL_H) / 2);
        return shown === "3d" ? (
          <Cabinet3D front={view === "flat"} screenTop={panelTop + PAD} stageH={height}>
            {children}
          </Cabinet3D>
        ) : (
          <Band y={panelTop} h={PANEL_H} className="bg-navy">
            <Stripes height={PANEL_H} />
            <Bezel pad={PAD}>{children}</Bezel>
          </Band>
        );
      }}
    </PixelStage>
  );
}
