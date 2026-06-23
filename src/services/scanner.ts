export type CameraSupport = { getUserMedia?: unknown } | undefined

export const cameraIsSupported = (mediaDevices: CameraSupport) => typeof mediaDevices?.getUserMedia === 'function'

export const normaliseScannedBarcode = (value: string) => value.replace(/\D/g, '')

export function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException
    ? error.name
    : typeof error === 'object' && error && 'name' in error ? String(error.name) : ''

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'The camera was not invited to snack court. You can still type the barcode.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return 'No camera found. Very retro. Manual barcode entry still works.'
  }
  return 'The scanner has dropped its tiny clipboard. You can still type the barcode.'
}
