// Sync through a secret GitHub gist. Each device keeps its own copy and merges
// with the gist: on start, a few seconds after a change, on focus and every few
// minutes. The token lives in the OS keychain (desktop) or localStorage (dev).

import { invoke } from '@tauri-apps/api/core';
import { useSyncExternalStore } from 'react';
import { canonical, mergeDb } from './merge';
import { applySynced, getDb, normalizeDb, onLocalChange } from './store';
import { isDesktop } from './storage';
import type { Db } from './types';

const API = 'https://api.github.com';
const FILE = 'slovarik.json';
const DESCRIPTION = 'Slovarik sync';
const CONFIG_KEY = 'slovarik.sync';
const DEV_TOKEN_KEY = 'slovarik.dev-token';

export type SyncError = 'auth' | 'network' | 'other';

export interface SyncState {
  status: 'off' | 'idle' | 'syncing' | 'error';
  login: string | null;
  gistId: string | null;
  lastSync: number | null;
  error: SyncError | null;
}

let state: SyncState = { status: 'off', login: null, gistId: null, lastSync: null, error: null, ...loadConfig() };
const listeners = new Set<() => void>();

function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ login: state.login, gistId: state.gistId, lastSync: state.lastSync }));
  } catch {}
  for (const l of listeners) l();
}

function loadConfig(): Partial<SyncState> {
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}');
    return { login: c.login ?? null, gistId: c.gistId ?? null, lastSync: c.lastSync ?? null };
  } catch {
    return {};
  }
}

export function useSync(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

async function getToken(): Promise<string | null> {
  if (isDesktop) return invoke<string | null>('token_get');
  try {
    return localStorage.getItem(DEV_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function saveToken(token: string | null) {
  if (isDesktop) {
    await invoke(token ? 'token_set' : 'token_clear', token ? { token } : {});
    return;
  }
  try {
    if (token) localStorage.setItem(DEV_TOKEN_KEY, token);
    else localStorage.removeItem(DEV_TOKEN_KEY);
  } catch {}
}

class GistError extends Error {
  constructor(public kind: SyncError | 'missing') {
    super(kind);
  }
}

async function gh(token: string, path: string, init: RequestInit = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      // GitHub marks API responses cacheable for a minute; we always want the live gist.
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new GistError('network');
  }
  if (res.status === 401) throw new GistError('auth');
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') throw new GistError('network');
  if (res.status === 403) throw new GistError('auth');
  if (res.status === 404) throw new GistError('missing');
  if (!res.ok) throw new GistError('other');
  return res.json();
}

async function findGist(token: string): Promise<string | null> {
  for (let page = 1; page <= 5; page++) {
    const list: any[] = await gh(token, `/gists?per_page=100&page=${page}`);
    const hit = list.find((g) => g.description === DESCRIPTION && g.files?.[FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return null;
}

async function createGist(token: string, db: Db): Promise<string> {
  const g = await gh(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({ description: DESCRIPTION, public: false, files: { [FILE]: { content: JSON.stringify(db) } } }),
  });
  return g.id;
}

async function readGist(token: string, id: string): Promise<Db | null> {
  const g = await gh(token, `/gists/${id}`);
  const file = g.files?.[FILE];
  if (!file) return null;
  // The API cuts files above 1 MB; the raw URL has the whole thing.
  let text: string = file.content;
  if (file.truncated) {
    try {
      text = await (await fetch(file.raw_url, { cache: 'no-store' })).text();
    } catch {
      throw new GistError('network');
    }
  }
  return normalizeDb(JSON.parse(text));
}

async function writeGist(token: string, id: string, db: Db) {
  await gh(token, `/gists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(db) } } }),
  });
}

async function runOnce(token: string) {
  let gistId = state.gistId;
  if (!gistId) {
    gistId = await findGist(token);
    if (!gistId) {
      // First device: the gist starts as a copy of this dictionary.
      set({ gistId: await createGist(token, getDb()) });
      return;
    }
    set({ gistId });
  }

  let remote: Db | null;
  try {
    remote = await readGist(token, gistId);
  } catch (e) {
    if (e instanceof GistError && e.kind === 'missing') {
      // Someone deleted the gist: look for another one or start over.
      set({ gistId: null });
      return runOnce(token);
    }
    throw e;
  }

  // Merge with the current local copy right after the download, so changes
  // made while the request was in flight are kept.
  const local = getDb();
  const merged = remote ? mergeDb(local, remote) : local;
  const m = canonical(merged);
  if (m !== canonical(local)) applySynced(merged);
  if (!remote || m !== canonical(remote)) await writeGist(token, gistId, merged);
}

let running: Promise<void> | null = null;
let again = false;

/** Runs a sync; calls made while one is running are folded into one more pass. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      const token = await getToken();
      if (!token) {
        set({ status: 'off' });
        return;
      }
      set({ status: 'syncing' });
      try {
        await runOnce(token);
        set({ status: 'idle', lastSync: Date.now(), error: null });
      } catch (e) {
        set({ status: 'error', error: e instanceof GistError && e.kind !== 'missing' ? e.kind : 'other' });
        return;
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
const connected = () => state.status !== 'off';

export async function initSync() {
  onLocalChange(() => {
    if (!connected()) return;
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 15_000);
  });
  window.addEventListener('focus', () => {
    if (connected() && Date.now() - (state.lastSync ?? 0) > 60_000) void syncNow();
  });
  setInterval(() => connected() && void syncNow(), 5 * 60_000);

  let token: string | null = null;
  try {
    token = await getToken();
  } catch {}
  if (token) {
    set({ status: 'idle' });
    void syncNow();
  }
}

/** Checks the token, stores it and runs the first sync. Throws a SyncError kind on failure. */
export async function connect(rawToken: string): Promise<void> {
  const token = rawToken.trim();
  try {
    const user = await gh(token, '/user');
    await gh(token, '/gists?per_page=1');
    await saveToken(token);
    set({ status: 'idle', login: user.login, gistId: null, error: null, lastSync: null });
  } catch (e) {
    throw e instanceof GistError && e.kind !== 'missing' ? e.kind : 'other';
  }
  await syncNow();
}

/** Forgets the token on this device. The gist and the local dictionary stay as they are. */
export async function disconnect() {
  clearTimeout(timer);
  await saveToken(null);
  set({ status: 'off', login: null, gistId: null, lastSync: null, error: null });
}

export function openTokenPage() {
  const url = 'https://github.com/settings/tokens/new?scopes=gist&description=Slovarik%20sync';
  if (isDesktop) void invoke('open_token_page');
  else window.open(url, '_blank', 'noopener');
}
