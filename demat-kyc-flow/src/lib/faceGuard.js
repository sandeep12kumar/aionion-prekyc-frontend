/**
 * IPV face guard — MediaPipe FaceLandmarker running on the live camera feed.
 * Used to enforce, before and during the 5s recording:
 *   - exactly one human face in frame (0 = no face / an object, >1 = another person)
 *   - the face is large & centred enough (a phone held up showing a photo gives
 *     a small face and, together with the liveness check, is rejected)
 *   - liveness: a real blink or head movement during the clip (a still photo has neither)
 */

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

let landmarkerPromise = null

/** Lazily load the WASM + model and build a VIDEO-mode FaceLandmarker (cached). */
export function loadFaceGuard() {
  if (landmarkerPromise) return landmarkerPromise
  landmarkerPromise = (async () => {
    const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 3,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
  })().catch((err) => {
    landmarkerPromise = null // allow a retry
    throw err
  })
  return landmarkerPromise
}

/**
 * Analyse one video frame.
 * @returns {null | { faceCount, faceFrac, centered, blink, nose:{x,y}|null }}
 *          null when the video isn't ready yet.
 */
export function analyseFrame(landmarker, video, tsMs) {
  if (!video || video.readyState < 2 || !video.videoWidth) return null

  const result = landmarker.detectForVideo(video, tsMs)
  const faces = result.faceLandmarks || []
  const faceCount = faces.length
  if (faceCount === 0) {
    return { faceCount: 0, faceFrac: 0, centered: false, blink: 0, nose: null }
  }

  // biggest face's normalised bounding box
  let best = { frac: 0, cx: 0.5, cy: 0.5, nose: null }
  for (const lm of faces) {
    let minX = 1
    let maxX = 0
    let minY = 1
    let maxY = 0
    for (const p of lm) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const frac = Math.max(maxX - minX, maxY - minY)
    if (frac > best.frac) {
      best = {
        frac,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
        nose: lm[1] ? { x: lm[1].x, y: lm[1].y } : null,
      }
    }
  }

  let blink = 0
  const categories = result.faceBlendshapes?.[0]?.categories
  if (categories) {
    const l = categories.find((c) => c.categoryName === 'eyeBlinkLeft')?.score || 0
    const r = categories.find((c) => c.categoryName === 'eyeBlinkRight')?.score || 0
    blink = Math.max(l, r)
  }

  const centered = best.cx > 0.26 && best.cx < 0.74 && best.cy > 0.18 && best.cy < 0.86
  return { faceCount, faceFrac: best.frac, centered, blink, nose: best.nose }
}

// thresholds, exported so IpvStep and any tests agree
export const GUARD = {
  MIN_FACE_FRAC: 0.22, // face must fill ≥22% of the frame's larger dimension
  BLINK_SCORE: 0.45, // a blendshape blink score this high counts as a blink
  MIN_NOSE_MOTION: 0.02, // total normalised nose travel over the clip if no blink
}
