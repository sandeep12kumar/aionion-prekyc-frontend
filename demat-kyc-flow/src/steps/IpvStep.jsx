import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRightIcon, CameraIcon, CheckIcon, LocationIcon, InfoIcon } from '../components/icons.jsx'
import { uploadIpvCapture } from '../lib/api.js'
import { loadFaceGuard, analyseFrame, GUARD } from '../lib/faceGuard.js'

const RECORD_SECONDS = 5

const GUARD_MESSAGE = {
  loading: 'Loading face check…',
  'no-face': 'No face detected — look straight at the camera.',
  'multi-face': 'More than one person in frame — only you should be visible.',
  'too-small': 'Move closer — your face should fill the frame.',
  'off-center': 'Centre your face in the frame.',
  ready: 'Face detected — you can record.',
  unavailable: 'Live face check unavailable — recording will still be reviewed manually.',
}

function StatusPill({ ok, pending, children }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold ring-1',
        ok
          ? 'bg-good/15 text-good ring-good/40'
          : pending
            ? 'fill text-ink-muted ring-[color:var(--hairline)]'
            : 'bg-bad/15 text-bad ring-bad/45',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

export default function IpvStep({ applicationId, onNext }) {
  const [phase, setPhase] = useState('intro') // intro | live | recording | recorded | uploading | done
  const [camState, setCamState] = useState('idle') // idle | granted | denied
  const [loc, setLoc] = useState(null) // { lat, lng, accuracy }
  const [locState, setLocState] = useState('idle') // idle | granted | denied
  const [seconds, setSeconds] = useState(RECORD_SECONDS)
  const [clipUrl, setClipUrl] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [capturedAt, setCapturedAt] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [guardCode, setGuardCode] = useState('loading') // see GUARD_MESSAGE keys
  const [guardError, setGuardError] = useState('')

  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const clipBlobRef = useRef(null)
  const photoBlobRef = useRef(null)
  const stillTimerRef = useRef(null)

  const guardRef = useRef(null) // FaceLandmarker
  const guardCodeRef = useRef('loading')
  const rafRef = useRef(0)
  const lastTsRef = useRef(0)
  const prevNoseRef = useRef(null)
  const checksRef = useRef(null)

  const setGuard = useCallback((code) => {
    guardCodeRef.current = code
    setGuardCode((prev) => (prev === code ? prev : code))
  }, [])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(
    () => () => {
      stopStream()
      cancelAnimationFrame(rafRef.current)
      clearTimeout(stillTimerRef.current)
    },
    [stopStream],
  )

  // attach stream to <video> once we're live
  useEffect(() => {
    if ((phase === 'live' || phase === 'recording') && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [phase])

  // ---- face-guard detection loop (runs while live or recording) ----
  useEffect(() => {
    if (phase !== 'live' && phase !== 'recording') return
    let stopped = false

    const tick = () => {
      if (stopped) return
      const landmarker = guardRef.current
      const video = videoRef.current

      if (landmarker && video) {
        let ts = performance.now()
        if (ts <= lastTsRef.current) ts = lastTsRef.current + 1
        lastTsRef.current = ts

        let a = null
        try {
          a = analyseFrame(landmarker, video, ts)
        } catch {
          a = null
        }

        if (a) {
          if (a.faceCount === 0) setGuard('no-face')
          else if (a.faceCount > 1) setGuard('multi-face')
          else if (a.faceFrac < GUARD.MIN_FACE_FRAC) setGuard('too-small')
          else if (!a.centered) setGuard('off-center')
          else setGuard('ready')

          // accumulate liveness evidence during the recording
          if (checksRef.current) {
            const c = checksRef.current
            c.frames += 1
            if (a.faceCount === 0) c.noFaceFrames += 1
            if (a.faceCount > 1) c.multiFaceFrames += 1
            if (a.faceCount >= 1) c.minFaceFrac = Math.min(c.minFaceFrac, a.faceFrac)
            c.blinkMax = Math.max(c.blinkMax, a.blink)
            if (a.nose && prevNoseRef.current) {
              c.noseMotion += Math.hypot(
                a.nose.x - prevNoseRef.current.x,
                a.nose.y - prevNoseRef.current.y,
              )
            }
            prevNoseRef.current = a.nose
          } else {
            prevNoseRef.current = a.nose
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(rafRef.current)
    }
  }, [phase, setGuard])

  // Pull one still frame off the live camera feed — only when a single valid
  // face is present. Called midway through the recording, with a fallback
  // grab when the recorder stops (post-validation).
  const grabStill = useCallback(
    () =>
      new Promise((resolve) => {
        const v = videoRef.current
        if (!v || !v.videoWidth || photoBlobRef.current) return resolve()
        if (guardCodeRef.current === 'no-face' || guardCodeRef.current === 'multi-face') return resolve()
        const canvas = document.createElement('canvas')
        canvas.width = v.videoWidth
        canvas.height = v.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve()
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (blob) => {
            if (blob && !photoBlobRef.current) {
              photoBlobRef.current = blob
              setPhotoUrl(URL.createObjectURL(blob))
            }
            resolve()
          },
          'image/jpeg',
          0.92,
        )
      }),
    [],
  )

  async function requestLocation() {
    if (!('geolocation' in navigator)) {
      setLocState('denied')
      return
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLoc({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
          })
          setLocState('granted')
          resolve()
        },
        () => {
          setLocState('denied')
          resolve()
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      )
    })
  }

  async function requestCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      streamRef.current = stream
      setCamState('granted')
    } catch {
      setCamState('denied')
    }
  }

  async function startIpv() {
    setGuardError('')
    setGuard('loading')
    await Promise.all([requestCamera(), requestLocation()])
    setPhase('live')
    loadFaceGuard()
      .then((landmarker) => {
        guardRef.current = landmarker
      })
      .catch(() => {
        setGuard('unavailable')
      })
  }

  function startRecording() {
    const stream = streamRef.current
    if (!stream) return
    chunksRef.current = []
    clipBlobRef.current = null
    photoBlobRef.current = null
    prevNoseRef.current = null
    checksRef.current = {
      frames: 0,
      noFaceFrames: 0,
      multiFaceFrames: 0,
      minFaceFrac: 1,
      blinkMax: 0,
      noseMotion: 0,
    }
    setGuardError('')
    setPhotoUrl('')
    setSeconds(RECORD_SECONDS)
    setPhase('recording')

    const finalizeRecorded = async (blob) => {
      const checks = checksRef.current
      checksRef.current = null
      const failure = validateLiveness(checks)
      if (failure) {
        prevNoseRef.current = null
        setGuardError(failure)
        setPhase('live')
        return
      }
      clipBlobRef.current = blob
      setClipUrl(URL.createObjectURL(blob))
      await grabStill()
      setCapturedAt(new Date())
      setPhase('recorded')
    }

    try {
      if (!window.MediaRecorder) throw new Error('no MediaRecorder')
      const candidates = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4']
      const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || ''
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data)
      rec.onstop = () => finalizeRecorded(new Blob(chunksRef.current, { type: mimeType || 'video/webm' }))
      recorderRef.current = rec
      rec.start()
      stillTimerRef.current = setTimeout(grabStill, Math.round((RECORD_SECONDS * 1000) / 2))
    } catch {
      // MediaRecorder unsupported — capture a single still, no video, but
      // still enforce the guard checks accumulated so far.
      setTimeout(async () => {
        const checks = checksRef.current
        checksRef.current = null
        const failure = validateLiveness(checks)
        if (failure) {
          setGuardError(failure)
          setPhase('live')
          return
        }
        await grabStill()
        setClipUrl(photoBlobRef.current ? URL.createObjectURL(photoBlobRef.current) : '')
        setCapturedAt(new Date())
        setPhase('recorded')
      }, RECORD_SECONDS * 1000)
    }
  }

  /** null = passed, string = why the take is rejected. Skipped if the guard never ran. */
  function validateLiveness(c) {
    if (!c || c.frames === 0) return null // guard unavailable — reviewed manually
    if (c.multiFaceFrames > 2) {
      return 'More than one person was detected. Only you should be in the frame — record again alone.'
    }
    if (c.noFaceFrames > Math.max(3, c.frames * 0.25)) {
      return 'Your face was not detected for the whole clip. Keep your face centred in the frame and record again.'
    }
    if (c.minFaceFrac < GUARD.MIN_FACE_FRAC) {
      return 'Hold the camera closer so only your face fills the frame. A photo or a phone screen held up to the camera is not accepted.'
    }
    if (c.blinkMax < GUARD.BLINK_SCORE && c.noseMotion < GUARD.MIN_NOSE_MOTION) {
      return 'We could not confirm a live person. Look straight at the camera and blink once while it records.'
    }
    return null
  }

  // countdown while recording
  useEffect(() => {
    if (phase !== 'recording') return
    if (seconds <= 0) {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      return
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, seconds])

  function retake() {
    clearTimeout(stillTimerRef.current)
    checksRef.current = null
    prevNoseRef.current = null
    clipBlobRef.current = null
    photoBlobRef.current = null
    setGuardError('')
    setClipUrl('')
    setPhotoUrl('')
    setPhase('live')
  }

  async function submit() {
    const photo = photoBlobRef.current
    if (!photo || !loc) return

    setUploadError('')
    setPhase('uploading')
    stopStream()

    try {
      await uploadIpvCapture(applicationId, {
        photoBlob: photo,
        videoBlob: clipBlobRef.current || undefined,
        latitude: loc.lat,
        longitude: loc.lng,
        accuracy: loc.accuracy,
        capturedAt: capturedAt || new Date(),
      })
      setPhase('done')
    } catch (err) {
      setUploadError(err.message)
      setPhase('recorded')
    }
  }

  const guardReady = guardCode === 'ready' || guardCode === 'unavailable'
  const canRecord = camState === 'granted' && locState === 'granted' && guardReady

  /* ---------- done ---------- */
  if (phase === 'done') {
    return (
      <div className="animate-step flex flex-col items-center text-center">
        <div className="animate-pop flex h-16 w-16 items-center justify-center rounded-full bg-good/15 text-good ring-1 ring-good/40">
          <CheckIcon className="h-8 w-8" animate />
        </div>
        <h1 className="mt-5 font-display text-xl font-bold tracking-tight text-ink">
          IPV recorded
        </h1>
        <p className="mt-2 max-w-xs text-sm text-ink-muted">
          Your 5-second video, face photo and location have been securely sent to
          AIONION Capital for compliance review.
        </p>
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Captured face"
            className="mt-4 h-24 w-24 rounded-xl object-cover ring-1 ring-[color:var(--hairline)]"
          />
        )}
        <div className="mt-4 w-full rounded-xl fill p-3 text-left text-xs text-ink-muted">
          <div className="flex justify-between py-0.5">
            <span>Location</span>
            <span className="font-display font-semibold tabular-nums text-ink">
              {loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : '—'}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span>Accuracy</span>
            <span className="font-semibold text-ink">{loc ? `±${loc.accuracy} m` : '—'}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span>Captured</span>
            <span className="font-semibold text-ink">
              {capturedAt?.toLocaleString('en-IN') ?? '—'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onNext}
          className="group mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-bright py-4 font-display text-sm font-bold tracking-wide text-white shadow-[0_16px_40px_-12px_rgba(0,35,255,0.32)] transition-[transform,background] hover:brightness-110 active:scale-[0.99]"
        >
          Continue to eSign
          <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    )
  }

  /* ---------- uploading ---------- */
  if (phase === 'uploading') {
    return (
      <div className="animate-step flex flex-col items-center py-12 text-center">
        <span className="spinner spinner-lg h-14 w-14" />
        <p className="mt-6 font-display text-base font-semibold text-ink">
          Uploading video, photo &amp; location
        </p>
        <p className="mt-1 text-xs text-ink-muted">Please keep this screen open.</p>
      </div>
    )
  }

  const showGuardHint = (phase === 'live' || phase === 'recording') && camState === 'granted'
  const guardBad = ['no-face', 'multi-face', 'too-small', 'off-center'].includes(guardCode)

  return (
    <div className="animate-step">
      <span className="inline-flex items-center gap-2 rounded-full bg-brand-bright/12 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-brand-blue ring-1 ring-brand-blue/45">
        Step 3 · Video IPV
      </span>
      <h1 className="mt-2.5 font-display text-[1.35rem] font-bold leading-tight tracking-tight text-ink">
        Record your video IPV
      </h1>
      <p className="mt-1 text-[0.78rem] leading-snug text-ink-muted">
        Only you should be in the frame. Face the camera and blink once while it records —
        a {RECORD_SECONDS}-second clip, a still photo of your face and your location are captured.
      </p>

      {/* permission + face-check status */}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <StatusPill ok={camState === 'granted'} pending={camState === 'idle'}>
          <CameraIcon className="h-3.5 w-3.5" />
          Camera {camState === 'granted' ? 'ready' : camState === 'denied' ? 'blocked' : 'needed'}
        </StatusPill>
        <StatusPill ok={locState === 'granted'} pending={locState === 'idle'}>
          <LocationIcon className="h-3.5 w-3.5" />
          {locState === 'granted' && loc
            ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)} · ±${loc.accuracy}m`
            : locState === 'denied'
              ? 'Location blocked'
              : 'Location needed'}
        </StatusPill>
        {showGuardHint && (
          <StatusPill ok={guardCode === 'ready'} pending={guardCode === 'loading' || guardCode === 'unavailable'}>
            {GUARD_MESSAGE[guardCode]}
          </StatusPill>
        )}
      </div>

      {/* viewport */}
      <div className="mt-2.5 overflow-hidden rounded-xl border hairline bg-black/40 shadow-inner">
        <div className="relative aspect-[2/1] w-full">
          {(phase === 'live' || phase === 'recording') && camState === 'granted' ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
                <span
                  className={[
                    'rounded-md px-2 py-1 text-[0.7rem] font-medium text-white backdrop-blur',
                    guardBad ? 'bg-bad/80' : 'bg-black/45',
                  ].join(' ')}
                >
                  {phase === 'recording' && seconds <= RECORD_SECONDS - 1 && seconds >= 1
                    ? 'Blink once'
                    : GUARD_MESSAGE[guardCode]}
                </span>
                {phase === 'recording' && (
                  <span className="flex items-center gap-1.5 rounded-md bg-bad/90 px-2 py-1 text-[0.7rem] font-bold text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    REC {seconds}s
                  </span>
                )}
              </div>
            </>
          ) : phase === 'recorded' && clipUrl ? (
            clipUrl.startsWith('blob:') && clipBlobRef.current?.type.startsWith('video/') ? (
              <video src={clipUrl} controls playsInline className="h-full w-full object-cover" />
            ) : (
              <img src={clipUrl} alt="IPV capture" className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-white/70">
              <CameraIcon className="h-9 w-9" />
              <span className="text-xs">
                {camState === 'denied'
                  ? 'Camera access blocked'
                  : 'Camera preview appears here'}
              </span>
            </div>
          )}
        </div>
      </div>

      {phase === 'recorded' && photoUrl && (
        <div className="mt-2 flex items-center gap-2.5 rounded-xl fill p-2">
          <img
            src={photoUrl}
            alt="Captured face"
            className="h-12 w-12 rounded-lg object-cover ring-1 ring-[color:var(--hairline)]"
          />
          <span className="text-[0.7rem] leading-snug text-ink-muted">
            Face photo captured from your video — this is what&apos;s saved for your documents.
          </span>
        </div>
      )}

      {guardError && (phase === 'live' || phase === 'intro') && (
        <div className="mt-2 flex gap-1.5 rounded-lg bg-bad/[0.12] p-2 text-[0.68rem] leading-snug text-bad">
          <InfoIcon className="mt-0.5 h-3 w-3 shrink-0" />
          {guardError}
        </div>
      )}

      {(camState === 'denied' || locState === 'denied') && phase !== 'intro' && (
        <div className="mt-2 flex gap-1.5 rounded-lg bg-bad/[0.12] p-2 text-[0.68rem] leading-snug text-bad">
          <InfoIcon className="mt-0.5 h-3 w-3 shrink-0" />
          {camState === 'denied' && 'Camera is blocked. '}
          {locState === 'denied' && 'Location is blocked. '}
          Enable {camState === 'denied' && locState === 'denied' ? 'both' : 'it'} in your
          browser&apos;s site settings, then retry.
        </div>
      )}

      {/* controls */}
      <div className="mt-3">
        {phase === 'intro' && (
          <button
            type="button"
            onClick={startIpv}
            className="w-full rounded-xl bg-brand-bright py-3 font-display text-sm font-bold tracking-wide text-white shadow-[0_14px_34px_-12px_rgba(0,35,255,0.4)] transition-[transform,filter] hover:brightness-110 active:scale-[0.99]"
          >
            Allow camera &amp; location
          </button>
        )}

        {phase === 'live' && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={startRecording}
              disabled={!canRecord}
              className="w-full rounded-xl bg-brand-bright py-3 font-display text-sm font-bold tracking-wide text-white shadow-[0_14px_34px_-12px_rgba(0,35,255,0.4)] transition-[transform,opacity,filter] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
            >
              {canRecord
                ? `Start recording (${RECORD_SECONDS}s)`
                : guardBad
                  ? GUARD_MESSAGE[guardCode]
                  : `Start recording (${RECORD_SECONDS}s)`}
            </button>
            {(camState === 'denied' || locState === 'denied') && (
              <button
                type="button"
                onClick={startIpv}
                className="w-full rounded-xl border hairline py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
              >
                Retry permissions
              </button>
            )}
          </div>
        )}

        {phase === 'recording' && (
          <button
            type="button"
            onClick={() => recorderRef.current?.state === 'recording' && recorderRef.current.stop()}
            className="w-full rounded-xl border border-bad/50 py-3 font-display text-sm font-semibold text-bad transition-colors hover:bg-bad/[0.06]"
          >
            Stop &amp; use this take
          </button>
        )}

        {phase === 'recorded' && (
          <>
            {uploadError && (
              <div className="mb-2 flex gap-1.5 rounded-lg bg-bad/[0.12] p-2 text-[0.68rem] leading-snug text-bad">
                <InfoIcon className="mt-0.5 h-3 w-3 shrink-0" />
                {uploadError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={retake}
                className="rounded-xl border hairline py-3 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!photoBlobRef.current}
                className="rounded-xl bg-brand-bright py-3 font-display text-sm font-bold tracking-wide text-white shadow-[0_16px_40px_-12px_rgba(0,35,255,0.32)] transition-[transform,background] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Submit
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
