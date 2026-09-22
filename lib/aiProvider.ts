// Lets the app switch between AI providers with a single env var.
//
// Supported providers:
//   AI_PROVIDER=gemini
//   AI_PROVIDER=anthropic
//   AI_PROVIDER=openai
//
// Gemini and Anthropic are kept intact as fallbacks.
// OpenAI uses the Responses API with explicit prompt caching.

const PROVIDER = process.env.AI_PROVIDER || 'gemini';

export async function generateWithAI(system: string, user: string): Promise<string> {
  if (PROVIDER === 'openai') {
    return generateWithOpenAI(system, user);
  }

  if (PROVIDER === 'anthropic') {
    return generateWithAnthropic(system, user);
  }

  return generateWithGemini(system, user);
}

// -----------------------------------------------------------------------------
// Gemini
// -----------------------------------------------------------------------------

async function generateWithGemini(system: string, user: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is missing — get a free key at aistudio.google.com/apikey'
    );
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
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
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

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text)
      .join('') || '';

  if (!text) {
    console.error(
      'Gemini returned empty text. Full response:',
      JSON.stringify(data)
    );
  }

  return text;
}

// -----------------------------------------------------------------------------
// Anthropic
// -----------------------------------------------------------------------------

async function generateWithAnthropic(
  system: string,
  user: string
): Promise<string> {
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

  return (
    data.content?.find((c: any) => c.type === 'text')?.text || ''
  );
}

// -----------------------------------------------------------------------------
// OpenAI
// -----------------------------------------------------------------------------

async function generateWithOpenAI(
  system: string,
  user: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-5.6-terra';

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,

      input: [
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text: system,
              prompt_cache_breakpoint: {
                mode: 'explicit',
              },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: user,
            },
          ],
        },
      ],

      reasoning: {
        effort: 'medium',
      },

      text: {
        format: {
          type: 'json_object',
        },
      },

      prompt_cache_options: {
        mode: 'explicit',
        ttl: '30m',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('OpenAI API error:', errText);
    throw new Error('Question generation failed (OpenAI)');
  }

  const data = await res.json();

  if (data.output_text) {
    console.log('OpenAI generation usage:', {
      inputTokens: data.usage?.input_tokens,
      cachedTokens: data.usage?.input_tokens_details?.cached_tokens,
      cacheWriteTokens: data.usage?.input_tokens_details?.cache_write_tokens,
    });

    return data.output_text;
  }

  const text =
    data.output
      ?.filter((item: any) => item.type === 'message')
      ?.flatMap((item: any) => item.content || [])
      ?.filter((content: any) => content.type === 'output_text')
      ?.map((content: any) => content.text)
      ?.join('') || '';

  if (!text) {
    console.error(
      'OpenAI returned empty text. Full response:',
      JSON.stringify(data)
    );
  }

  return text;
}

// -----------------------------------------------------------------------------
// Chat types
// -----------------------------------------------------------------------------

export interface ChatAttachment {
  mimeType: string;
  base64: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  attachment?: ChatAttachment;
}

// -----------------------------------------------------------------------------
// Chat provider switch
// -----------------------------------------------------------------------------

export async function chatWithAI(
  system: string,
  history: ChatTurn[]
): Promise<string> {
  if (PROVIDER === 'openai') {
    return chatWithOpenAI(system, history);
  }

  if (PROVIDER === 'anthropic') {
    return chatWithAnthropic(system, history);
  }

  return chatWithGemini(system, history);
}

// -----------------------------------------------------------------------------
// Gemini Chat
// -----------------------------------------------------------------------------

async function chatWithGemini(
  system: string,
  history: ChatTurn[]
): Promise<string> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is missing — get a free key at aistudio.google.com/apikey'
    );
  }

  const contents = history.map((turn) => {
    const parts: any[] = [];

    if (turn.attachment) {
      parts.push({
        inline_data: {
          mime_type: turn.attachment.mimeType,
          data: turn.attachment.base64,
        },
      });
    }

    parts.push({ text: turn.content });

    return {
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts,
    };
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

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text)
      .join('') || '';

  return (
    text ||
    "Sorry, I couldn't come up with a reply to that — try rephrasing your question."
  );
}

// -----------------------------------------------------------------------------
// Anthropic Chat
// -----------------------------------------------------------------------------

async function chatWithAnthropic(
  system: string,
  history: ChatTurn[]
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is missing');
  }

  const messages = history.map((turn) => {
    if (!turn.attachment) {
      return {
        role: turn.role,
        content: turn.content,
      };
    }

    const blockType =
      turn.attachment.mimeType === 'application/pdf'
        ? 'document'
        : 'image';

    return {
      role: turn.role,
      content: [
        {
          type: blockType,
          source: {
            type: 'base64',
            media_type: turn.attachment.mimeType,
            data: turn.attachment.base64,
          },
        },
        {
          type: 'text',
          text: turn.content,
        },
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

  return (
    data.content?.find((c: any) => c.type === 'text')?.text || ''
  );
}

// -----------------------------------------------------------------------------
// OpenAI Chat
// -----------------------------------------------------------------------------

async function chatWithOpenAI(
  system: string,
  history: ChatTurn[]
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-5.6-terra';

  const input = [
    {
      role: 'developer',
      content: [
        {
          type: 'input_text',
          text: system,
          prompt_cache_breakpoint: {
            mode: 'explicit',
          },
        },
      ],
    },
    ...history.map((turn) => {
      const content: any[] = [];

      if (turn.attachment) {
        const mimeType = turn.attachment.mimeType;

        if (mimeType === 'application/pdf') {
          content.push({
            type: 'input_file',
            filename: 'study-material.pdf',
            file_data: `data:${mimeType};base64,${turn.attachment.base64}`,
            detail: 'auto',
          });
        } else if (mimeType.startsWith('image/')) {
          content.push({
            type: 'input_image',
            image_url: `data:${mimeType};base64,${turn.attachment.base64}`,
            detail: 'auto',
          });
        }
      }

      content.push({
        type: 'input_text',
        text: turn.content,
      });

      return {
        role: turn.role,
        content,
      };
    }),
  ];

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input,

      reasoning: {
        effort: 'medium',
      },

      prompt_cache_options: {
        mode: 'explicit',
        ttl: '30m',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('OpenAI chat API error:', errText);
    throw new Error('Chat reply failed (OpenAI)');
  }

  const data = await res.json();

  console.log('OpenAI chat usage:', {
    inputTokens: data.usage?.input_tokens,
    cachedTokens: data.usage?.input_tokens_details?.cached_tokens,
    cacheWriteTokens:
      data.usage?.input_tokens_details?.cache_write_tokens,
  });

  if (data.output_text) {
    return data.output_text;
  }

  const text =
    data.output
      ?.filter((item: any) => item.type === 'message')
      ?.flatMap((item: any) => item.content || [])
      ?.filter((content: any) => content.type === 'output_text')
      ?.map((content: any) => content.text)
      ?.join('') || '';

  return (
    text ||
    "Sorry, I couldn't come up with a reply to that — try rephrasing your question."
  );
}