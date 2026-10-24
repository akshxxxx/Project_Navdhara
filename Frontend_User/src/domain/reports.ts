import { Construction, Droplet, Ellipsis, Mountain, Shapes, TrafficCone, type LucideIcon } from 'lucide-react';

// Same as App/src/domain/reports.ts. The backend stores free text only, so the type and km travel inside
// the description in the form the web dashboard and the app use: "[Falling stones] km 114: Small stones…".

export interface ReportType {
  id: string;
  label: string;
  icon: LucideIcon;
  keywords: string[];
}

export const REPORT_TYPES: ReportType[] = [
  { id: 'landslide', label: 'Landslide', icon: Mountain, keywords: ['landslide', 'slide', 'debris'] },
  { id: 'blocked', label: 'Road blocked', icon: TrafficCone, keywords: ['block', 'tree', 'jam'] },
  { id: 'stones', label: 'Falling stones', icon: Shapes, keywords: ['stone', 'rock', 'boulder'] },
  { id: 'damaged', label: 'Damaged road', icon: Construction, keywords: ['crack', 'damage', 'pothole', 'sink'] },
  { id: 'water', label: 'Water on road', icon: Droplet, keywords: ['water', 'flood', 'stream'] },
  { id: 'other', label: 'Something else', icon: Ellipsis, keywords: [] },
];

export const MAX_DESCRIPTION = 300;

export function encodeDescription(type: ReportType, km: number | null, text: string): string {
  // "Other" is the label the app and dashboard store for this type
  const label = type.id === 'other' ? 'Other' : type.label;
  return `[${label}]${km != null ? ` km ${Math.round(km)}` : ''}: ${text.trim()}`;
}

export interface ParsedReport {
  type: ReportType;
  km: number | null;
  text: string;
}

const OTHER = REPORT_TYPES[REPORT_TYPES.length - 1];

export function parseDescription(desc: string): ParsedReport {
  const m = /^\[([^\]]+)\]\s*(?:km\s*([\d.]+))?\s*:?\s*([\s\S]*)$/i.exec(desc.trim());
  if (m) {
    const label = m[1].toLowerCase();
    const type =
      REPORT_TYPES.find((t) => t.label.toLowerCase() === label) ??
      REPORT_TYPES.find((t) => t.keywords.some((k) => label.includes(k))) ??
      OTHER;
    return { type, km: m[2] ? Number(m[2]) : null, text: m[3] || desc };
  }
  const lower = desc.toLowerCase();
  const type = REPORT_TYPES.find((t) => t.keywords.some((k) => lower.includes(k))) ?? OTHER;
  return { type, km: null, text: desc };
}
