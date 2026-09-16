import { LockIcon } from './icons.jsx'

/**
 * Read-only value carried over from Phase 1. The client cannot edit it —
 * only verify ownership via OTP.
 */
export default function FrozenField({ value, note = 'Locked · added by your RM' }) {
  return (
    <div>
      <div className="flex items-center gap-3 rounded-xl panel px-3.5 py-3">
        <span className="flex-1 truncate font-display text-[0.98rem] font-semibold tracking-wide text-ink">
          {value}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md fill px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-faint">
          <LockIcon className="h-3 w-3" />
          Locked
        </span>
      </div>
      {note && <p className="mt-1.5 text-[0.7rem] text-ink-faint">{note}</p>}
    </div>
  )
}
