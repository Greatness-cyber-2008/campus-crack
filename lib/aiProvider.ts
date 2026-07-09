// Lets the app switch between AI providers with a single env var, so you can
// start on Gemini's free tier (no card required) and move to Anthropic later
// once the app has revenue, without touching any other code.
//
// Set AI_PROVIDER=gemini (default) or AI_PROVIDER=anthropic in your .env.local

const PROVIDER = process.env.AI_PROVIDER || 'gemini';

export async function generateWithAI(system: string, user: string): Promise<string> {
  if (PROVIDER === 'anthropic') {
    return generateWithAnthropic(system, user);
  }
  return generateWithGemini(system, user);
}

async function generateWithGemini(system: string, user: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing — get a free key at aistudio.google.com/apikey');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: 16000,
          responseMimeType: 'application/json', // asks Gemini to return raw JSON, no markdown fences
          thinkingConfig: { thinkingBudget: 0 }, // disable internal "thinking" tokens — they otherwise
          // eat the same token budget as the visible output and can silently truncate long responses
          // (e.g. a 10-question written set with model answers + marking points)
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error('Gemini API error:', errText);
    throw new Error('Question generation failed (Gemini)');
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';

  if (!text) {
    console.error('Gemini returned empty text. Full response:', JSON.stringify(data));
  }

  return text;
}

async function generateWithAnthropic(system: string, user: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is missing');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Anthropic API error:', errText);
    throw new Error('Question generation failed (Anthropic)');
  }

  const data = await res.json();
  return data.content?.find((c: any) => c.type === 'text')?.text || '';
}

// ---- Chat (multi-turn, plain text — not the one-shot JSON generation above) ----

export interface ChatAttachment {
  mimeType: string; // e.g. 'image/jpeg', 'image/png', 'application/pdf'
  base64: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  attachment?: ChatAttachment; // only meaningful on the latest 'user' turn
}

export async function chatWithAI(system: string, history: ChatTurn[]): Promise<string> {
  if (PROVIDER === 'anthropic') {
    return chatWithAnthropic(system, history);
  }
  return chatWithGemini(system, history);
}

async function chatWithGemini(system: string, history: ChatTurn[]): Promise<string> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing — get a free key at aistudio.google.com/apikey');
  }

  // Gemini expects alternating turns with role 'user' | 'model'
  const contents = history.map((turn) => {
    const parts: any[] = [];
    if (turn.attachment) {
      parts.push({ inline_data: { mime_type: turn.attachment.mimeType, data: turn.attachment.base64 } });
    }
    parts.push({ text: turn.content });
    return { role: turn.role === 'assistant' ? 'model' : 'user', parts };
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          maxOutputTokens: 4000,
          thinkingConfig: { thinkingBudget: 0 },
          // no responseMimeType here — chat replies are plain conversational text, not JSON
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error('Gemini chat API error:', errText);
    throw new Error('Chat reply failed (Gemini)');
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
  return text || "Sorry, I couldn't come up with a reply to that — try rephrasing your question.";
}

async function chatWithAnthropic(system: string, history: ChatTurn[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is missing');
  }

  const messages = history.map((turn) => {
    if (!turn.attachment) {
      return { role: turn.role, content: turn.content };
    }
    const blockType = turn.attachment.mimeType === 'application/pdf' ? 'document' : 'image';
    return {
      role: turn.role,
      content: [
        {
          type: blockType,
          source: { type: 'base64', media_type: turn.attachment.mimeType, data: turn.attachment.base64 },
        },
        { type: 'text', text: turn.content },
      ],
    };
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 4000,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Anthropic chat API error:', errText);
    throw new Error('Chat reply failed (Anthropic)');
  }

  const data = await res.json();
  return data.content?.find((c: any) => c.type === 'text')?.text || '';
}
