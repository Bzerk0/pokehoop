import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { decodeLineup, dexOf, problems } from "../../core/lineup.ts";
import { saveDraft } from "../../storage.ts";
import { CARD_H, CARD_W, COLOR_NAMES, LineupCard } from "../components/LineupCard.tsx";
import { PixelStage } from "../components/PixelStage.tsx";
import { useRated } from "../data.ts";
import { selectBlip } from "../sound.ts";

/** /t/<code>: someone's shared team, read-only, with a button to copy it into your own builder. */
export function SharedTeam() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const { data, error } = useRated();
  const dex = useMemo(() => (data ? dexOf(data) : null), [data]);
  const lineup = useMemo(() => decodeLineup(code, COLOR_NAMES.length), [code]);
  const broken = !lineup || (dex && problems(lineup, dex).length > 0);

  const editCopy = () => {
    if (!lineup) return;
    selectBlip();
    saveDraft(lineup);
    navigate("/build");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        {broken ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="px-box max-w-[480px] p-4 text-[22px]">
              <div className="mb-2 font-head text-[12px] text-gold">BROKEN LINK</div>
              This team link is damaged or out of date. Ask for a new one, or build your own team.
            </div>
          </div>
        ) : error ? (
          <div className="p-4 text-red">{error}</div>
        ) : !dex ? (
          <div className="p-4 font-head text-[10px] text-cloud blink">LOADING…</div>
        ) : (
          <PixelStage width={CARD_W} minHeight={CARD_H}>
            {(height) => (
              <div className="absolute left-0" style={{ top: Math.floor((height - CARD_H) / 2) }}>
                <LineupCard lineup={lineup!} dex={dex} />
              </div>
            )}
          </PixelStage>
        )}
      </div>
      <div className="flex shrink-0 justify-center gap-3 bg-black p-3">
        {!broken && <button className="px-btn" onClick={editCopy}>EDIT A COPY</button>}
        <button className="px-btn" onClick={() => navigate("/build")}>BUILD YOUR OWN</button>
        <button className="px-btn" onClick={() => navigate("/")}>TITLE</button>
      </div>
    </div>
  );
}
