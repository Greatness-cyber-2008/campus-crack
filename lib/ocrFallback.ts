// Fallback text extraction for scanned/image-only PDFs.
// pdf-parse only reads embedded text layers — a scanned lecture note (photographed
// pages saved as PDF) has no text layer at all, so pdf-parse returns almost nothing.
// Rather than standing up a separate OCR pipeline (Tesseract needs native binaries
// that are awkward on Vercel's serverless functions), we hand the raw PDF bytes to
// an AI provider directly — both Claude and Gemini can read PDF pages as images
// natively and transcribe them, which is effectively OCR with no extra infrastructure.
//
// Uses the same AI_PROVIDER env var as lib/aiProvider.ts, so Gemini (free) and
// Claude (paid) both work without touching the calling code.

const PROVIDER = process.env.AI_PROVIDER || 'gemini';

export async function extractViaAIVision(pdfBuffer: Buffer): Promise<string> {
  if (PROVIDER === 'anthropic') {
    return extractViaClaudeVision(pdfBuffer);
  }
  return extractViaGeminiVision(pdfBuffer);
}

const TRANSCRIBE_PROMPT =
  'Transcribe every word of readable text from this document, page by page, exactly as written. Do not summarize, explain, or comment — output only the raw transcribed text. If a page is blank or illegible, skip it silently.';

async function extractViaGeminiVision(pdfBuffer: Buffer): Promise<string> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing — get a free key at aistudio.google.com/apikey');
  }
  const base64Pdf = pdfBuffer.toString('base64');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: base64Pdf } },
              { text: TRANSCRIBE_PROMPT },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 16000, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error('Gemini vision extraction error:', errText);
    throw new Error('OCR fallback failed (Gemini)');
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
  return text.trim();
}

async function extractViaClaudeVision(pdfBuffer: Buffer): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is missing');
  }
  const base64Pdf = pdfBuffer.toString('base64');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
            },
            { type: 'text', text: TRANSCRIBE_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Claude vision extraction error:', errText);
    throw new Error('OCR fallback failed (Anthropic)');
  }

  const data = await response.json();
  const text = data.content?.find((c: any) => c.type === 'text')?.text || '';
  return text.trim();
}
