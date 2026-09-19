'use client';

import { Suspense, use, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser, getAuthHeader } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  failed?: {
    error: string;
    requestId: string;
    attachment: PendingAttachment | null;
  };
}

interface MaterialInfo {
  id: string;
  title: string;
  course_code: string | null;
}

interface PendingAttachment {
  file: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

/**
 * Removes Markdown formatting only when preparing text for speech.
 * Assistant messages displayed in the UI keep their original Markdown.
 */
function cleanTextForSpeech(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

export default function ChatPage({ params }: { params: Promise<{ materialId: string }> }) {
  const { materialId } = use(params);

  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
          <p className="text-slate">Loading chat…</p>
        </main>
      }
    >
      <ChatContent materialId={materialId} />
    </Suspense>
  );
}

function ChatContent({ materialId }: { materialId: string }) {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isGeneral = materialId === 'general';
  const autoAsk = searchParams.get('autoAsk');

  const [material, setMaterial] = useState<MaterialInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const autoAskFiredRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  useEffect(() => {
    if (!user) return;

    (async () => {
      if (!isGeneral) {
        const { data: materialData } = await supabase
          .from('materials')
          .select('id, title, course_code')
          .eq('id', materialId)
          .single();

        setMaterial(materialData);
      }

      let query = supabase
        .from('chat_messages')
        .select('id, role, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      query = isGeneral
        ? query.is('material_id', null)
        : query.eq('material_id', materialId);

      const { data: messageData } = await query;

      // IMPORTANT:
      // Do not clean Markdown here.
      // The UI now renders the original Markdown properly.
      setMessages((messageData || []).map((m) => ({ ...m })));

      setLoading(false);
    })();
  }, [user, materialId, isGeneral]);

  useEffect(() => {
    if (!shouldAutoScroll) return;

    const frame = window.requestAnimationFrame(() => {
      endOfMessagesRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, sending, shouldAutoScroll]);

  function handleChatScroll() {
    const container = scrollRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight -
      container.scrollTop -
      container.clientHeight;

    setShouldAutoScroll(distanceFromBottom < 96);
  }

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    setSpeechSupported(!!SpeechRecognition);

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Automatically ask a question when arriving from a study-plan link.
  useEffect(() => {
    if (!loading && autoAsk && !autoAskFiredRef.current) {
      autoAskFiredRef.current = true;
      sendMessage(autoAsk);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, autoAsk]);

  function toggleVoiceInput() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;

      setInput((prev) =>
        prev ? `${prev} ${transcript}` : transcript
      );
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function speak(text: string, messageId: string) {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(
      cleanTextForSpeech(text)
    );

    utterance.rate = 1;

    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    setSpeakingId(messageId);

    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel();
    setSpeakingId(null);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];

      setAttachment({
        file,
        previewUrl: file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : '',
        base64,
        mimeType: file.type,
      });
    };

    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function sendMessage(
    messageText: string,
    withAttachment: PendingAttachment | null = null,
    retry?: { localId: string; requestId: string }
  ) {
    const trimmed = messageText.trim();

    if ((!trimmed && !withAttachment) || sending) return;

    const requestId = retry?.requestId || crypto.randomUUID();
    const localId = retry?.localId || `local-${Date.now()}`;

    setShouldAutoScroll(true);
    setSending(true);

    const optimisticMsg: Message = {
      id: localId,
      role: 'user',
      content:
        trimmed || (withAttachment ? '📎 (attached file)' : ''),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) =>
      retry
        ? prev.map((chatMessage) =>
            chatMessage.id === localId
              ? { ...chatMessage, failed: undefined }
              : chatMessage
          )
        : [...prev, optimisticMsg]
    );

    try {
      const authHeader = await getAuthHeader();

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({
          materialId: isGeneral ? 'general' : materialId,
          message: trimmed,
          requestId,
          attachment: withAttachment
            ? {
                mimeType: withAttachment.mimeType,
                base64: withAttachment.base64,
              }
            : undefined,
        }),
      });

      const data = await res.json();

      if (res.status === 402) {
        router.push('/pricing?reason=chat_limit_reached');
        return;
      }

      if (!res.ok) {
        throw new Error(
          data.error ||
            'Could not get a reply. Check your connection and try again.'
        );
      }

      const replyId = `local-reply-${Date.now()}`;

      // IMPORTANT:
      // Keep the original Markdown response.
      // ReactMarkdown handles the visual formatting below.
      const replyText = data.reply;

      setMessages((prev) => [
        ...prev.map((chatMessage) =>
          chatMessage.id === localId
            ? { ...chatMessage, failed: undefined }
            : chatMessage
        ),
        {
          id: replyId,
          role: 'assistant',
          content: replyText,
          created_at: new Date().toISOString(),
        },
      ]);

      if (autoSpeak) {
        speak(replyText, replyId);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Network error. Check your connection and try again.';

      setMessages((prev) =>
        prev.map((chatMessage) =>
          chatMessage.id === localId
            ? {
                ...chatMessage,
                failed: {
                  error: errorMessage,
                  requestId,
                  attachment: withAttachment,
                },
              }
            : chatMessage
        )
      );
    } finally {
      setSending(false);
    }
  }

  function retryMessage(message: Message) {
    if (!message.failed) return;

    void sendMessage(
      message.content,
      message.failed.attachment,
      {
        localId: message.id,
        requestId: message.failed.requestId,
      }
    );
  }

  function editFailedMessage(message: Message) {
    if (!message.failed || sending) return;

    setInput(message.content);
    setAttachment(message.failed.attachment);

    setMessages((prev) =>
      prev.filter((chatMessage) => chatMessage.id !== message.id)
    );

    setShouldAutoScroll(true);
  }

  async function handleSend() {
    const trimmed = input.trim();

    if (!trimmed && !attachment) return;

    const attachmentToSend = attachment;

    setInput('');
    setAttachment(null);

    await sendMessage(trimmed, attachmentToSend);
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <p className="text-slate">Loading chat…</p>
      </main>
    );
  }

  return (
    <main className="h-dvh bg-ink text-paper flex flex-col">
      <AppNav />

      <header className="flex items-center justify-between px-4 sm:px-6 md:px-12 py-3 sm:py-4 border-b border-white/10">
        <div className="min-w-0">
          <p className="font-semibold text-sm sm:text-base truncate">
            {isGeneral
              ? '🎓 General Study Tutor'
              : `💬 Chat about: ${material?.title || 'your material'}`}
          </p>

          {material?.course_code && (
            <p className="text-slate text-xs">
              {material.course_code}
            </p>
          )}
        </div>

        <button
          onClick={() => setAutoSpeak((v) => !v)}
          className={`text-xs px-3 py-1.5 rounded-full border shrink-0 transition ${
            autoSpeak
              ? 'border-gold text-gold'
              : 'border-white/10 text-slate'
          }`}
          title="Read replies aloud"
        >
          🔊 {autoSpeak ? 'On' : 'Off'}
        </button>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleChatScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 md:px-12 py-6 max-w-2xl mx-auto w-full"
      >
        {messages.length === 0 && (
          <div className="text-center text-slate text-sm py-16">
            {isGeneral
              ? 'Ask me about any topic or course — or attach a photo of a textbook page or your handwritten notes.'
              : 'Ask anything about this material — "explain this in simpler terms," "give me an example of X."'}
          </div>
        )}

        <div className="space-y-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${
                m.role === 'user'
                  ? 'justify-end'
                  : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[90%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  m.role === 'user'
                    ? 'bg-gold text-ink'
                    : 'bg-inkLight border border-white/10 text-paper'
                }`}
              >
                {m.role === 'assistant' ? (
                  <div className="break-words">
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => (
                          <h1 className="text-lg font-bold leading-tight mt-5 mb-3 first:mt-0">
                            {children}
                          </h1>
                        ),

                        h2: ({ children }) => (
                          <h2 className="text-base font-bold leading-tight mt-5 mb-2 first:mt-0">
                            {children}
                          </h2>
                        ),

                        h3: ({ children }) => (
                          <h3 className="text-sm font-bold mt-4 mb-2 first:mt-0">
                            {children}
                          </h3>
                        ),

                        p: ({ children }) => (
                          <p className="leading-7 mb-3 last:mb-0">
                            {children}
                          </p>
                        ),

                        ul: ({ children }) => (
                          <ul className="list-disc pl-5 space-y-1.5 mb-3">
                            {children}
                          </ul>
                        ),

                        ol: ({ children }) => (
                          <ol className="list-decimal pl-5 space-y-1.5 mb-3">
                            {children}
                          </ol>
                        ),

                        li: ({ children }) => (
                          <li className="leading-6 pl-1">
                            {children}
                          </li>
                        ),

                        strong: ({ children }) => (
                          <strong className="font-bold text-paper">
                            {children}
                          </strong>
                        ),

                        em: ({ children }) => (
                          <em className="italic">
                            {children}
                          </em>
                        ),

                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-gold/60 pl-4 py-1 my-4 text-slate italic">
                            {children}
                          </blockquote>
                        ),

                        code: ({ children }) => (
                          <code className="rounded-md bg-black/30 px-1.5 py-0.5 text-xs font-mono">
                            {children}
                          </code>
                        ),

                        pre: ({ children }) => (
                          <pre className="overflow-x-auto rounded-xl bg-black/30 border border-white/10 p-3 my-4 text-xs leading-6 font-mono">
                            {children}
                          </pre>
                        ),

                        hr: () => (
                          <hr className="border-white/10 my-5" />
                        ),

                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gold underline underline-offset-2 hover:brightness-125"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                 <div className="whitespace-pre-wrap break-words leading-7">
                    {m.content}
                  </div>
                )}

                {m.failed && (
                  <div className="mt-3 pt-3 border-t border-ink/20 text-xs">
                    <p className="font-medium">
                      {m.failed.error}
                    </p>

                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => retryMessage(m)}
                        disabled={sending}
                        className="underline font-semibold disabled:opacity-50"
                      >
                        Retry
                      </button>

                      <button
                        onClick={() => editFailedMessage(m)}
                        disabled={sending}
                        className="underline disabled:opacity-50"
                      >
                        Edit message
                      </button>
                    </div>
                  </div>
                )}

                {m.role === 'assistant' && (
                  <button
                    onClick={() =>
                      speakingId === m.id
                        ? stopSpeaking()
                        : speak(m.content, m.id)
                    }
                    className="block mt-3 text-xs text-slate hover:text-gold transition"
                  >
                    {speakingId === m.id
                      ? '⏹ Stop'
                      : '🔊 Listen'}
                  </button>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-inkLight border border-white/10 rounded-2xl px-4 py-3 text-sm text-slate">
                Thinking…
              </div>
            </div>
          )}

          <div ref={endOfMessagesRef} />
        </div>
      </div>

      <footer className="px-4 sm:px-6 md:px-12 py-4 border-t border-white/10">
        {attachment && (
          <div className="max-w-2xl mx-auto mb-2 flex items-center gap-3 bg-inkLight border border-white/10 rounded-xl px-3 py-2">
            {attachment.previewUrl ? (
              <img
                src={attachment.previewUrl}
                alt="attachment preview"
                className="w-10 h-10 object-cover rounded"
              />
            ) : (
              <span className="text-lg">📄</span>
            )}

            <span className="text-xs text-slate truncate flex-1">
              {attachment.file.name}
            </span>

            <button
              onClick={() => setAttachment(null)}
              className="text-stamp text-xs"
            >
              Remove
            </button>
          </div>
        )}

        <div className="max-w-2xl mx-auto flex items-end gap-2 sm:gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileSelect}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-full border border-white/10 hover:border-gold/40 transition text-lg"
            title="Attach a photo or file"
          >
            📎
          </button>

          {speechSupported && (
            <button
              onClick={toggleVoiceInput}
              className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-full border transition text-lg ${
                isRecording
                  ? 'border-stamp bg-stamp/20 animate-pulse'
                  : 'border-white/10 hover:border-gold/40'
              }`}
              title="Speak your question"
            >
              🎤
            </button>
          )}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              isRecording
                ? 'Listening…'
                : 'Ask a question…'
            }
            className="flex-1 bg-inkLight border border-white/10 rounded-xl px-4 py-3 text-base focus:border-gold outline-none resize-none max-h-32"
          />

          <button
            onClick={handleSend}
            disabled={
              sending ||
              (!input.trim() && !attachment)
            }
            className="bg-gold text-ink font-semibold px-4 sm:px-5 py-3 rounded-full hover:brightness-110 transition disabled:opacity-50 shrink-0"
          >
            Send
          </button>
        </div>

        {!speechSupported && (
          <p className="max-w-2xl mx-auto text-slate text-[11px] mt-2">
            Voice input isn't supported in this browser — try Chrome on Android for the mic feature.
          </p>
        )}
      </footer>
    </main>
  );
}