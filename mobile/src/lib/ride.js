// Mirror of /app/frontend/src/lib/ride.js — infers pace class from a
// Strava `event_type` (Race / Workout / GroupRide) when present, otherwise
// regexes over free text. Kept in lockstep so mobile and web render the
// same pace chip for the same ride.
export function inferRidePaceClass(ride) {
  if (!ride) return "social";
  const fmt = String(ride.strava_format || "").toLowerCase().replace(/[\s_-]/g, "");
  if (fmt === "race") return "race";
  if (fmt === "workout" || fmt === "tempo") return "tempo";
  if (fmt === "groupride" || fmt === "social") return "social";
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

export const PACE_STAT_LABEL = {
  social: "Social",
  tempo: "Tempo",
  race: "Race",
};
