import Link from "next/link";

type FortuneLogoProps = {
  href?: string;
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
};

export default function FortuneLogo({
  href = "/",
  size = "md",
  showWordmark = true,
  className = "",
}: FortuneLogoProps) {
  const content = (
    <span className={["fortuneBrand", "fortuneBrand-" + size, className].filter(Boolean).join(" ")}>
      <svg
        className="fortuneBrandMark"
        viewBox="0 0 116 122"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="fortuneRibbonTop" x1="18" y1="8" x2="94" y2="51" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff686f" />
            <stop offset="0.34" stopColor="#e51f2a" />
            <stop offset="0.72" stopColor="#b90f18" />
            <stop offset="1" stopColor="#f33b45" />
          </linearGradient>
          <linearGradient id="fortuneRibbonMid" x1="26" y1="42" x2="94" y2="82" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#a50c15" />
            <stop offset="0.46" stopColor="#f6b6b8" />
            <stop offset="0.67" stopColor="#fff4f4" />
            <stop offset="1" stopColor="#d62a33" />
          </linearGradient>
          <linearGradient id="fortuneRibbonBottom" x1="29" y1="76" x2="78" y2="116" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff3f48" />
            <stop offset="0.52" stopColor="#dd1722" />
            <stop offset="1" stopColor="#9d0b13" />
          </linearGradient>
          <filter id="fortuneSoftShadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.2" floodColor="#7a0f15" floodOpacity="0.18" />
          </filter>
          <linearGradient id="fortuneHighlight" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.72" />
            <stop offset="0.42" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g filter="url(#fortuneSoftShadow)">
          <path
            d="M23 27C36 17 66 15 102 6C105 5 107 7 106 11C103 28 94 35 78 38L45 44C35 46 29 51 28 59C21 51 17 43 18 37C19 33 20 30 23 27Z"
            fill="url(#fortuneRibbonTop)"
          />
          <path
            d="M28 58C33 49 40 45 50 44C60 43 74 47 88 52C96 55 100 61 99 68C98 76 92 81 82 83C70 85 58 81 47 75C37 70 30 66 28 58Z"
            fill="url(#fortuneRibbonMid)"
          />
          <path
            d="M28 58C22 69 19 78 20 88C21 98 26 106 34 112C38 115 42 115 47 111L74 88C80 83 86 81 95 82C84 76 72 73 62 75C49 77 38 84 29 94C24 85 24 72 28 58Z"
            fill="url(#fortuneRibbonBottom)"
          />
          <path
            d="M25 28C39 18 67 17 100 9C88 14 65 19 43 24C34 26 28 32 23 39C23 34 23 31 25 28Z"
            fill="url(#fortuneHighlight)"
            opacity="0.75"
          />
        </g>
      </svg>

      {showWordmark ? (
        <span className="fortuneBrandWord">fortune</span>
      ) : null}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="fortuneBrandLink" aria-label="Fortune home">
      {content}
    </Link>
  );
}
