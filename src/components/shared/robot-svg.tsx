export function RobotSvg({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 286"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      overflow="visible"
    >
      {/* Antenna — curved grey tube with orange ball, leaning left like logo */}
      <path d="M 100 48 C 94 34 82 18 80 4" stroke="#9ca3af" strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="80" cy="3" r="11" fill="#fb923c" />
      <circle cx="80" cy="3" r="6" fill="#fde047" />
      <circle cx="76" cy="0" r="2.5" fill="white" opacity="0.7" />

      {/* Head — pentagon/house shape matching logo */}
      <polygon points="72,48 128,48 154,82 154,128 46,128 46,82" fill="#4BBDCA" />
      {/* Head shine */}
      <polygon points="74,50 126,50 148,78 52,78" fill="#67e8f9" opacity="0.3" />

      {/* Left eyebrow — flat, friendly */}
      <rect x="62" y="70" width="28" height="9" rx="4.5" fill="white" />
      {/* Right eyebrow */}
      <rect x="110" y="70" width="28" height="9" rx="4.5" fill="white" />

      {/* Left eye — large round, logo style: yellow ring → orange → dark pupil */}
      <circle cx="82" cy="95" r="21" fill="#fbbf24" />
      <circle cx="82" cy="95" r="15" fill="#f97316" />
      <circle cx="82" cy="95" r="9" fill="#1c0a00" />
      <circle cx="75" cy="88" r="4.5" fill="white" opacity="0.85" />
      <circle cx="87" cy="88" r="2" fill="white" opacity="0.45" />

      {/* Right eye */}
      <circle cx="118" cy="95" r="21" fill="#fbbf24" />
      <circle cx="118" cy="95" r="15" fill="#f97316" />
      <circle cx="118" cy="95" r="9" fill="#1c0a00" />
      <circle cx="111" cy="88" r="4.5" fill="white" opacity="0.85" />
      <circle cx="123" cy="88" r="2" fill="white" opacity="0.45" />

      {/* Mouth — friendly smile */}
      <path d="M 72 112 Q 100 126 128 112" stroke="#0e7490" strokeWidth="5" strokeLinecap="round" fill="none" />

      {/* Neck */}
      <rect x="86" y="128" width="28" height="14" rx="6" fill="#2A9EAD" />

      {/* Body — compact, rounded */}
      <rect x="36" y="142" width="128" height="80" rx="22" fill="#2A9EAD" />
      <rect x="44" y="148" width="112" height="20" rx="10" fill="#7BCFD8" opacity="0.14" />

      {/* Chest panel */}
      <rect x="50" y="158" width="64" height="46" rx="9" fill="#4BBDCA" />
      <circle cx="64" cy="172" r="6" fill="#f87171" />
      <circle cx="82" cy="172" r="6" fill="#4ade80" />
      <circle cx="100" cy="172" r="6" fill="#facc15" />
      <rect x="56" y="186" width="52" height="7" rx="3.5" fill="#0e7490" />
      <rect x="56" y="197" width="36" height="7" rx="3.5" fill="#0e7490" />

      {/* Gear badge */}
      <circle cx="146" cy="178" r="20" fill="#facc15" />
      <circle cx="146" cy="178" r="13" fill="#2A9EAD" />
      <circle cx="146" cy="178" r="6.5" fill="#facc15" />
      <rect x="142" y="157" width="8" height="8" rx="2" fill="#facc15" />
      <rect x="142" y="192" width="8" height="8" rx="2" fill="#facc15" />
      <rect x="125" y="174" width="8" height="8" rx="2" fill="#facc15" />
      <rect x="159" y="174" width="8" height="8" rx="2" fill="#facc15" />

      {/* Left arm — curved tube like logo */}
      <path d="M 46 162 C 28 166 14 180 10 196" stroke="#4BBDCA" strokeWidth="20" strokeLinecap="round" fill="none" />
      {/* Left claw */}
      <ellipse cx="10" cy="202" rx="14" ry="11" fill="#2A9EAD" />
      <path d="M 4 206 C 2 216 0 224 2 230" stroke="#4BBDCA" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M 16 206 C 18 216 20 224 18 230" stroke="#4BBDCA" strokeWidth="10" strokeLinecap="round" fill="none" />

      {/* Right arm — curved tube */}
      <path d="M 154 162 C 172 166 186 180 190 196" stroke="#4BBDCA" strokeWidth="20" strokeLinecap="round" fill="none" />
      {/* Right claw */}
      <ellipse cx="190" cy="202" rx="14" ry="11" fill="#2A9EAD" />
      <path d="M 184 206 C 182 216 180 224 182 230" stroke="#4BBDCA" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M 196 206 C 198 216 200 224 198 230" stroke="#4BBDCA" strokeWidth="10" strokeLinecap="round" fill="none" />

      {/* Left leg */}
      <rect x="58" y="220" width="36" height="50" rx="12" fill="#0e7490" />
      {/* Right leg */}
      <rect x="106" y="220" width="36" height="50" rx="12" fill="#0e7490" />

      {/* Left foot */}
      <rect x="46" y="256" width="52" height="16" rx="8" fill="#4BBDCA" />
      {/* Right foot */}
      <rect x="102" y="256" width="52" height="16" rx="8" fill="#4BBDCA" />
    </svg>
  )
}
