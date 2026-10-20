import { describe, expect, it } from 'vitest'
import { browserName, reportText } from './cameraCheck'

describe('browserName', () => {
  it('merk en versie (zonder "Not A Brand"), anders de user agent', () => {
    expect(browserName({ userAgent: 'x', userAgentData: { brands: [{ brand: 'Not)A;Brand', version: '99' }, { brand: 'Chromium', version: '148' }, { brand: 'Google Chrome', version: '148' }], platform: 'Android' } })).toBe(
      'Google Chrome 148 (Android)',
    )
    expect(browserName({ userAgent: 'Mozilla/5.0 Firefox/140' })).toBe('Mozilla/5.0 Firefox/140')
  })
})

describe('reportText', () => {
  it('één regel per lens, met zaklamp, resolutie of fout', () => {
    const text = reportText({
      browser: 'Google Chrome 148 (Android)',
      imageCapture: true,
      lenses: [
        { label: 'camera2 0, facing back', facing: 'environment', torch: 'yes', maxWidth: 4000, maxHeight: 3000, error: null },
        { label: 'camera2 2, facing back', facing: 'environment', torch: 'no', maxWidth: null, maxHeight: null, error: null },
        { label: 'camera2 1, facing front', facing: '', torch: 'no', maxWidth: null, maxHeight: null, error: 'NotReadableError' },
      ],
    })
    expect(text.split('\n')).toEqual([
      'Dexcrate camera check',
      'Browser: Google Chrome 148 (Android)',
      'Image Capture: yes',
      '1. camera2 0, facing back (environment): flashlight: yes, max 4000×3000',
      '2. camera2 2, facing back (environment): flashlight: no',
      '3. camera2 1, facing front (facing unknown): could not open (NotReadableError)',
    ])
  })
})
