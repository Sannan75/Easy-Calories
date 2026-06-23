import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'
import { cameraErrorMessage, cameraIsSupported, normaliseScannedBarcode } from './services/scanner'

const stopVideoTracks = (video: HTMLVideoElement | null) => {
  const stream = video?.srcObject
  if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop())
  if (video) video.srcObject = null
}

export function BarcodeScanner({ onDetected, onCancel }: { onDetected: (barcode: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const detectedRef = useRef(false)
  const [error, setError] = useState('')
  const [isStillHunting, setIsStillHunting] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let active = true
    let hintTimer = 0

    const stop = () => {
      controlsRef.current?.stop()
      controlsRef.current = null
      stopVideoTracks(video)
    }

    if (!cameraIsSupported(navigator.mediaDevices)) {
      setError('No camera found. Very retro. Manual barcode entry still works.')
      return stop
    }

    hintTimer = window.setTimeout(() => setIsStillHunting(true), 20_000)
    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 90, delayBetweenScanSuccess: 500 })
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' } } },
          video,
          (result, _scanError, callbackControls) => {
            if (!active || !result || detectedRef.current) return
            const barcode = normaliseScannedBarcode(result.getText())
            if (!barcode) return
            if (import.meta.env.DEV) console.debug('[Easy Calories] detected barcode', barcode)
            detectedRef.current = true
            callbackControls.stop()
            stopVideoTracks(video)
            onDetected(barcode)
          },
        )
        if (!active) controls.stop()
        else controlsRef.current = controls
      } catch (scanError) {
        if (active) {
          stop()
          setError(cameraErrorMessage(scanError))
        }
      }
    })()

    return () => {
      active = false
      window.clearTimeout(hintTimer)
      stop()
    }
  }, [onDetected])

  return <section className="scanner-panel" aria-label="Barcode scanner">
    <div className="scanner-preview">
      <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview" />
      <div className="scanner-frame" aria-hidden="true" />
    </div>
    <p className="scanner-instruction">Point the barcode at the rectangle. The snack oracle is squinting.</p>
    <p className="scanner-privacy">Your phone may ask each time. Annoying, but private. We only use the camera while scanning.</p>
    {isStillHunting && !error && <p className="scanner-hint" role="status">Still hunting. Better light or a flatter packet may help.</p>}
    {error && <div className="lookup-message error" role="status">{error}</div>}
    <div className="scanner-actions">
      <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
      <button className="text-button" type="button" onClick={onCancel}>Type it instead</button>
    </div>
  </section>
}
