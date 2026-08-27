// Mirror of /app/frontend/src/lib/ride.js — infers pace class from free
// text fields on a ride so mobile and web render the same pace chip.
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
