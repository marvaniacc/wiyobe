import { GoogleGenerativeAI } from '@google/generative-ai'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
// Prevent client-side caching of AI responses
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
 * Accepts a `symptoms` string, sends it to Google Gemini with a strict
 * medical triage system prompt, and returns the AI's recommendation
 * (specialty, reasoning, suggested countries).
 *
 * The API key is accessed server-side only via process.env.GOOGLE_GEMINI_API_KEY.
 * It is NEVER exposed to the client.
 *
 * Authorization: any authenticated user (patients primarily).
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const { symptoms } = await parseBody(req, triageSchema)

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY
    if (!apiKey) {
      console.error('[ai/triage] GOOGLE_GEMINI_API_KEY not configured')
      return error(503, 'AI service is not configured. Please contact support.')
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    })

    let aiResponse: string
    try {
      const result = await model.generateContent(
        `Patient symptoms: "${symptoms}"\n\nBased on these symptoms, suggest the appropriate medical specialty, your reasoning, and suggested countries for medical tourism. Respond in JSON format only.`
      )
      aiResponse = result.response.text()
    } catch (geminiErr: any) {
      console.error('[ai/triage] Gemini API error:', geminiErr)
      return error(502, 'The AI service is temporarily unavailable. Please try again in a moment.')
    }

    // Parse the JSON response — Gemini may wrap it in markdown code fences
    let parsed: { specialty: string; reasoning: string; suggestedCountries: string[] }

    try {
      // Strip markdown code fences if present
      let cleaned = aiResponse.trim()
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }
      parsed = JSON.parse(cleaned)
    } catch (parseErr) {
      console.error('[ai/triage] Failed to parse Gemini response as JSON:', aiResponse)
      // Fallback: try to extract JSON from the response using regex
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch {
          return error(502, 'The AI returned an unexpected response format. Please try rephrasing your symptoms.')
        }
      } else {
        return error(502, 'The AI returned an unexpected response format. Please try rephrasing your symptoms.')
      }
    }

    // Validate the parsed response has the expected fields
    if (!parsed.specialty || typeof parsed.specialty !== 'string') {
      return error(502, 'The AI response was incomplete. Please try again.')
    }

    // Ensure suggestedCountries is an array of strings
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
