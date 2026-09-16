import { useEffect, useState } from 'react'

const REDIRECT_URL = 'https://www.aionioncapital.com/'
const SECONDS = 10

/**
 * Final screen after eSign. Shows the AIONION "Happy Investing..!"
 * congratulations card for 10 seconds, then sends the client to the
 * company website.
 */
export default function HappyInvestingScreen() {
  const [left, setLeft] = useState(SECONDS)

  useEffect(() => {
    const tick = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000)
    const go = setTimeout(() => {
      window.location.href = REDIRECT_URL
    }, SECONDS * 1000)
    return () => {
      clearInterval(tick)
      clearTimeout(go)
    }
  }, [])

  return (
    <div className="animate-step -m-4 sm:-m-4">
      <div className="rounded-2xl bg-white px-5 py-8 text-center text-[#12142f] sm:rounded-3xl sm:px-8 sm:py-10">
        <img
          src="/aionion-logo.png"
          alt="AIONION Capital — Research | Trust | Forever"
          className="mx-auto h-14 w-auto max-w-[260px] object-contain sm:h-16"
        />

        {/* Happy Investing..! */}
        <div className="relative mx-auto mt-6 flex items-center justify-center gap-3">
          <span className="hidden h-2.5 w-10 shrink-0 rounded-sm bg-[#0023ff] sm:block" />
          <h1
            className="text-[2.6rem] leading-none sm:text-[3.4rem]"
            style={{ fontFamily: '"Great Vibes", "Segoe Script", cursive' }}
          >
            <span className="text-[#1c27d6]">Happy </span>
            <span className="text-[#fe667c]">Investing..!</span>
          </h1>
          <span className="hidden h-2.5 w-10 shrink-0 rounded-sm bg-[#fe667c] sm:block" />
        </div>

        <div className="mx-auto mt-7 max-w-md text-left">
          <p className="font-display text-base font-extrabold italic text-[#12142f]">Congratulations!</p>
          <p className="mt-3 text-[0.95rem] italic leading-relaxed text-[#3a3f5c]">
            Your Demat Account Opening Process Has Been Completed Successfully.
          </p>
          <p className="mt-3 text-[0.95rem] italic leading-relaxed text-[#3a3f5c]">
            Your Demat Account will be activated within 2 working days.
          </p>
          <p className="mt-3 text-[0.95rem] italic leading-relaxed text-[#3a3f5c]">
            You will receive a confirmation notification once your account is active.
          </p>
          <p className="mt-3 text-[0.95rem] italic leading-relaxed text-[#3a3f5c]">
            Thank you for choosing us.
          </p>
        </div>

        <p className="mt-8 text-xs text-[#8d92ad]">
          Redirecting to aionioncapital.com in {left}s…{' '}
          <a href={REDIRECT_URL} className="font-semibold text-[#0023ff] hover:underline">
            Go now
          </a>
        </p>
      </div>
    </div>
  )
}
