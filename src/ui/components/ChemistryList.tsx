import { chemistry } from "../../core/chemistry.ts";
import type { Lineup } from "../../core/lineup.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { CHEM_MAX } from "../../core/ratingConfig.ts";

/** The team's chemistry links: name, boost, who's in it. */
export function ChemistryList({ lineup, dex }: { lineup: Lineup; dex: Map<number, RatedPokemon> }) {
  const { links } = chemistry(lineup, dex);
  if (!links.length) {
    return (
      <p className="m-0 text-[20px] leading-[20px] text-cloud">
        None yet. Pair evolution lines, rivals, starter trios or three of a type for up to +{CHEM_MAX}.
      </p>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {links.map((k) => (
        <li key={k.name + k.slots.join()} className="text-[20px] leading-[18px]">
          <span className="text-lime">+{k.boost} </span>
          <span className="text-white">{k.name}</span>
          <span className="block text-[18px] text-cloud">
            {k.slots.length === lineup.ids.length ? "WHOLE TEAM" : k.slots.map((s) => dex.get(lineup.ids[s]!)!.name).join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
