export const COFFEES = [
  "Small Flat White",
  "Medium Flat White",
  "Large Flat White",
  "Small Cappuccino",
  "Medium Cappuccino",
  "Large Cappuccino",
  "Oat Flat White",
  "Espresso",
  "Piccolo",
  "Macchiato",
  "Cortado",
  "Long Black",
  "Americano",
  "Mochaccino",
];

export const IMG = {
  espresso:
    "https://customer-assets-lxgj4vgw.emergentagent.net/job_mobile-craft-4628/artifacts/dikgnf47_IMG_5201.webp",
  peloton:
    "https://images.unsplash.com/photo-1758300620054-f42cf6e5458f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTF8MHwxfHNlYXJjaHw0fHxyb2FkJTIwY3ljbGlzdCUyMGdyb3VwJTIwcGVsb3RvbnxlbnwwfHx8fDE3ODcxODA5NzF8MA&ixlib=rb-4.1.0&q=85",
  cyclist:
    "https://images.pexels.com/photos/18513892/pexels-photo-18513892.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  cafeBg:
    "https://images.pexels.com/photos/33833717/pexels-photo-33833717.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  auckland:
    "https://images.pexels.com/photos/2130162/pexels-photo-2130162.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
};

export function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

export function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 30) return "just now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const day = Math.floor(h / 24);
  return `${day}d`;
}
