/**
 * Unit tests for GET /api/sessions/[id]/output helper logic.
 * Tests cover section ordering, status guard, and response shape.
 */

export {}

// ---------------------------------------------------------------------------
// Types (mirror from src/lib/types.ts)
// ---------------------------------------------------------------------------

type SectionKey =
  | 'executive_summary' | 'speaker_biography' | 'key_accomplishments'
  | 'core_messages' | 'areas_of_expertise' | 'speaking_style'
  | 'audience_considerations' | 'qa_preparation' | 'logistical_notes' | 'online_presence'

type GeneratedSection = {
  section_order: number
  section_key: SectionKey
  section_title: string
  content: string
}

// ---------------------------------------------------------------------------
// Pure helpers extracted from the output route
// ---------------------------------------------------------------------------

const SECTION_KEYS: SectionKey[] = [
  'executive_summary',
  'speaker_biography',
  'key_accomplishments',
  'core_messages',
  'areas_of_expertise',
  'speaking_style',
  'audience_considerations',
  'qa_preparation',
  'logistical_notes',
  'online_presence',
]

function sortSectionsByCanonicalOrder(rows: GeneratedSection[]): GeneratedSection[] {
  const sectionIndexMap = new Map(SECTION_KEYS.map((key, i) => [key, i]))
  return [...rows].sort((a, b) => {
    const ai = sectionIndexMap.get(a.section_key) ?? a.section_order
    const bi = sectionIndexMap.get(b.section_key) ?? b.section_order
    return ai - bi
  })
}

function isOutputReady(status: string): boolean {
  return status === 'completed'
}

// ---------------------------------------------------------------------------
// sortSectionsByCanonicalOrder
// ---------------------------------------------------------------------------

function makeSection(key: SectionKey, order: number): GeneratedSection {
  return { section_order: order, section_key: key, section_title: key, content: 'text' }
}

describe('sortSectionsByCanonicalOrder', () => {
  it('returns sections in SECTION_KEYS order regardless of db row order', () => {
    const rows: GeneratedSection[] = [
      makeSection('online_presence', 10),
      makeSection('executive_summary', 1),
      makeSection('qa_preparation', 8),
      makeSection('speaker_biography', 2),
    ]
    const sorted = sortSectionsByCanonicalOrder(rows)
    expect(sorted.map(s => s.section_key)).toEqual([
      'executive_summary',
      'speaker_biography',
      'qa_preparation',
      'online_presence',
    ])
  })

  it('returns a full 10-section briefing in canonical order', () => {
    // Insert in reverse order to ensure sorting is not a no-op
    const rows = [...SECTION_KEYS].reverse().map((key, i) => makeSection(key, 10 - i))
    const sorted = sortSectionsByCanonicalOrder(rows)
    expect(sorted.map(s => s.section_key)).toEqual(SECTION_KEYS)
  })

  it('does not mutate the original array', () => {
    const rows = [makeSection('online_presence', 10), makeSection('executive_summary', 1)]
    const original = [...rows]
    sortSectionsByCanonicalOrder(rows)
    expect(rows[0].section_key).toBe(original[0].section_key)
    expect(rows[1].section_key).toBe(original[1].section_key)
  })

  it('handles a single section without error', () => {
    const rows = [makeSection('core_messages', 4)]
    const sorted = sortSectionsByCanonicalOrder(rows)
    expect(sorted).toHaveLength(1)
    expect(sorted[0].section_key).toBe('core_messages')
  })

  it('returns an empty array unchanged', () => {
    expect(sortSectionsByCanonicalOrder([])).toEqual([])
  })

  it('preserves all section fields when sorting', () => {
    const rows: GeneratedSection[] = [
      { section_order: 5, section_key: 'areas_of_expertise', section_title: 'Areas', content: 'expertise content' },
      { section_order: 1, section_key: 'executive_summary', section_title: 'Exec', content: 'summary content' },
    ]
    const sorted = sortSectionsByCanonicalOrder(rows)
    expect(sorted[0]).toEqual({ section_order: 1, section_key: 'executive_summary', section_title: 'Exec', content: 'summary content' })
    expect(sorted[1]).toEqual({ section_order: 5, section_key: 'areas_of_expertise', section_title: 'Areas', content: 'expertise content' })
  })
})

// ---------------------------------------------------------------------------
// isOutputReady — session status guard
// ---------------------------------------------------------------------------

describe('isOutputReady', () => {
  it('returns true for completed status', () => {
    expect(isOutputReady('completed')).toBe(true)
  })

  it('returns false for pending status', () => {
    expect(isOutputReady('pending')).toBe(false)
  })

  it('returns false for generating status', () => {
    expect(isOutputReady('generating')).toBe(false)
  })

  it('returns false for extracting status', () => {
    expect(isOutputReady('extracting')).toBe(false)
  })

  it('returns false for failed status', () => {
    expect(isOutputReady('failed')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SECTION_KEYS — structural contract
// ---------------------------------------------------------------------------

describe('SECTION_KEYS', () => {
  it('contains exactly 10 keys', () => {
    expect(SECTION_KEYS).toHaveLength(10)
  })

  it('has no duplicate keys', () => {
    const unique = new Set(SECTION_KEYS)
    expect(unique.size).toBe(SECTION_KEYS.length)
  })

  it('starts with executive_summary and ends with online_presence', () => {
    expect(SECTION_KEYS[0]).toBe('executive_summary')
    expect(SECTION_KEYS[SECTION_KEYS.length - 1]).toBe('online_presence')
  })
})
