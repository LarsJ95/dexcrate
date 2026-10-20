// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { markHintSeen, readSeenHints } from './scanHints'

beforeEach(() => localStorage.clear())

describe('scanuitleg per modus', () => {
  it('eerst tonen; na gebruik per modus onthouden', () => {
    expect(readSeenHints().has('queue')).toBe(false)
    expect(markHintSeen('queue').has('queue')).toBe(true)
    markHintSeen('multi')
    expect([...readSeenHints()].sort()).toEqual(['multi', 'queue'])
  })

  it('onleesbare opslag: uitleg gewoon tonen', () => {
    localStorage.setItem('dexcrate:scan-hints-seen', '{kapot')
    expect(readSeenHints().size).toBe(0)
  })
})
