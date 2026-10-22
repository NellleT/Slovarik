// Persistence. Inside the desktop app the database is a JSON file in the
// OS app-data folder (written by the Rust side); in a plain browser
// (npm run dev) it falls back to localStorage.

import { invoke } from '@tauri-apps/api/core';
import { t } from './i18n';

const KEY = 'slovarik.db';

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function loadRaw(): Promise<string | null> {
  if (isDesktop) return invoke<string | null>('load_data');
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let writing = false;
let pending: string | null = null;

/** Writes are serialized; if several arrive while one is running, only the latest is kept. */
export function saveRaw(contents: string): void {
  pending = contents;
  if (!writing) void flush();
}

async function flush() {
  writing = true;
  try {
    while (pending !== null) {
      const next = pending;
      pending = null;
      try {
        if (isDesktop) await invoke('save_data', { contents: next });
        else localStorage.setItem(KEY, next);
      } catch (e) {
        console.error('save failed', e);
      }
    }
  } finally {
    writing = false;
  }
}

/** Saves a file to the Downloads folder (desktop) or triggers a browser download. Returns a human-readable location. */
export async function exportFile(name: string, contents: string): Promise<string> {
  if (isDesktop) return invoke<string>('export_file', { name, contents });
  const blob = new Blob([contents], { type: name.endsWith('.csv') ? 'text/csv' : 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return `${t().settings.downloads}/${name}`;
}

export async function openDataDir(): Promise<void> {
  if (isDesktop) await invoke('open_data_dir');
}
