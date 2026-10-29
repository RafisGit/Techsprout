'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Send,
  Square,
  BookOpen,
  AlertCircle,
  Clock,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { streamTutorChat, TutorChatMessage } from '@/lib/api/tutor';
import { TutorCitationDto } from '@techsprout/contracts';

interface AITutorDrawerProps {
  courseId: string;
  courseSlug: string;
  currentLessonId?: string;
  currentLessonTitle?: string;
}

const STARTER_PROMPTS = [
  'Can you summarize the core concept of this lesson?',
  'What are the main prerequisites needed here?',
  'How is this concept applied in real projects?',
];

export function AITutorDrawer({
  courseId,
  courseSlug,
  currentLessonId,
  currentLessonTitle,
}: AITutorDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputQuestion, setInputQuestion] = useState('');
  const [messages, setMessages] = useState<TutorChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleSendMessage = async (queryText?: string) => {
    const question = (queryText || inputQuestion).trim();
    if (!question || isStreaming) return;

    setInputQuestion('');
    setRateLimitError(null);

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `tutor-${Date.now()}`;

    const userMessage: TutorChatMessage = {
      id: userMessageId,
      role: 'user',
      content: question,
    };

    const initialAssistantMessage: TutorChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      citations: [],
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    await streamTutorChat({
      courseId,
      lessonId: currentLessonId,
      question,
      signal: controller.signal,
      onCitations: (citations: TutorCitationDto[]) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, citations } : msg
          )
        );
      },
      onToken: (token: string) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: msg.content + token }
              : msg
          )
        );
      },
      onDone: (meta) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  isStreaming: false,
                  isGrounded: meta.isGrounded,
                }
              : msg
          )
        );
        setIsStreaming(false);
        abortControllerRef.current = null;
      },
      onError: (err) => {
        if (err.code === 'TUTOR_RATE_LIMIT_EXCEEDED') {
          setRateLimitError(err.message);
        }
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  isStreaming: false,
                  error: err.message,
                }
              : msg
          )
        );
        setIsStreaming(false);
        abortControllerRef.current = null;
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='rounded-xl text-xs font-semibold border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 hover:text-primary flex items-center gap-1.5 transition-all shadow-xs'
          aria-label='Open AI Tutor Assistant'
        >
          <Sparkles className='w-4 h-4 text-primary animate-pulse' />
          <span>AI Tutor</span>
        </Button>
      </SheetTrigger>

      <SheetContent
        side='right'
        className='w-full sm:max-w-md p-0 flex flex-col h-full bg-[#F8FAFC]'
        aria-label='AI Tutor Chat Drawer'
      >
        {/* Drawer Header */}
        <SheetHeader className='p-4 bg-white border-b border-gray-200/80 shrink-0'>
          <div className='flex items-center space-x-2.5'>
            <div className='w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0'>
              <Sparkles className='w-4 h-4' />
            </div>
            <div>
              <SheetTitle className='text-sm font-bold text-gray-900'>
                TechSprout AI Tutor
              </SheetTitle>
              <p className='text-[11px] text-gray-500 truncate max-w-[260px]'>
                Grounded in {currentLessonTitle ? `"${currentLessonTitle}"` : 'course curriculum'}
              </p>
            </div>
          </div>
        </SheetHeader>

        {/* Rate Limit Alert */}
        {rateLimitError && (
          <div
            className='mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start space-x-2.5 text-xs text-amber-800 shrink-0'
            role='alert'
          >
            <Clock className='w-4 h-4 text-amber-600 shrink-0 mt-0.5' />
            <div className='flex-1'>
              <strong className='font-bold block'>Daily Query Limit Reached</strong>
              <span>{rateLimitError}</span>
            </div>
          </div>
        )}

        {/* Conversation Area */}
        <div
          className='flex-1 overflow-y-auto p-4 space-y-4'
          aria-live='polite'
          role='log'
        >
          {messages.length === 0 ? (
            <div className='h-full flex flex-col justify-center items-center text-center p-4 space-y-4 text-gray-500'>
              <div className='w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center'>
                <BookOpen className='w-6 h-6' />
              </div>
              <div className='space-y-1.5 max-w-xs'>
                <h3 className='text-sm font-bold text-gray-800'>
                  Ask anything about this course
                </h3>
                <p className='text-xs text-gray-500'>
                  Answers are strictly cited from verified curriculum videos, transcripts, and notes.
                </p>
              </div>

              {/* Starter Prompt Chips */}
              <div className='w-full space-y-2 pt-2'>
                <span className='text-[10px] font-bold uppercase tracking-wider text-gray-400 block'>
                  Suggested Questions
                </span>
                {STARTER_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(prompt)}
                    className='w-full text-left p-2.5 rounded-xl bg-white border border-gray-200/80 hover:border-primary/40 hover:bg-primary/5 text-xs text-gray-700 transition shadow-2xs'
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                {/* Message Bubble */}
                <div
                  className={`max-w-[88%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-white rounded-br-xs shadow-xs'
                      : 'bg-white border border-gray-200/80 text-gray-800 rounded-bl-xs shadow-xs'
                  }`}
                >
                  {/* Content text */}
                  {msg.content ? (
                    <div className='whitespace-pre-wrap break-words'>{msg.content}</div>
                  ) : msg.isStreaming ? (
                    <div className='flex items-center space-x-1.5 py-1 text-gray-400'>
                      <div className='w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce' />
                      <div className='w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0.2s]' />
                      <div className='w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0.4s]' />
                    </div>
                  ) : null}

                  {/* Error notice */}
                  {msg.error && (
                    <div className='mt-2 flex items-center space-x-1.5 text-red-600 font-medium'>
                      <AlertCircle className='w-3.5 h-3.5 shrink-0' />
                      <span>{msg.error}</span>
                    </div>
                  )}

                  {/* Grounding Status Notice */}
                  {msg.isGrounded === false && !msg.error && (
                    <div className='mt-2 pt-2 border-t border-gray-100 flex items-center space-x-1.5 text-amber-700 text-[11px]'>
                      <AlertCircle className='w-3.5 h-3.5 shrink-0' />
                      <span>Unverified by course curriculum</span>
                    </div>
                  )}
                </div>

                {/* Grounded Citation Chips */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className='mt-2 max-w-[88%] space-y-1.5'>
                    <span className='text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1'>
                      <CheckCircle2 className='w-3 h-3 text-emerald-500' />
                      Grounded Course Citations
                    </span>
                    <div className='flex flex-wrap gap-1.5'>
                      {msg.citations.map((c, idx) => (
                        <Link
                          key={idx}
                          href={`/learn/${courseSlug}/${c.lessonId}`}
                          className='inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200/60 hover:bg-emerald-100/70 text-[11px] font-medium text-emerald-800 transition'
                          title={`Navigate to lesson: ${c.lessonTitle}`}
                        >
                          <BookOpen className='w-3 h-3 text-emerald-600' />
                          <span className='truncate max-w-[180px]'>{c.lessonTitle}</span>
                          <ExternalLink className='w-2.5 h-2.5 text-emerald-500 shrink-0' />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className='p-3.5 bg-white border-t border-gray-200/80 shrink-0 space-y-2'>
          <div className='relative flex items-end gap-2'>
            <textarea
              ref={textareaRef}
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value.slice(0, 500))}
              onKeyDown={handleKeyDown}
              disabled={isStreaming || !!rateLimitError}
              placeholder={
                rateLimitError
                  ? 'Daily limit reached'
                  : 'Ask a question about this lesson... (Enter to send)'
              }
              rows={2}
              className='flex-1 resize-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 placeholder:text-gray-400 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50'
              aria-label='Your question for the AI tutor'
            />

            {isStreaming ? (
              <Button
                type='button'
                onClick={handleStopGenerating}
                size='icon'
                variant='outline'
                className='rounded-xl h-9 w-9 text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200 shrink-0'
                title='Stop generating'
                aria-label='Stop generating response'
              >
                <Square className='w-4 h-4 fill-current' />
              </Button>
            ) : (
              <Button
                type='button'
                onClick={() => handleSendMessage()}
                disabled={!inputQuestion.trim() || !!rateLimitError}
                size='icon'
                className='rounded-xl h-9 w-9 bg-primary hover:bg-primary/90 text-white shrink-0 disabled:opacity-50'
                title='Send question'
                aria-label='Send question'
              >
                <Send className='w-4 h-4' />
              </Button>
            )}
          </div>

          <div className='flex items-center justify-between text-[10px] text-gray-400 px-1'>
            <span>Shift + Enter for new line</span>
            <span>{inputQuestion.length}/500</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
