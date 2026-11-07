export const DISCLAIMER =
  "Free fan project. Not affiliated with or endorsed by Nintendo, Game Freak, Creatures, or The Pokémon Company. Pokémon names and sprites belong to their respective owners.";

export function Footer() {
  return (
    <footer className="shrink-0 border-t-2 border-slate bg-black px-4 py-2 text-center text-[18px] text-fog">
      {DISCLAIMER}
    </footer>
  );
}
