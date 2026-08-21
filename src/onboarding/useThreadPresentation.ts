// Generic over the variant type so any scripted thread can reuse it.
// Every *active* assistant message walks typing → text → actions on
// timers; the moment a new message arrives, older ones are frozen.

import { useEffect, useRef, useState } from 'react';

import { onboardingMotion } from './motion';

export type PresentationPhase = 'typing' | 'text' | 'actions';

export type AssistantThreadEvent<Variant extends string> = {
  readonly kind: 'assistant';
  readonly id: string;
  readonly variant: Variant;
  readonly text?: string;
};

export type ThreadEventLike<Variant extends string> =
  | { readonly kind: 'user'; readonly id: string; readonly label: string }
  | AssistantThreadEvent<Variant>;

const PROCESS_ASSISTANT_VARIANTS: ReadonlySet<string> = new Set(['working']);

export function isProcessAssistantEvent<Variant extends string>(
  event: ThreadEventLike<Variant> | null | undefined,
): boolean {
  return event?.kind === 'assistant' && PROCESS_ASSISTANT_VARIANTS.has(event.variant);
}

export type ThreadPresentation = {
  readonly getPhase: (eventId: string) => PresentationPhase;
  readonly isFirstAssistant: (eventId: string) => boolean;
};

export function useThreadPresentation<Variant extends string>(
  events: readonly ThreadEventLike<Variant>[],
  activeAssistantId: string | null,
): ThreadPresentation {
  const [phases, setPhases] = useState<Record<string, PresentationPhase>>({});
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const firstAssistantId = (() => {
    for (const ev of events) {
      if (ev.kind === 'assistant') return ev.id;
    }
    return null;
  })();

  const activeAssistantEvent = (() => {
    if (!activeAssistantId) return null;
    for (const ev of events) {
      if (ev.kind === 'assistant' && ev.id === activeAssistantId) return ev;
    }
    return null;
  })();

  // Drive the active message through typing → text → actions. Older
  // messages are frozen by the render loop itself (non-active events
  // short-circuit to phase "actions"), so no sync state write here.
  useEffect(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];

    if (!activeAssistantId) return;

    const isProcessStep = isProcessAssistantEvent(activeAssistantEvent);
    const isFirst = activeAssistantId === firstAssistantId;
    const typingMs = isProcessStep
      ? 0
      : isFirst
        ? onboardingMotion.assistantFirstTypingMs
        : onboardingMotion.assistantTypingMs;
    const textHoldMs = isProcessStep
      ? onboardingMotion.processTextRevealMs
      : onboardingMotion.assistantTextHoldMs;

    const schedule = (phase: PresentationPhase, delayMs: number) => {
      const id = setTimeout(() => {
        setPhases((prev) => ({ ...prev, [activeAssistantId]: phase }));
      }, delayMs);
      timersRef.current.push(id);
    };

    schedule('typing', 0);
    schedule('text', typingMs);
    schedule('actions', typingMs + textHoldMs);

    return () => {
      for (const id of timersRef.current) clearTimeout(id);
      timersRef.current = [];
    };
  }, [activeAssistantEvent, activeAssistantId, firstAssistantId]);

  const getPhase = (eventId: string): PresentationPhase =>
    phases[eventId] ?? (eventId === activeAssistantId ? 'typing' : 'actions');

  const isFirstAssistant = (eventId: string): boolean => eventId === firstAssistantId;

  return { getPhase, isFirstAssistant };
}

export function shouldShowPresentationContent(phase: PresentationPhase): boolean {
  return phase === 'typing' || phase === 'text' || phase === 'actions';
}

export function shouldShowStageActions<Variant extends string>(
  phase: PresentationPhase,
  event?: ThreadEventLike<Variant> | null,
): boolean {
  if (isProcessAssistantEvent(event)) {
    return phase === 'text' || phase === 'actions';
  }
  return phase === 'actions';
}