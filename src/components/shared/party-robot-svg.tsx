export function PartyRobotSvg({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      viewBox="0 0 200 286"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      overflow="visible"
    >
      <defs>
        <clipPath id="partyHatClip">
          {/* Base aligns with pentagon head flat top: 72,48 to 128,48 */}
          <polygon points="100,2 70,48 130,48" />
        </clipPath>
      </defs>

      {/* Confetti */}
      <circle cx="26" cy="30" r="4" fill="#f87171" />
      <circle cx="174" cy="22" r="3" fill="#4ade80" />
      <circle cx="16" cy="66" r="3" fill="#a78bfa" />
      <circle cx="184" cy="58" r="4" fill="#facc15" />
      <circle cx="36" cy="10" r="3" fill="#4BBDCA" />
      <circle cx="166" cy="36" r="3" fill="#f87171" />
      <rect x="156" y="10" width="6" height="6" rx="1" fill="#4ade80" transform="rotate(20 159 13)" />
      <rect x="32" y="50" width="5" height="5" rx="1" fill="#facc15" transform="rotate(-15 34 52)" />
      <rect x="174" y="74" width="5" height="5" rx="1" fill="#a78bfa" transform="rotate(30 176 76)" />

      {/* Party hat — base exactly on pentagon flat top */}
      <polygon points="100,2 70,48 130,48" fill="#facc15" />
      <rect x="64" y="12" width="72" height="9" fill="#4BBDCA" clipPath="url(#partyHatClip)" />
      <rect x="64" y="25" width="72" height="9" fill="#f87171" clipPath="url(#partyHatClip)" />
      <rect x="64" y="38" width="72" height="8" fill="#4BBDCA" clipPath="url(#partyHatClip)" />
      {/* Hat rim */}
      <ellipse cx="100" cy="48" rx="32" ry="5" fill="#fbbf24" />
      {/* Pom-pom */}
      <circle cx="100" cy="2" r="8" fill="#fde047" />
      <circle cx="100" cy="2" r="4.5" fill="#facc15" />

      {/* Head — pentagon/house shape matching logo */}
      <polygon points="72,48 128,48 154,82 154,128 46,128 46,82" fill="#4BBDCA" />
      {/* Head shine */}
      <polygon points="74,50 126,50 148,78 52,78" fill="#67e8f9" opacity="0.3" />

      {/* Left eyebrow — white pill */}
      <rect x="60" y="68" width="30" height="10" rx="5" fill="white" transform="rotate(-6 75 73)" />
      {/* Right eyebrow */}
      <rect x="110" y="68" width="30" height="10" rx="5" fill="white" transform="rotate(6 125 73)" />

      {/* Left eye — large round, logo style */}
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

      {/* Happy smile */}
      <path d="M 70 114 Q 100 128 130 114" stroke="#0e7490" strokeWidth="5" strokeLinecap="round" fill="none" />

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

      {/* Left arm — raised in celebration */}
      <path d="M 46 158 C 24 146 8 128 4 110" stroke="#4BBDCA" strokeWidth="20" strokeLinecap="round" fill="none" />
      {/* Left claw (raised, prongs pointing up) */}
      <ellipse cx="4" cy="104" rx="11" ry="14" fill="#2A9EAD" />
      <path d="M -1 98 C -3 88 -2 82 0 76" stroke="#4BBDCA" strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M 9 98 C 11 88 12 82 10 76" stroke="#4BBDCA" strokeWidth="9" strokeLinecap="round" fill="none" />

      {/* Right arm — raised in celebration */}
      <path d="M 154 158 C 176 146 192 128 196 110" stroke="#4BBDCA" strokeWidth="20" strokeLinecap="round" fill="none" />
      {/* Right claw (raised, prongs pointing up) */}
      <ellipse cx="196" cy="104" rx="11" ry="14" fill="#2A9EAD" />
      <path d="M 191 98 C 189 88 188 82 190 76" stroke="#4BBDCA" strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M 201 98 C 203 88 204 82 202 76" stroke="#4BBDCA" strokeWidth="9" strokeLinecap="round" fill="none" />

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
