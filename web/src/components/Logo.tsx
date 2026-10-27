export default function Logo({ clair = false, compact = false }: { clair?: boolean; compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      {/* Trois personnes dans une bulle de parole : la voix des habitants que RegenVox fait entendre. */}
      <svg aria-hidden="true" viewBox="0 0 64 64" className="w-9 h-9 shrink-0">
        <path d="M16 4h32a12 12 0 0 1 12 12v24a12 12 0 0 1-12 12H25l-11.5 9.5V51.3A12 12 0 0 1 4 40V16A12 12 0 0 1 16 4z" fill="#2A6D8A" />
        <circle cx="18" cy="23" r="5.5" fill="#E2BAA7" />
        <path d="M8.5 45c0-6.8 4.2-11 9.5-11s9.5 4.2 9.5 11z" fill="#E2BAA7" />
        <circle cx="46" cy="23" r="5.5" fill="#A7CFE2" />
        <path d="M36.5 45c0-6.8 4.2-11 9.5-11s9.5 4.2 9.5 11z" fill="#A7CFE2" />
        <circle cx="32" cy="19.5" r="7" fill="#fff" stroke="#2A6D8A" strokeWidth="2.2" />
        <path d="M19.5 46.5c0-8.6 5.5-13.2 12.5-13.2s12.5 4.6 12.5 13.2z" fill="#fff" stroke="#2A6D8A" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
      <span className={`font-serif text-xl font-bold ${clair ? 'text-white' : 'text-dark'} ${compact ? 'max-[369px]:sr-only' : ''}`}>
        Regen<span className={clair ? 'text-sky' : 'text-ocean-dark'}>Vox</span>
      </span>
    </span>
  )
}
