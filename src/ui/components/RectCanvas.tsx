import { useEffect, useRef } from "react";

/** A block of pixel art: [x, y, w, h, colour] rectangles. */
export type Rect = [number, number, number, number, string];

/** Paints rectangles into a canvas once, shown `scale`× bigger with hard pixels. Big static pixel art drawn as SVG
 *  rects gets re-rasterised whenever anything near it animates (worst inside the 3D cabinet); a canvas is drawn once. */
export function RectCanvas({ w, h, rects, scale = 1, className = "", style }: {
  w: number; h: number; rects: Rect[]; scale?: number; className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, w, h);
    for (const [x, y, rw, rh, col] of rects) {
      c.fillStyle = col;
      c.fillRect(x, y, rw, rh);
    }
  }, [rects, w, h]);
  return <canvas ref={ref} width={w} height={h} className={className} style={{ width: w * scale, height: h * scale, imageRendering: "pixelated", ...style }} />;
}
