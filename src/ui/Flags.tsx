/** Small inline flags for the language switch (emoji flags do not render on Windows). */

/** Union Jack, 2:1. */
export function FlagUK() {
  return (
    <svg className="flag" viewBox="0 0 60 30" aria-hidden="true">
      <clipPath id="flag-uk-all">
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <clipPath id="flag-uk-diag">
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath="url(#flag-uk-all)">
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#flag-uk-diag)" stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

/** Argentina: light blue, white, light blue, with the Sun of May. */
export function FlagAR() {
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8;
    const r1 = 2.1;
    const r2 = i % 2 ? 3.4 : 3.9;
    return `M${(30 + r1 * Math.cos(a)).toFixed(2)},${(15 + r1 * Math.sin(a)).toFixed(2)} L${(30 + r2 * Math.cos(a)).toFixed(2)},${(15 + r2 * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  return (
    <svg className="flag" viewBox="0 0 60 30" preserveAspectRatio="none" aria-hidden="true">
      <rect width="60" height="30" fill="#74ACDF" />
      <rect y="10" width="60" height="10" fill="#fff" />
      <path d={rays} stroke="#F6B40E" strokeWidth="0.9" />
      <circle cx="30" cy="15" r="2.2" fill="#F6B40E" stroke="#85340A" strokeWidth="0.3" />
    </svg>
  );
}
