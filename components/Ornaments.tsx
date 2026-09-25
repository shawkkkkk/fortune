// Decorative Fortune motifs drawn from the lucky-cat artwork: the round
// square-holed fortune coin and the auspicious gold cloud. They carry no
// meaning of their own, so every instance is hidden from assistive tech.

type OrnamentProps = {
  className?: string;
};

export function FortuneCoin({ className = "" }: OrnamentProps) {
  return (
    <svg
      className={["fortuneCoin", className].filter(Boolean).join(" ")}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="24" cy="24" r="23" fill="#e3b25f" />
      <circle cx="24" cy="24" r="22.4" fill="none" stroke="#b98233" strokeWidth="1.2" />
      <circle cx="24" cy="24" r="20" fill="#d8141d" />
      <circle
        cx="24"
        cy="24"
        r="17"
        fill="none"
        stroke="#f2c46d"
        strokeWidth="1"
        strokeDasharray="1.6 2.2"
      />
      <rect x="16.5" y="16.5" width="15" height="15" rx="1.2" fill="#e9bc6a" />
      <rect x="19.5" y="19.5" width="9" height="9" rx="0.6" fill="#fff8ec" />
    </svg>
  );
}

export function AuspiciousCloud({ className = "" }: OrnamentProps) {
  return (
    <svg
      className={["auspiciousCloud", className].filter(Boolean).join(" ")}
      viewBox="0 0 120 60"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 52H104" />
      <path d="M30 52C18 52 12 44 14 36C16 27 26 23 33 27C37 29 38 35 34 37C31 39 28 36 29 34" />
      <path d="M34 27C36 15 50 9 60 14C69 18 71 30 64 35C59 39 52 36 53 31C54 27 59 27 60 30" />
      <path d="M66 22C74 16 88 18 92 28C96 38 88 46 80 44C74 42 74 35 79 34C82 33 84 36 83 38" />
      <path d="M92 30C100 30 106 36 104 44C103 48 100 51 96 52" />
    </svg>
  );
}

// Cloud bank used where cinematic sections hand over to the next one. Two
// layers of overlapping circles; the rim pass leaves a thin gold edge.
const CLOUD_BACK = [
  [-40, 127, 84], [77, 121, 105], [173, 124, 98], [288, 121, 101], [412, 120, 77],
  [509, 144, 91], [605, 123, 79], [732, 121, 91], [876, 125, 100], [982, 121, 104],
  [1110, 143, 101], [1205, 120, 78], [1332, 136, 72], [1450, 125, 73],
] as const;

const CLOUD_FRONT = [
  [-40, 193, 71], [77, 164, 63], [188, 170, 88], [285, 193, 58], [363, 161, 88],
  [476, 189, 65], [593, 185, 86], [687, 195, 81], [790, 177, 75], [879, 173, 63],
  [958, 177, 88], [1065, 179, 83], [1167, 196, 70], [1245, 190, 59], [1345, 179, 62],
  [1428, 184, 83], [1504, 162, 94],
] as const;

export function CloudBand({ className = "" }: OrnamentProps) {
  return (
    <svg
      className={["cloudBand", className].filter(Boolean).join(" ")}
      viewBox="0 0 1440 260"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <g className="cloudBandBack">
        {CLOUD_BACK.map(([x, y, r]) => (
          <circle key={x} cx={x} cy={y} r={r} />
        ))}
        <rect x="-80" y="150" width="1600" height="110" />
      </g>
      <g className="cloudBandRim">
        {CLOUD_FRONT.map(([x, y, r]) => (
          <circle key={x} cx={x} cy={y} r={r + 2.5} />
        ))}
      </g>
      <g className="cloudBandFront">
        {CLOUD_FRONT.map(([x, y, r]) => (
          <circle key={x} cx={x} cy={y} r={r} />
        ))}
        <rect x="-80" y="200" width="1600" height="60" />
      </g>
    </svg>
  );
}
