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
