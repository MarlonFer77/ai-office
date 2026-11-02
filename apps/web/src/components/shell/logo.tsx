export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative grid size-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-sky-400 shadow-[0_0_24px_-4px_rgba(139,92,246,0.8)]">
        <svg viewBox="0 0 24 24" className="size-5 text-white" aria-hidden>
          <path
            d="M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <rect x="8" y="9" width="8" height="6" rx="2" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight">
          AI{' '}
          <span className="bg-gradient-to-r from-violet-300 to-sky-300 bg-clip-text text-transparent">
            Office
          </span>
        </span>
      )}
    </span>
  );
}
