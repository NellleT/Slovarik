// App-wide UI state: current screen, open overlays, toast.

import { useSyncExternalStore } from 'react';

export type Screen = 'review' | 'add' | 'library' | 'stats';

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface UiState {
  screen: Screen;
  editing: string | null;
  settings: boolean;
  toast: Toast | null;
  /** word to prefill on the Add screen */
  addDraft: string | null;
}

let state: UiState = { screen: 'review', editing: null, settings: false, toast: null, addDraft: null };
const listeners = new Set<() => void>();

function set(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useUi(): UiState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const navigate = (screen: Screen) => set({ screen });
export const openEditor = (id: string | null) => set({ editing: id });
export const openSettings = (open: boolean) => set({ settings: open });
export const addWithDraft = (word: string) => set({ screen: 'add', addDraft: word });
export const takeAddDraft = () => {
  const d = state.addDraft;
  if (d !== null) state = { ...state, addDraft: null };
  return d;
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastSeq = 0;

export function toast(text: string, action?: Toast['action']) {
  clearTimeout(toastTimer);
  set({ toast: { id: ++toastSeq, text, action } });
  toastTimer = setTimeout(() => set({ toast: null }), action ? 6000 : 3200);
}

export const dismissToast = () => set({ toast: null });

/** True while focus is in a text field, so single-key shortcuts stay out of the way. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);
export const modKey = isMac ? '⌘' : 'Ctrl';
