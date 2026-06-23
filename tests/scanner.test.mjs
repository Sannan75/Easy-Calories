import assert from 'node:assert/strict'
import test from 'node:test'

import { cameraErrorMessage, cameraIsSupported, normaliseScannedBarcode } from '../src/services/scanner.ts'

test('scanner unsupported state keeps manual entry available', () => {
  assert.equal(cameraIsSupported(undefined), false)
  assert.equal(cameraIsSupported({}), false)
  assert.equal(cameraIsSupported({ getUserMedia() {} }), true)
})

test('scanned barcode values are cleaned before the existing lookup path', () => {
  assert.equal(normaliseScannedBarcode(' 3017 6204 22003 '), '3017620422003')
})

test('camera errors get friendly actionable copy', () => {
  assert.match(cameraErrorMessage({ name: 'NotAllowedError' }), /still type the barcode/)
  assert.match(cameraErrorMessage({ name: 'NotFoundError' }), /No camera found/)
  assert.match(cameraErrorMessage(new Error('library failed')), /scanner has dropped/)
})
