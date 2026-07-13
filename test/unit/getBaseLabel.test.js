import { describe, it, expect } from 'vitest'
import { getBaseLabel } from '../../src/index.js'

describe('getBaseLabel', () => {
  it('returns the domain label for a simple two-part domain', () => {
    expect(getBaseLabel('example.com')).toBe('example')
  })

  it('returns the second label for a three-part domain', () => {
    expect(getBaseLabel('news.ycombinator.com')).toBe('ycombinator')
    expect(getBaseLabel('sub.example.com')).toBe('example')
  })

  it('returns the third-from-last label for a four-part domain (ccTLD)', () => {
    expect(getBaseLabel('sub.example.co.uk')).toBe('example')
    expect(getBaseLabel('mail.domain.com.au')).toBe('domain')
  })

  it('returns the label for a bare ccTLD domain (known ambiguity: treated as 3-part)', () => {
    // example.co.uk has 3 parts — indistinguishable from sub.example.com without a PSL.
    // The function returns the middle label, which is 'co' in this case.
    // This is consistent with the previous alias.js behaviour.
    expect(getBaseLabel('example.co.uk')).toBe('co')
  })

  it('lowercases and sanitises the label', () => {
    expect(getBaseLabel('My-Service.example.com')).toBe('example')
    expect(getBaseLabel('under_score.example.com')).toBe('example')
  })

  it('truncates labels longer than 64 characters', () => {
    const long = 'a'.repeat(70)
    const result = getBaseLabel(`${long}.com`)
    expect(result?.length).toBeLessThanOrEqual(64)
  })

  it('returns null for an empty string', () => {
    expect(getBaseLabel('')).toBeNull()
  })
})
