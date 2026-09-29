// Cosmetic catalogue. Shared by the server (to check that a Pro item is really owned)
// and the client (to render it). Cosmetics never touch game rules.
export const ROPES = {
  classic: { pro: false }, steppe: { pro: false },
  gold: { pro: true }, aurora: { pro: true }, ornament: { pro: true }, campus: { pro: true }
};

// Team outfits (the little people). 'team' = plain side colour, free.
export const OUTFITS = {
  team: { pro: false },
  flag: { pro: true },     // sky-blue shirt with the golden sun
  chapan: { pro: true },   // burgundy chapan with gold trim + kalpak
  sport: { pro: true },    // white kit with stripes + headband
  student: { pro: true }   // navy hoodie with a white collar
};

// Arenas you can buy. Journey city backgrounds are separate and cannot be bought.
export const ARENAS = {
  steppe: { pro: false },
  bayterek: { pro: true },   // Astana: Bayterek tower
  mountains: { pro: true },  // Almaty: Zailiysky Alatau peaks
  night: { pro: true },
  campus: { pro: true }
};

export const allowed = (catalogue, id, isPro) => !!catalogue[id] && (!catalogue[id].pro || !!isPro);
