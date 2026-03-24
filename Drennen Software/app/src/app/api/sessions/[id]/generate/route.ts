import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonError, SectionKey } from '@/lib/types'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 60

// Section keys in the order the system prompt produces them
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

const SECTION_TITLES: Record<SectionKey, string> = {
  executive_summary: 'Executive Summary',
  speaker_biography: 'Speaker Biography',
  key_accomplishments: 'Key Accomplishments & Credentials',
  core_messages: 'Core Messages & Themes',
  areas_of_expertise: 'Areas of Expertise',
  speaking_style: 'Speaking Style & Presentation Approach',
  audience_considerations: 'Audience Considerations',
  qa_preparation: 'Q&A Preparation Points',
  logistical_notes: 'Logistical Notes & Requirements',
  online_presence: 'Social Media & Online Presence',
}

const SECTION_HEADER_PATTERN = /^SECTION \d+:\s+(.+)$/m

const SYSTEM_PROMPT_TEMPLATE = `You are an expert research assistant for university faculty. Your job is to read uploaded
documents about a speaker and produce a professional, structured Speaker Briefing Document.

The briefing will be used by a university professor to prepare for an event featuring this
speaker. Write for an academic professional audience. Be factual, concise, and grounded
entirely in the provided source materials.

SPEAKER NAME: {{SPEAKER_NAME}}

OUTPUT FORMAT:
Produce exactly 10 sections in the following order. Use the exact section headers shown
below. Write in clear, professional prose. Do not add extra sections or omit any section.

---

SECTION 1: EXECUTIVE SUMMARY
A 2-3 paragraph high-level summary of who {{SPEAKER_NAME}} is, why they are notable, and
what value they bring to a university audience. Write this as if the professor has never
heard of this person.

---

SECTION 2: SPEAKER BIOGRAPHY
A comprehensive narrative biography of {{SPEAKER_NAME}}. Cover educational background,
career trajectory, current role/affiliation, and notable life events relevant to their
professional story. Write in third person.

---

SECTION 3: KEY ACCOMPLISHMENTS & CREDENTIALS
A bulleted list of {{SPEAKER_NAME}}'s most significant professional accomplishments,
awards, publications, patents, companies founded, positions held, or other credentials.
Each bullet should be specific and verifiable from the source documents.

---

SECTION 4: CORE MESSAGES & THEMES
Identify and explain the 3-5 central ideas or messages that {{SPEAKER_NAME}} consistently
communicates. For each theme, write 2-3 sentences explaining what it is and why it matters.

---

SECTION 5: AREAS OF EXPERTISE
A structured list of {{SPEAKER_NAME}}'s domain expertise areas. For each area, provide one
sentence explaining the depth or nature of the expertise (practitioner, researcher, thought
leader). Include both technical and non-technical areas as evidenced in the source documents.

---

SECTION 6: SPEAKING STYLE & PRESENTATION APPROACH
Describe how {{SPEAKER_NAME}} typically presents to audiences. Include: tone
(formal/conversational), use of stories or data, audience interaction style, length of
typical talks, and any notable characteristics of their delivery. Base this on any
available recordings, reviews, or descriptions in the source materials.

---

SECTION 7: AUDIENCE CONSIDERATIONS
Identify which types of audiences {{SPEAKER_NAME}} resonates with most. Note any topics or
themes that may be controversial, sensitive, or require context-setting for an academic
audience. Include any known audience feedback or reception patterns.

---

SECTION 8: Q&A PREPARATION POINTS
Provide 5-7 specific questions a professor might ask {{SPEAKER_NAME}} during a Q&A session.
Each question should be intellectually substantive, directly tied to {{SPEAKER_NAME}}'s
work, and appropriate for a university setting. For each question, include one sentence
explaining why it is worth asking.

---

SECTION 9: LOGISTICAL NOTES & REQUIREMENTS
Summarize any known logistical requirements, preferences, or constraints for
{{SPEAKER_NAME}} based on the source documents. Include: typical talk duration, AV
requirements, travel/accommodation notes, content restrictions, or other practical
considerations for event organizers.

---

SECTION 10: SOCIAL MEDIA & ONLINE PRESENCE
List {{SPEAKER_NAME}}'s active social media profiles, website, podcast, newsletter, or
other online presence found in the source documents. For each, note the platform,
handle/URL, and a one-sentence description of the content shared there.

---

GUARDRAILS:
- Base every claim strictly on the provided source documents. Do not invent, extrapolate,
  or hallucinate facts.
- If a section cannot be completed due to insufficient source material, write:
  "[Insufficient source data for this section. Additional materials recommended.]"
- Do not include personal opinions, recommendations, or endorsements.
- Do not reproduce large verbatim passages from source documents — synthesize and
  paraphrase.
- If source documents contain conflicting information, note the discrepancy briefly and
  present the most recent or reliable version.
- Do not discuss or editorialize about the quality of the source documents themselves.`

function buildUserMessage(speakerName: string, files: Array<{ filename: string; file_type: string; char_count: number | null; extracted_text: string | null }>): string {
  const MAX_TOTAL_CHARS = 120_000
  const MAX_FILE_CHARS = 15_000

  let totalChars = 0
  const fileBlocks: Array<{ filename: string; file_type: string; char_count: number | null; text: string }> = []

  for (const file of files) {
    let text = file.extracted_text ?? ''
    if (text.length > MAX_FILE_CHARS) {
      text = text.slice(0, MAX_FILE_CHARS)
    }
    totalChars += text.length
    fileBlocks.push({ filename: file.filename, file_type: file.file_type, char_count: file.char_count, text })
  }

  // If still over budget, truncate proportionally
  if (totalChars > MAX_TOTAL_CHARS) {
    const ratio = MAX_TOTAL_CHARS / totalChars
    for (const block of fileBlocks) {
      block.text = block.text.slice(0, Math.floor(block.text.length * ratio))
    }
    console.warn(`[generate] Total chars exceeded ${MAX_TOTAL_CHARS}, truncated proportionally (ratio: ${ratio.toFixed(2)})`)
  }

  const docs = fileBlocks
    .map((b, i) => `--- DOCUMENT ${i + 1}: ${b.filename} (${b.file_type}, ${b.char_count ?? b.text.length} characters) ---\n${b.text}`)
    .join('\n\n')

  return `SOURCE DOCUMENTS FOR ${speakerName}\nTotal documents: ${fileBlocks.length}\n\n${docs}\n\nPlease generate the complete 10-section Speaker Briefing Document for ${speakerName} based on the source documents above.`
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  // Fetch session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status, speaker_name')
    .eq('id', sessionId)
    .eq('professor_id', user.id)
    .single()

  if (sessionError || !session) {
    return jsonError('NOT_FOUND', 'Session not found', 404)
  }

  if (session.status !== 'pending') {
    return jsonError('WRONG_STATUS', `Session status is '${session.status}', expected 'pending'`, 409)
  }

  // Fetch extracted files
  const { data: files, error: filesError } = await supabase
    .from('uploaded_files')
    .select('filename, file_type, char_count, extracted_text')
    .eq('session_id', sessionId)
    .eq('extraction_status', 'completed')
    .order('filename', { ascending: true })

  if (filesError) {
    return jsonError('DB_ERROR', filesError.message, 500)
  }

  if (!files || files.length === 0) {
    return jsonError('NO_CONTENT', 'No extracted files found for this session', 422)
  }

  // Set status = generating
  const admin = createAdminClient()
  await admin.from('sessions').update({ status: 'generating' }).eq('id', sessionId)

  const professorId = user.id
  const speakerName = session.speaker_name
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replaceAll('{{SPEAKER_NAME}}', speakerName)
  const userMessage = buildUserMessage(speakerName, files)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const client = new OpenAI({
          baseURL: 'https://api.x.ai/v1',
          apiKey: process.env.XAI_API_KEY!,
        })

        const grokStream = await client.chat.completions.create({
          model: 'grok-4-1-fast-reasoning',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 4096,
          temperature: 0.3,
          stream: true,
        })

        let buffer = ''
        let currentSectionIndex = -1
        let currentSectionContent = ''
        let inputTokens = 0
        let outputTokens = 0

        async function flushSection() {
          if (currentSectionIndex < 0 || !currentSectionContent.trim()) return
          const sectionKey = SECTION_KEYS[currentSectionIndex]
          const sectionTitle = SECTION_TITLES[sectionKey]
          const sectionOrder = currentSectionIndex + 1

          // Insert into generated_outputs
          await admin.from('generated_outputs').insert({
            session_id: sessionId,
            professor_id: professorId,
            section_order: sectionOrder,
            section_key: sectionKey,
            section_title: sectionTitle,
            content: currentSectionContent.trim(),
          })

          sendEvent('section', {
            section_key: sectionKey,
            section_title: sectionTitle,
            section_order: sectionOrder,
            content: currentSectionContent.trim(),
          })
        }

        for await (const chunk of grokStream) {
          const delta = chunk.choices[0]?.delta?.content ?? ''
          buffer += delta

          // Check for usage in final chunk
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? 0
            outputTokens = chunk.usage.completion_tokens ?? 0
          }

          // Scan buffer for section headers
          const lines = buffer.split('\n')
          // Keep last potentially incomplete line in buffer
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const headerMatch = SECTION_HEADER_PATTERN.exec(line)
            if (headerMatch) {
              // Flush previous section
              await flushSection()
              currentSectionIndex++
              currentSectionContent = ''
            } else {
              currentSectionContent += line + '\n'
            }
          }
        }

        // Flush remaining buffer
        if (buffer) {
          currentSectionContent += buffer
        }
        await flushSection()

        // Update session: completed
        await admin.from('sessions').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          input_token_count: inputTokens,
          output_token_count: outputTokens,
        }).eq('id', sessionId)

        sendEvent('complete', {
          session_id: sessionId,
          total_sections: SECTION_KEYS.length,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        await admin.from('sessions').update({
          status: 'failed',
          error_message: msg,
        }).eq('id', sessionId)

        const isTimeout = msg.toLowerCase().includes('timeout')
        sendEvent('error', {
          code: isTimeout ? 'GROK_TIMEOUT' : 'GROK_ERROR',
          message: msg,
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
