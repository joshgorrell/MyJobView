export interface TechColor {
  bg: string;
  light: string;
  border: string;
  text: string;
  dot: string;
  ring: string;
}

const TECH_COLOR_PALETTE: TechColor[] = [
  { bg: 'bg-sky-500',     light: 'bg-sky-100',     border: 'border-sky-400',     text: 'text-sky-700',     dot: 'bg-sky-500',     ring: 'ring-sky-400' },
  { bg: 'bg-emerald-500', light: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-emerald-400' },
  { bg: 'bg-amber-500',   light: 'bg-amber-100',   border: 'border-amber-400',   text: 'text-amber-700',   dot: 'bg-amber-500',   ring: 'ring-amber-400' },
  { bg: 'bg-rose-500',    light: 'bg-rose-100',    border: 'border-rose-400',    text: 'text-rose-700',    dot: 'bg-rose-500',    ring: 'ring-rose-400' },
  { bg: 'bg-teal-500',    light: 'bg-teal-100',    border: 'border-teal-400',    text: 'text-teal-700',    dot: 'bg-teal-500',    ring: 'ring-teal-400' },
  { bg: 'bg-cyan-500',    light: 'bg-cyan-100',    border: 'border-cyan-400',    text: 'text-cyan-700',    dot: 'bg-cyan-500',    ring: 'ring-cyan-400' },
  { bg: 'bg-orange-500',  light: 'bg-orange-100',  border: 'border-orange-400',  text: 'text-orange-700',  dot: 'bg-orange-500',  ring: 'ring-orange-400' },
  { bg: 'bg-lime-500',    light: 'bg-lime-100',    border: 'border-lime-400',    text: 'text-lime-700',    dot: 'bg-lime-500',    ring: 'ring-lime-400' },
];

const colorCache: Record<string, TechColor> = {};

export function getTechColor(techId: string): TechColor {
  if (colorCache[techId]) return colorCache[techId];
  let hash = 0;
  for (let i = 0; i < techId.length; i++) {
    hash = ((hash << 5) - hash) + techId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % TECH_COLOR_PALETTE.length;
  colorCache[techId] = TECH_COLOR_PALETTE[index];
  return colorCache[techId];
}

export function getTechColorByIndex(index: number): TechColor {
  return TECH_COLOR_PALETTE[index % TECH_COLOR_PALETTE.length];
}

export { TECH_COLOR_PALETTE };
