// Infers a pace class (social / tempo / race) from a ride's free-text
// fields. Falls back to "social" — the sensible default for a club that
// mostly rolls easy. Result maps directly to the pace-chip styles shown
// in the Field Notes № 03 mockup.
export function inferRidePaceClass(ride) {
  if (!ride) return "social";
  const haystack = [
    ride.name,
    ride.route,
    ride.route_description,
    ride.pace,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\brace\b|racing|threshold|hammer|jail\s*break/.test(haystack)) return "race";
  if (/\btempo\b|zone\s*3|z3|sweet\s*spot|brisk/.test(haystack)) return "tempo";
  return "social";
}

export const PACE_CHIP_LABEL = {
  social: "Social pace",
  tempo: "Tempo pace",
  race: "Race pace",
};

// Tailwind classes mirror the mockup's pace-chip colour tokens.
export const PACE_CHIP_CLS = {
  social: "bg-status-going/15 text-status-going border-status-going/30",
  tempo: "bg-status-maybe/15 text-status-maybe border-status-maybe/30",
  race: "bg-status-cant/15 text-status-cant border-status-cant/30",
};
