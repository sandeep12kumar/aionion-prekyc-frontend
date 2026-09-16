import { useEffect, useState } from 'react'
import { SunIcon, MoonIcon } from './icons.jsx'

function readTheme() {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('aionion-theme', theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])

  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="frost fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full text-ink transition-[transform,filter] hover:brightness-110 active:scale-95"
    >
      {theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  )
}
