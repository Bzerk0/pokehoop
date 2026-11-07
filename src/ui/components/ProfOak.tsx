import { useState } from "react";
import { PALETTE } from "../theme/palette.ts";
import { reducedMotion } from "./Cabinet3D.tsx";

// cropped from public/art/oak-sheet.png (the full sheet is kept for later use)
const OAK_URL = "/art/oak.png";
const OAK_W = 55;
const OAK_H = 86;
const SCALE = 2;
// the FireRed text box, cut from "Pokemon Assets/FireRedTextBox.png" at 2×: its 16px edges stretch around any text
const BOX_URL = "/art/textbox.png";
const OUT_MS = 480; // .oak-out in index.css

/** The professor walks in from the left edge and his text box pops up whenever there's advice, so warnings never
 *  push the page around. Clicking the box sends him back off (until the advice changes). */
export function ProfOak({ problems, advice }: { problems: string[]; advice: string[] }) {
  const key = [...problems, ...advice].join("|");
  const [dismissed, setDismissed] = useState("");
  const [leaving, setLeaving] = useState("");
  if (!key || key === dismissed) return null;
  const going = leaving === key;

  // a timer, not animationend: a tab that isn't drawing frames never sends animation events
  const dismiss = () => {
    setLeaving(key);
    setTimeout(() => setDismissed(key), reducedMotion() ? 0 : OUT_MS);
  };

  return (
    <div
      key={key}
      className={`pointer-events-none fixed bottom-[56px] left-0 z-20 flex items-end ${going ? "oak-out" : "oak-in"}`}
      role="status"
      aria-live="polite"
    >
      <img src={OAK_URL} width={OAK_W * SCALE} height={OAK_H * SCALE} alt="Professor Oak" className="shrink-0" />
      <button
        className={`${going ? "pop-out" : "pop-late"} pointer-events-auto relative mb-[120px] -ml-[16px] w-[min(280px,calc(100vw-96px))] cursor-pointer px-[20px] py-[14px] text-left text-[22px] leading-[22px]`}
        style={{
          borderStyle: "solid",
          borderWidth: 16,
          borderImage: `url(${BOX_URL}) 16 fill / 16px stretch`,
          imageRendering: "pixelated",
          color: PALETTE.ocean,
          textShadow: `2px 2px 0 ${PALETTE.cloud}`,
        }}
        onClick={dismiss}
        disabled={going}
        aria-label="Dismiss the professor's advice"
      >
        <span className="-mx-[8px] -my-[6px] block">
          <span className="block">PROF. OAK:</span>
          {problems.map((m) => <span key={m} className="block" style={{ color: PALETTE.red }}>{m}</span>)}
          {advice.map((m) => <span key={m} className="block">{m}</span>)}
          <span className="blink float-right" style={{ color: PALETTE.red, textShadow: "none" }}>▼</span>
        </span>
      </button>
    </div>
  );
}
