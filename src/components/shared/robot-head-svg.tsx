export function RobotHeadSvg({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      viewBox="0 -12 200 162"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Left arm — segmented tube with claw */}
      <path d="M 50 72 C 28 82 18 102 21 120" stroke="#123138" strokeWidth="15" fill="none" strokeLinecap="round" />
      <path d="M 50 72 C 28 82 18 102 21 120" stroke="#4BBDCA" strokeWidth="10" fill="none" strokeLinecap="round" />
      <line x1="31" y1="85" x2="39" y2="91" stroke="#123138" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="22" y1="101" x2="30" y2="107" stroke="#123138" strokeWidth="2.5" strokeLinecap="round" />

      {/* Right arm — segmented tube with claw */}
      <path d="M 150 72 C 172 82 182 102 179 120" stroke="#123138" strokeWidth="15" fill="none" strokeLinecap="round" />
      <path d="M 150 72 C 172 82 182 102 179 120" stroke="#4BBDCA" strokeWidth="10" fill="none" strokeLinecap="round" />
      <line x1="169" y1="85" x2="161" y2="91" stroke="#123138" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="178" y1="101" x2="170" y2="107" stroke="#123138" strokeWidth="2.5" strokeLinecap="round" />

      {/* Left claw */}
      <path d="M 15 128 C 10 137 9 142 12 147" stroke="#123138" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M 27 128 C 32 137 33 142 30 147" stroke="#123138" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M 15 128 C 10 137 9 142 12 147" stroke="#4BBDCA" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M 27 128 C 32 137 33 142 30 147" stroke="#4BBDCA" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <ellipse cx="21" cy="124" rx="11" ry="9" fill="#2A9EAD" stroke="#123138" strokeWidth="3" />

      {/* Right claw */}
      <path d="M 185 128 C 190 137 191 142 188 147" stroke="#123138" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M 173 128 C 168 137 167 142 170 147" stroke="#123138" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M 185 128 C 190 137 191 142 188 147" stroke="#4BBDCA" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M 173 128 C 168 137 167 142 170 147" stroke="#4BBDCA" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <ellipse cx="179" cy="124" rx="11" ry="9" fill="#2A9EAD" stroke="#123138" strokeWidth="3" />

      {/* Antenna — grey tube with orange ball */}
      <path d="M 100 24 C 94 10 82 2 72 3" stroke="#9ca3af" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="69" cy="3" r="12" fill="#F5A200" stroke="#123138" strokeWidth="2.5" />
      <circle cx="65" cy="-1" r="4" fill="#FFD060" opacity="0.9" />

      {/* Head — cap + pentagon face */}
      <polygon points="88,20 112,20 120,33 80,33" fill="#2A9EAD" stroke="#123138" strokeWidth="3" strokeLinejoin="round" />
      <polygon points="84,31 116,31 152,64 152,104 48,104 48,64" fill="#4BBDCA" stroke="#123138" strokeWidth="3" strokeLinejoin="round" />
      <polygon points="116,31 152,64 152,104 130,104 130,44" fill="#2A9EAD" opacity="0.3" />
      <rect x="137" y="52" width="7" height="44" rx="3.5" fill="white" opacity="0.8" transform="rotate(8 140 74)" />
      <rect x="60" y="52" width="27" height="9" rx="4.5" fill="#e2e8ea" stroke="#123138" strokeWidth="2.5" />
      <rect x="113" y="52" width="27" height="9" rx="4.5" fill="#e2e8ea" stroke="#123138" strokeWidth="2.5" />

      {/* Eyes */}
      <circle cx="80" cy="80" r="17" fill="#F5C018" stroke="#123138" strokeWidth="3" />
      <circle cx="80" cy="80" r="10.5" fill="#E88200" stroke="#123138" strokeWidth="2" />
      <circle cx="75" cy="75" r="3.5" fill="white" opacity="0.85" />
      <circle cx="120" cy="80" r="17" fill="#F5C018" stroke="#123138" strokeWidth="3" />
      <circle cx="120" cy="80" r="10.5" fill="#E88200" stroke="#123138" strokeWidth="2" />
      <circle cx="115" cy="75" r="3.5" fill="white" opacity="0.85" />
    </svg>
  )
}
