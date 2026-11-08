/** A pixel arrowhead (the ▶ ◀ font glyphs come out smooth): a 4×7-pixel triangle in the text colour. */
export function Arrow({ left = false }: { left?: boolean }) {
  return (
    <svg
      viewBox="0 0 4 7"
      shapeRendering="crispEdges"
      aria-hidden
      className="inline-block h-[0.6em] w-[0.343em] align-[0.05em]"
      style={left ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M0 0h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1z" fill="currentColor" />
    </svg>
  );
}
