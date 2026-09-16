export default function AuroraBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        backgroundColor: 'var(--app-bg)',
        backgroundImage: 'var(--bg-image), var(--aurora-grad)',
        backgroundSize: 'cover, cover',
        backgroundPosition: 'center, center',
        backgroundRepeat: 'no-repeat, no-repeat',
      }}
    >
      {/* scrim to keep the centered glass card and text readable over the image */}
      <div className="absolute inset-0" style={{ background: 'var(--bg-scrim)' }} />

      {/* faint bloom directly behind the card */}
      <div
        className="glow"
        style={{
          width: 720,
          height: 560,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle at 50% 45%, var(--bloom), transparent 70%)',
          animation: 'none',
        }}
      />

      {/* grain */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  )
}
