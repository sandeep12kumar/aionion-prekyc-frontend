import { CheckIcon } from './icons.jsx'

const STEPS = [
  { key: 'review', label: 'Review' },
  { key: 'verify', label: 'Verify' },
  { key: 'payment', label: 'Payment' },
  { key: 'ipv', label: 'IPV' },
  { key: 'esign', label: 'eSign' },
]

export default function Stepper({ activeIndex, completedCount }) {
  return (
    <ol className="flex items-start">
      {STEPS.map((step, i) => {
        const done = i < completedCount
        const active = i === activeIndex && !done
        return (
          <li key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-[0.7rem] font-bold transition-all',
                  done
                    ? 'bg-brand-coral text-white'
                    : active
                      ? 'pulse-ring bg-brand-bright text-white ring-2 ring-brand-blue/40'
                      : 'border panel text-ink-faint',
                ].join(' ')}
              >
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={[
                  'text-[0.62rem] font-semibold tracking-wide',
                  done ? 'text-ink-muted' : active ? 'text-ink' : 'text-ink-faint',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={[
                  '-mt-4 h-0.5 flex-1 rounded transition-colors',
                  i < completedCount ? 'bg-brand-coral/70' : 'bg-[color:var(--hairline)]',
                ].join(' ')}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
