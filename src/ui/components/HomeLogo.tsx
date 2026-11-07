import { Link } from "react-router";
import { BALL_SIZE, BALL_URL } from "../art/ballLogo.ts";
import { backBlip } from "../sound.ts";

/** The logo in each page's top-left corner: back to the title menu. */
export function HomeLogo() {
  return (
    <Link to="/" state={{ menu: true }} onClick={() => backBlip()} aria-label="Home" title="Home" className="offer inline-flex">
      <img src={BALL_URL} width={BALL_SIZE} height={BALL_SIZE} alt="" />
    </Link>
  );
}
