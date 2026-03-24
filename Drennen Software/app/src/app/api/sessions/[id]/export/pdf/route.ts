import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonError } from '@/lib/types'
import { safeFilename, formatDate } from '@/lib/export-helpers'

export const runtime = 'nodejs'
export const maxDuration = 30

// ─── Brand colours ────────────────────────────────────────────────────────────

const ORANGE = '#f36f21'
const PURPLE = '#542785'
const GREEN  = '#0f6b37'

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 60,
    paddingBottom: 70,
    paddingLeft: 60,
    paddingRight: 60,
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
  },
  // Title page
  titlePage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandStripe: {
    height: 6,
    width: '100%',
    backgroundColor: ORANGE,
    marginBottom: 48,
  },
  titleAccent: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: PURPLE,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#555555',
    marginBottom: 40,
    textAlign: 'center',
  },
  divider: {
    height: 2,
    width: 60,
    backgroundColor: GREEN,
    marginBottom: 40,
    alignSelf: 'center',
  },
  metaText: {
    fontSize: 9,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 1.6,
  },
  // Section pages
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sectionBadgeText: {
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#111111',
    flex: 1,
  },
  sectionContent: {
    fontSize: 10,
    color: '#333333',
    lineHeight: 1.7,
    marginLeft: 36,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#eeeeee',
    marginTop: 20,
    marginBottom: 20,
  },
  sideAccent: {
    width: 3,
    backgroundColor: ORANGE,
    borderRadius: 2,
    marginRight: 12,
    minHeight: 40,
  },
  sectionBody: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 60,
    right: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eeeeee',
    paddingTop: 8,
  },
  footerLeft: {
    fontSize: 7,
    color: '#aaaaaa',
  },
  footerRight: {
    fontSize: 7,
    color: '#aaaaaa',
  },
  footerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ORANGE,
  },
  // Page header (non-title pages)
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pageHeaderTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: PURPLE,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pageHeaderRight: {
    fontSize: 8,
    color: '#aaaaaa',
  },
})

// ─── PDF Document builder ─────────────────────────────────────────────────────

interface Section {
  section_order: number
  section_title: string
  content: string
}

interface PdfDocProps {
  speakerName: string
  sections: Section[]
  generatedAt: string
}

function buildPdfDocument({ speakerName, sections, generatedAt }: PdfDocProps) {
  const generatedDateLabel = `Generated ${formatDate(generatedAt)}`

  // Title page
  const titlePage = React.createElement(
    Page,
    { key: 'title', size: 'A4' as const, style: styles.page },
    // Top colour stripe
    React.createElement(View, { style: styles.brandStripe }),
    // Centred content
    React.createElement(
      View,
      { style: styles.titlePage },
      React.createElement(Text, { style: styles.titleAccent }, 'Speaker Briefing Document'),
      React.createElement(Text, { style: styles.title }, speakerName),
      React.createElement(Text, { style: styles.subtitle }, 'Prepared for Faculty Use'),
      React.createElement(View, { style: styles.divider }),
      React.createElement(Text, { style: styles.metaText }, generatedDateLabel),
    ),
    // Footer
    React.createElement(
      View,
      { style: styles.footer },
      React.createElement(Text, { style: styles.footerLeft }, 'CONFIDENTIAL — FOR INTERNAL USE ONLY'),
      React.createElement(View, { style: styles.footerDot }),
      React.createElement(Text, { style: styles.footerRight }, generatedDateLabel),
    ),
  )

  // Section pages (group all into one page, @react-pdf wraps automatically)
  const sectionsPage = React.createElement(
    Page,
    { key: 'sections', size: 'A4' as const, style: styles.page },
    // Page header
    React.createElement(
      View,
      { style: styles.pageHeader },
      React.createElement(Text, { style: styles.pageHeaderTitle }, speakerName + ' — Speaker Briefing'),
      React.createElement(Text, { style: styles.pageHeaderRight }, 'Drennen MGMT 305'),
    ),
    // Sections
    ...sections.map((section) =>
      React.createElement(
        View,
        { key: section.section_order, wrap: false, style: { marginBottom: 18 } },
        // Section header row
        React.createElement(
          View,
          { style: styles.sectionHeader },
          React.createElement(
            View,
            { style: styles.sectionBadge },
            React.createElement(Text, { style: styles.sectionBadgeText },
              String(section.section_order).padStart(2, '0')
            ),
          ),
          React.createElement(Text, { style: styles.sectionTitle }, section.section_title),
        ),
        // Section body with left accent bar
        React.createElement(
          View,
          { style: styles.sectionBody },
          React.createElement(View, { style: styles.sideAccent }),
          React.createElement(Text, { style: { fontSize: 10, color: '#333333', lineHeight: 1.7, flex: 1 } },
            section.content
          ),
        ),
        // Divider (except after last)
        section.section_order < sections.length
          ? React.createElement(View, { style: styles.sectionDivider })
          : null,
      )
    ),
    // Footer on sections page
    React.createElement(
      View,
      { style: styles.footer },
      React.createElement(Text, { style: styles.footerLeft }, speakerName + ' — Speaker Briefing Document'),
      React.createElement(View, { style: styles.footerDot }),
      React.createElement(Text, { style: styles.footerRight }, generatedDateLabel),
    ),
  )

  return React.createElement(Document, null, titlePage, sectionsPage)
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params
  const url = new URL(request.url)
  const tokenParam = url.searchParams.get('token')

  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string

  if (tokenParam) {
    // Manual JWT validation for direct download links
    const admin = createAdminClient()
    const { data: { user }, error } = await admin.auth.getUser(tokenParam)
    if (error || !user) {
      return jsonError('UNAUTHORIZED', 'Invalid or expired token', 401)
    }
    userId = user.id
  } else {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
    }
    userId = user.id
  }

  // ── Fetch session ─────────────────────────────────────────────────────────
  const admin = createAdminClient()
  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .select('id, speaker_name, status, completed_at')
    .eq('id', sessionId)
    .eq('professor_id', userId)
    .single()

  if (sessionError || !session) {
    return jsonError('NOT_FOUND', 'Session not found', 404)
  }

  if (session.status !== 'completed') {
    return jsonError('NOT_READY', 'Session is not yet completed', 409)
  }

  // ── Fetch generated outputs ───────────────────────────────────────────────
  const { data: outputs, error: outputsError } = await admin
    .from('generated_outputs')
    .select('section_order, section_title, content')
    .eq('session_id', sessionId)
    .order('section_order', { ascending: true })

  if (outputsError || !outputs || outputs.length === 0) {
    return jsonError('GENERATION_FAILED', 'No generated content found for this session', 500)
  }

  // ── Render PDF ────────────────────────────────────────────────────────────
  try {
    const doc = buildPdfDocument({
      speakerName: session.speaker_name,
      sections: outputs,
      generatedAt: session.completed_at ?? new Date().toISOString(),
    })

    const rawBuffer = await renderToBuffer(doc)
    const filename = `${safeFilename(session.speaker_name)}_briefing.pdf`

    return new Response(new Uint8Array(rawBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'PDF generation failed'
    console.error('[export/pdf] render error:', msg)
    return jsonError('GENERATION_FAILED', 'Failed to generate PDF', 500)
  }
}
