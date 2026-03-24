import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  convertInchesToTwip,
} from 'docx'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonError } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 30

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_') || 'briefing'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

// ─── DOCX builder ─────────────────────────────────────────────────────────────

interface Section {
  section_order: number
  section_title: string
  content: string
}

function buildDocx(speakerName: string, sections: Section[], generatedAt: string): Document {
  const generatedDateLabel = `Generated ${formatDate(generatedAt)}`

  const children: Paragraph[] = [
    // Document title
    new Paragraph({
      children: [
        new TextRun({
          text: 'SPEAKER BRIEFING DOCUMENT',
          bold: true,
          size: 11 * 2, // half-points
          color: '542785',
          allCaps: true,
          characterSpacing: 40,
        }),
      ],
      spacing: { after: 120 },
    }),

    // Speaker name (H1 style)
    new Paragraph({
      children: [
        new TextRun({
          text: speakerName,
          bold: true,
          size: 32 * 2,
          color: '111111',
        }),
      ],
      spacing: { after: 80 },
    }),

    // Subtitle
    new Paragraph({
      children: [
        new TextRun({
          text: 'Prepared for Faculty Use',
          size: 13 * 2,
          color: '555555',
          italics: true,
        }),
      ],
      spacing: { after: 200 },
    }),

    // Generated date
    new Paragraph({
      children: [
        new TextRun({
          text: generatedDateLabel,
          size: 9 * 2,
          color: '888888',
        }),
      ],
      spacing: { after: 400 },
    }),

    // Horizontal rule (via border bottom paragraph)
    new Paragraph({
      children: [],
      border: {
        bottom: { color: '0f6b37', space: 1, style: BorderStyle.SINGLE, size: 12 },
      },
      spacing: { after: 400 },
    }),
  ]

  // Sections
  for (const section of sections) {
    // Section number + title (Heading 2)
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({
            text: `${String(section.section_order).padStart(2, '0')}  ${section.section_title}`,
            bold: true,
            size: 13 * 2,
            color: '111111',
          }),
        ],
        spacing: { before: 320, after: 120 },
        shading: {
          type: ShadingType.SOLID,
          color: 'faf9f6',
          fill: 'faf9f6',
        },
        indent: { left: convertInchesToTwip(0.1) },
        border: {
          left: { color: 'f36f21', space: 6, style: BorderStyle.SINGLE, size: 18 },
        },
      })
    )

    // Content paragraphs — split on double newlines
    const blocks = section.content.split(/\n\n+/).filter(Boolean)
    for (const block of blocks) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.trim(),
              size: 10 * 2,
              color: '333333',
            }),
          ],
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 120 },
          indent: { left: convertInchesToTwip(0.2) },
        })
      )
    }

    // Divider after each section (except last)
    if (section.section_order < sections.length) {
      children.push(
        new Paragraph({
          children: [],
          border: {
            bottom: { color: 'eeeeee', space: 1, style: BorderStyle.SINGLE, size: 4 },
          },
          spacing: { before: 200, after: 200 },
        })
      )
    }
  }

  return new Document({
    creator: 'Drennen MGMT 305',
    title: `${speakerName} — Speaker Briefing`,
    description: `Speaker briefing document for ${speakerName}. ${generatedDateLabel}.`,
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 10 * 2,
            color: '1a1a1a',
          },
          paragraph: {
            spacing: { line: 276 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.1),
              right: convertInchesToTwip(1.1),
            },
          },
        },
        children,
      },
    ],
  })
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

  // ── Build DOCX ────────────────────────────────────────────────────────────
  try {
    const doc = buildDocx(
      session.speaker_name,
      outputs,
      session.completed_at ?? new Date().toISOString(),
    )

    const rawBuffer = await Packer.toBuffer(doc)
    const filename = `${safeFilename(session.speaker_name)}_briefing.docx`

    return new Response(new Uint8Array(rawBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'DOCX generation failed'
    console.error('[export/docx] render error:', msg)
    return jsonError('GENERATION_FAILED', 'Failed to generate DOCX', 500)
  }
}
