'use client';

import { create } from 'zustand';
import type { AiStyle } from '@/features/personalization/catalog';
import type { CreateType } from '@/features/quick-create/catalog';
import type { RecordKind } from '@/features/ai/types';
import type { AiConversationView, AiMessageView } from '@/lib/api/contracts';
import { apiFetch, errorMessage } from './api';

export type SettingsTab = 'profile' | 'workstyle' | 'appearance' | 'home' | 'ai' | 'notifications' | 'apps';
export type PreviewTarget = { kind: RecordKind | 'company'; id: string };
export type CreatePrefill = { title: string; related: string; extra: string; notes: string };

export type ConfirmRequest = {
  title: string;
  body: string;
  items: string[];
  ok: string;
  // Runs only after the person confirms; errors surface as a toast and leave nothing half-done on screen.
  run: () => Promise<void> | void;
};

type Toast = { id: number; message: string; undo: (() => void) | null };

type AiState = {
  loaded: boolean;
  loading: boolean;
  conversationId: string | null;
  provider: AiConversationView['provider'];
  messages: AiMessageView[];
  pendingQuestion: string | null;
  error: string | null;
};

type UiState = {
  paletteOpen: boolean;
  aiOpen: boolean;
  prepMeetingId: string | null;
  preview: PreviewTarget | null;
  settingsTab: SettingsTab | null;
  create: { type: CreateType; prefill: CreatePrefill } | null;
  confirm: ConfirmRequest | null;
  toastState: Toast | null;
  customizing: boolean;
  libraryOpen: boolean;
  notificationsOpen: boolean;
  quickOpen: boolean;
  demoOpen: boolean;
  mobileNavOpen: boolean;
  groupsClosed: Record<string, boolean>;
  showAllModules: boolean;
  drag: { id: string | null; over: string | null };
  ai: AiState;

  toast: (message: string, undo?: () => void) => void;
  dismissToast: () => void;
  openPalette: () => void;
  togglePalette: () => void;
  closePalette: () => void;
  setAiOpen: (open: boolean) => void;
  openPrep: (meetingId: string) => void;
  closePrep: () => void;
  openPreview: (target: PreviewTarget) => void;
  closePreview: () => void;
  openSettings: (tab: SettingsTab) => void;
  closeSettings: () => void;
  openCreate: (type: CreateType, prefill?: Partial<CreatePrefill>) => void;
  closeCreate: () => void;
  requestConfirm: (request: ConfirmRequest) => void;
  closeConfirm: () => void;
  setCustomizing: (on: boolean) => void;
  setLibraryOpen: (open: boolean) => void;
  setPopover: (popover: 'notifications' | 'quick' | 'demo' | 'mobileNav' | null) => void;
  toggleGroup: (groupId: string) => void;
  toggleAllModules: () => void;
  setDrag: (drag: { id: string | null; over: string | null }) => void;
  // Esc for the non-modal layers (modal dialogs handle Esc themselves): library → popovers → AI → customize.
  escapeNonModalLayer: () => boolean;
  hasModalOpen: () => boolean;
  loadAiConversation: () => Promise<void>;
  askAi: (question: string, options?: { key?: string; ref?: string | null; style?: AiStyle }) => Promise<void>;
  resetAi: () => void;
  markAiActionDone: (messageId: string, actionIndex: number) => void;
};

const TOAST_MS = 4200;
let toastCounter = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const EMPTY_AI: AiState = { loaded: false, loading: false, conversationId: null, provider: 'simulated', messages: [], pendingQuestion: null, error: null };

const DEFAULT_PREFILL: CreatePrefill = { title: '', related: '', extra: '', notes: '' };

export const useUiStore = create<UiState>()((set, get) => ({
  paletteOpen: false,
  aiOpen: false,
  prepMeetingId: null,
  preview: null,
  settingsTab: null,
  create: null,
  confirm: null,
  toastState: null,
  customizing: false,
  libraryOpen: false,
  notificationsOpen: false,
  quickOpen: false,
  demoOpen: false,
  mobileNavOpen: false,
  groupsClosed: {},
  showAllModules: false,
  drag: { id: null, over: null },
  ai: EMPTY_AI,

  toast: (message, undo) => {
    toastCounter += 1;
    const id = toastCounter;
    set({ toastState: { id, message, undo: undo ?? null } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (get().toastState?.id === id) set({ toastState: null });
    }, TOAST_MS);
  },
  dismissToast: () => set({ toastState: null }),
  openPalette: () => set({ paletteOpen: true, notificationsOpen: false, quickOpen: false }),
  togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),
  closePalette: () => set({ paletteOpen: false }),
  setAiOpen: (open) => {
    set({ aiOpen: open, paletteOpen: open ? false : get().paletteOpen });
    if (open && !get().ai.loaded) void get().loadAiConversation();
  },
  openPrep: (meetingId) => set({ prepMeetingId: meetingId, preview: null, paletteOpen: false }),
  closePrep: () => set({ prepMeetingId: null }),
  openPreview: (target) => set({ preview: target, prepMeetingId: null, paletteOpen: false }),
  closePreview: () => set({ preview: null }),
  openSettings: (tab) => set({ settingsTab: tab, notificationsOpen: false, quickOpen: false, mobileNavOpen: false }),
  closeSettings: () => set({ settingsTab: null }),
  openCreate: (type, prefill) => set({ create: { type, prefill: { ...DEFAULT_PREFILL, ...prefill } }, quickOpen: false, paletteOpen: false, preview: null }),
  closeCreate: () => set({ create: null }),
  requestConfirm: (request) => set({ confirm: request }),
  closeConfirm: () => set({ confirm: null }),
  setCustomizing: (on) => set({ customizing: on, libraryOpen: on ? get().libraryOpen : false }),
  setLibraryOpen: (open) => set({ libraryOpen: open }),
  setPopover: (popover) => set({ notificationsOpen: popover === 'notifications', quickOpen: popover === 'quick', demoOpen: popover === 'demo', mobileNavOpen: popover === 'mobileNav' }),
  toggleGroup: (groupId) => set((state) => ({ groupsClosed: { ...state.groupsClosed, [groupId]: !state.groupsClosed[groupId] } })),
  toggleAllModules: () => set((state) => ({ showAllModules: !state.showAllModules })),
  setDrag: (drag) => set({ drag }),

  hasModalOpen: () => {
    const state = get();
    return Boolean(state.confirm || state.create || state.paletteOpen || state.settingsTab || state.prepMeetingId || state.preview);
  },
  escapeNonModalLayer: () => {
    const state = get();
    if (state.libraryOpen) return set({ libraryOpen: false }), true;
    if (state.notificationsOpen || state.quickOpen || state.demoOpen || state.mobileNavOpen) return set({ notificationsOpen: false, quickOpen: false, demoOpen: false, mobileNavOpen: false }), true;
    if (state.aiOpen) return set({ aiOpen: false }), true;
    if (state.customizing) return set({ customizing: false }), true;
    return false;
  },

  loadAiConversation: async () => {
    set((state) => ({ ai: { ...state.ai, loading: true, error: null } }));
    try {
      const conversation = await apiFetch<AiConversationView>('/api/ai/conversation');
      set((state) => ({ ai: { ...state.ai, loaded: true, loading: false, conversationId: conversation.id, provider: conversation.provider, messages: conversation.messages } }));
    } catch (error) {
      set((state) => ({ ai: { ...state.ai, loaded: true, loading: false, error: errorMessage(error) } }));
    }
  },
  askAi: async (question, options = {}) => {
    const trimmed = question.trim();
    if (!trimmed || get().ai.pendingQuestion) return;
    set((state) => ({ aiOpen: true, paletteOpen: false, ai: { ...state.ai, loaded: true, pendingQuestion: trimmed, error: null } }));
    try {
      const conversation = await apiFetch<AiConversationView>('/api/ai/ask', {
        method: 'POST',
        body: { question: trimmed, key: options.key, ref: options.ref ?? null, style: options.style, conversationId: get().ai.conversationId },
      });
      set((state) => ({ ai: { ...state.ai, pendingQuestion: null, conversationId: conversation.id, provider: conversation.provider, messages: conversation.messages } }));
    } catch (error) {
      set((state) => ({ ai: { ...state.ai, pendingQuestion: null, error: errorMessage(error) } }));
    }
  },
  resetAi: () => set((state) => ({ ai: { ...EMPTY_AI, loaded: true, provider: state.ai.provider } })),
  markAiActionDone: (messageId, actionIndex) =>
    set((state) => ({
      ai: {
        ...state.ai,
        messages: state.ai.messages.map((message) => (message.id === messageId && message.role === 'assistant' ? { ...message, completedActions: [...message.completedActions, actionIndex] } : message)),
      },
    })),
}));
