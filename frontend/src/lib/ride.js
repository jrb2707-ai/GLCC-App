// Infers a pace class (social / tempo / race) from a ride. Strava's own
// `event_type` field ("Race" / "Workout" / "GroupRide") wins when present
// — that's what the club captain literally picks on strava.com. Falls
// back to a regex over the free-text fields, then to "social" as the
// sensible club default. Result maps directly to the pace-chip styles
// shown in the Field Notes № 03 mockup.
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

// Short label for the compact 3-up stat tile in the ride detail sheet.
export const PACE_STAT_LABEL = {
  social: "Social",
  tempo: "Tempo",
  race: "Race",
};

// Tailwind classes mirror the mockup's pace-chip colour tokens.
export const PACE_CHIP_CLS = {
  social: "bg-status-going/15 text-status-going border-status-going/30",
  tempo: "bg-status-maybe/15 text-status-maybe border-status-maybe/30",
  race: "bg-status-cant/15 text-status-cant border-status-cant/30",
};
