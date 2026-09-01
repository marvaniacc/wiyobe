import OpenAI from 'openai'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const triageSchema = z.object({
  symptoms: z.string().min(3).max(2000),
})

const SYSTEM_PROMPT = `You are a medical triage assistant for a medical tourism platform called Wishubest.
Based on the user's described symptoms, identify the most likely medical specialty they should seek (e.g., Cardiology, Orthopedics, Dentistry, Dermatology, Neurology, Oncology, Ophthalmology, ENT, Gastroenterology, Urology, Pediatrics, Psychiatry, Endocrinology, Rheumatology, Pulmonology, Nephrology, Gynecology, Plastic Surgery, General Surgery).

Also suggest 1-3 countries known for quality and affordable care in that specialty (e.g., Turkey, India, Thailand, Germany, UAE, South Korea, Iran, Poland, Mexico, Brazil).

Respond STRICTLY in JSON format with EXACTLY these fields:
{"specialty": string, "reasoning": string, "suggestedCountries": [string]}

Rules:
- Do NOT provide medical diagnoses. Only suggest which specialty to consult.
- Keep reasoning concise (2-3 sentences max).
- Suggested countries should be realistic medical tourism destinations.
- If symptoms are vague, suggest "General Practice" or "Internal Medicine".
- If symptoms suggest an emergency, include "SEEK IMMEDIATE EMERGENCY CARE" in the reasoning field.
- Do NOT include any text outside the JSON object. No markdown, no code fences, no explanations before or after.`

/**
 * POST /api/ai/triage
 *
 * Accepts a `symptoms` string, sends it to the LLM with a strict
 * medical triage system prompt, and returns the AI's recommendation
 * (specialty, reasoning, suggested countries).
 *
 * Uses the OpenAI-compatible AvalAI endpoint (server-side only); the key is
 * read from AVALAI_API_KEY and the model from AVALAI_TRIAGE_MODEL
 * (both set in .env).
 *
 * Authorization: any authenticated user (patients primarily).
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    // Allow both authenticated users AND anonymous visitors (the TriageBot
    // is shown on the public landing page to help new users find the right
    // specialist before they sign up).

    const { symptoms } = await parseBody(req, triageSchema)

    let aiResponse: string
    try {
      const client = new OpenAI({
        apiKey: process.env.AVALAI_API_KEY,
        baseURL: process.env.AVALAI_BASE_URL || 'https://api.avalai.ir/v1',
        timeout: 30_000,
        maxRetries: 1,
      })
      const completion = await client.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Patient symptoms: "${symptoms}"\n\nBased on these symptoms, suggest the appropriate medical specialty, your reasoning, and suggested countries for medical tourism. Respond in JSON format only.` },
        ],
        model: process.env.AVALAI_TRIAGE_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 600,
        stream: false,
      })
      aiResponse = completion.choices[0]?.message?.content || ''
    } catch (aiErr: any) {
      console.error('[ai/triage] AI service error:', aiErr)
      return error(502, 'The AI service is temporarily unavailable. Please try again in a moment.')
    }

    if (!aiResponse || !aiResponse.trim()) {
      return error(502, 'The AI returned an empty response. Please try again.')
    }

    // Parse the JSON response — LLM may wrap it in markdown code fences
    let parsed: { specialty: string; reasoning: string; suggestedCountries: string[] }

    try {
      let cleaned = aiResponse.trim()
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }
      parsed = JSON.parse(cleaned)
    } catch {
      // Fallback: try to extract JSON from the response using regex
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch {
          console.error('[ai/triage] Failed to parse LLM response as JSON:', aiResponse)
          return error(502, 'The AI returned an unexpected response format. Please try rephrasing your symptoms.')
        }
      } else {
        console.error('[ai/triage] No JSON found in LLM response:', aiResponse)
        return error(502, 'The AI returned an unexpected response format. Please try rephrasing your symptoms.')
      }
    }

    if (!parsed.specialty || typeof parsed.specialty !== 'string') {
      return error(502, 'The AI response was incomplete. Please try again.')
    }

    if (!Array.isArray(parsed.suggestedCountries)) {
      parsed.suggestedCountries = parsed.suggestedCountries ? [String(parsed.suggestedCountries)] : []
    }

    return json({
      specialty: parsed.specialty,
      reasoning: parsed.reasoning || '',
      suggestedCountries: parsed.suggestedCountries,
    })
  } catch (e) { return handleError(e) }
}
