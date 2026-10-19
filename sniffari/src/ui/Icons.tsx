// Small inline icon set and the Sniffari pup. Stroke icons inherit currentColor.

import type { PlaceKind } from "../domain/types";

type P = { size?: number; title?: string };
const svg = (path: React.ReactNode, { size, title }: P = {}) => (
  <svg className="i" viewBox="0 0 24 24" width={size} height={size} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
    {title ? <title>{title}</title> : null}
    {path}
  </svg>
);

export const Icon = {
  locate: (p?: P) => svg(<><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>, p),
  list: (p?: P) => svg(<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />, p),
  map: (p?: P) => svg(<><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></>, p),
  close: (p?: P) => svg(<path d="M6 6l12 12M18 6L6 18" />, p),
  heart: (p?: P) => svg(<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z" />, p),
  directions: (p?: P) => svg(<><path d="M12 2.5l9.5 9.5-9.5 9.5L2.5 12z" /><path d="M9 14v-2.5a1.5 1.5 0 011.5-1.5H15M13 8l2 2-2 2" /></>, p),
  check: (p?: P) => svg(<path d="M5 12.5l4.5 4.5L19 7" />, p),
  flag: (p?: P) => svg(<path d="M5 21V4h11l-2 4 2 4H5" />, p),
  clock: (p?: P) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, p),
  quiet: (p?: P) => svg(<><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M17 9l5 6M22 9l-5 6" /></>, p),
  busy: (p?: P) => svg(<><circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M3 20a5 5 0 0110 0M11 20a5 5 0 0110 0" /></>, p),
  alert: (p?: P) => svg(<><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17v.5" /></>, p),
  gate: (p?: P) => svg(<path d="M4 20V6M20 20V6M4 9h16M4 15h16M9 6v14M14 6v14" />, p),
  user: (p?: P) => svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>, p),
  paw: (p?: P) => svg(<><circle cx="6.5" cy="10" r="2" /><circle cx="10" cy="5.5" r="2" /><circle cx="14" cy="5.5" r="2" /><circle cx="17.5" cy="10" r="2" /><path d="M8 16.5c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5c0 1.6-1.2 2.5-2.5 2.5-.6 0-1-.3-1.5-.3s-.9.3-1.5.3C9.2 19 8 18.1 8 16.5z" /></>, p),
};

export function KindIcon({ kind }: { kind: PlaceKind }) {
  switch (kind) {
    case "beach": return svg(<><path d="M2 16c2 0 2-1.5 4-1.5S8 16 10 16s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" /><path d="M2 20c2 0 2-1.5 4-1.5S8 20 10 20s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" /><circle cx="17" cy="7" r="3" /></>);
    case "walk": return svg(<><path d="M8 20l2-6 3 2v5M10 14l1-5 3 2 3 1M11 9l-3 2v3" /><circle cx="12" cy="5" r="2" /></>);
    case "state_forest":
    case "regional_park":
    case "national_park": return svg(<><path d="M7 21v-4M17 21v-5" /><path d="M7 17l-4 0 4-7-2.5 0L7 5l2.5 5H7l4 7z" /><path d="M17 16h-4l4-6h-2l2-4 2 4h-2l4 6z" /></>);
    case "garden": return svg(<><circle cx="12" cy="9" r="2.5" /><path d="M12 6.5V4M12 14v7M9.5 9H7M17 9h-2.5M10 7l-1.5-1.5M15.5 5.5L14 7M10 11l-1.5 1.5M14 11l1.5 1.5M12 18c-2 0-4-1-5-3 2 0 4 1 5 3zM12 17c2 0 4-1 5-3-2 0-4 1-5 3" /></>);
    case "pub": return svg(<><path d="M6 7h9v12a2 2 0 01-2 2H8a2 2 0 01-2-2z" /><path d="M15 10h2a2 2 0 012 2v3a2 2 0 01-2 2h-2M6 7a2.5 2.5 0 014.5-1.5A2.5 2.5 0 0115 7M9 11v6M12 11v6" /></>);
    case "restaurant": return svg(<><path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 21V3c-2 1-3 4-3 7h3" /></>);
    case "cafe": return svg(<><path d="M4 9h12v5a5 5 0 01-5 5H9a5 5 0 01-5-5z" /><path d="M16 11h2a2 2 0 010 4h-2M8 3v3M12 3v3" /></>);
    case "lookout": return svg(<><path d="M3 20l6-10 4 6 3-4 5 8z" /><circle cx="17" cy="6" r="2" /></>);
    default: return svg(<><circle cx="12" cy="10" r="5" /><path d="M12 15v6M9 21h6" /></>);
  }
}

/** The Sniffari pup: a friendly floppy-eared head. */
export function Pup({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <ellipse cx="32" cy="36" rx="20" ry="18" fill="#f2a46a" />
      <path d="M14 22c-6 2-8 14-4 20 3 4 8 1 9-4l2-12c1-4-3-6-7-4z" fill="#8a4b25" />
      <path d="M50 22c6 2 8 14 4 20-3 4-8 1-9-4l-2-12c-1-4 3-6 7-4z" fill="#8a4b25" />
      <ellipse cx="32" cy="44" rx="11" ry="8" fill="#fff3e4" />
      <circle cx="25" cy="33" r="3" fill="#2b1d14" />
      <circle cx="39" cy="33" r="3" fill="#2b1d14" />
      <circle cx="26" cy="32" r="1" fill="#fff" />
      <circle cx="40" cy="32" r="1" fill="#fff" />
      <ellipse cx="32" cy="40" rx="4" ry="3" fill="#2b1d14" />
      <path d="M32 43v3M28 47c2 2 6 2 8 0" stroke="#2b1d14" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M33 50c0 4 4 6 6 3" fill="#f26b3a" />
    </svg>
  );
}
