import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const STAGE_W = 640;
export const STAGE_H = 360;

/**
 * A pixel stage `width` art-pixels wide, scaled so each art pixel is a whole number of the screen's real pixels
 * (so 2× or 3× on a high-resolution screen, not a blurry 1.5×). Its height is at least `minHeight` and grows to
 * fill the space it's given; pass a function as children to lay out for that height.
 */
export function PixelStage({
  children,
  width = STAGE_W,
  minHeight = STAGE_H,
  exact = false,
}: {
  children: ReactNode | ((height: number) => ReactNode);
  width?: number;
  minHeight?: number;
  /** Scale to fit exactly (not a whole number): the portrait title's 3D cabinet, which perspective scales anyway. */
  exact?: boolean;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ k: 1, dpr: 1, height: minHeight, left: 0, top: 0 });

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const measure = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth * dpr, h = el.clientHeight * dpr; // in real screen pixels
      const fitK = Math.min(w / width, h / minHeight), k = exact ? fitK : Math.max(1, Math.floor(fitK));
      const height = Math.max(minHeight, Math.floor(h / k));
      // whole-pixel offsets keep every art pixel on the screen's pixel grid
      setFit({ k, dpr, height, left: Math.round((w - width * k) / 2) / dpr, top: Math.max(0, Math.round((h - height * k) / 2)) / dpr });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure); // zooming changes the pixel ratio
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [width, minHeight, exact]);

  return (
    <div ref={outer} className="relative h-full w-full overflow-hidden bg-black">
      <div
        className="absolute"
        style={{
          left: fit.left,
          top: fit.top,
          width,
          height: fit.height,
          transform: `scale(${fit.k / fit.dpr})`,
          transformOrigin: "0 0",
        }}
      >
        {typeof children === "function" ? children(fit.height) : children}
      </div>
    </div>
  );
}
