// Two "devices" syncing through a fake GitHub gist API.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Gist = { id: string; description: string; files: Record<string, { content: string }> };
let gists: Gist[] = [];
let writes = 0;

function fakeGitHub(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = init?.method ?? 'GET';
  const auth = (init?.headers as Record<string, string>)?.Authorization;
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
  if (auth !== 'Bearer good-token') return json({ message: 'Bad credentials' }, 401);
  if (url.pathname === '/user') return json({ login: 'tester' });
  if (url.pathname === '/gists' && method === 'GET') return json(gists);
  if (url.pathname === '/gists' && method === 'POST') {
    const body = JSON.parse(String(init!.body));
    const g = { id: `g${gists.length + 1}`, description: body.description, files: body.files };
    gists.push(g);
    writes++;
    return json(g, 201);
  }
  const g = gists.find((x) => url.pathname === `/gists/${x.id}`);
  if (!g) return json({ message: 'Not Found' }, 404);
  if (method === 'PATCH') {
    g.files = { ...g.files, ...JSON.parse(String(init!.body)).files };
    writes++;
  }
  return json({ ...g, files: Object.fromEntries(Object.entries(g.files).map(([k, f]) => [k, { ...f, truncated: false }])) });
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

/** A fresh copy of the app modules with its own storage, like a second computer. */
async function device() {
  const storage = memoryStorage();
  vi.resetModules();
  vi.stubGlobal('localStorage', storage);
  const store = await import('../src/lib/store');
  const sync = await import('../src/lib/sync');
  // Every call runs with this device's storage in place.
  const on = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    vi.stubGlobal('localStorage', storage);
    return fn();
  };
  return { store, sync, on };
}

const fields = (word: string) => ({
  word,
  article: null,
  pos: '',
  forms: '',
  ipa: '',
  definition: '',
  en: '',
  ru: word.toUpperCase(),
  example: '',
  note: '',
});
const words = (d: Awaited<ReturnType<typeof device>>) =>
  d.store
    .getDb()
    .cards.map((c) => c.word)
    .sort();

beforeEach(() => {
  gists = [];
  writes = 0;
  vi.stubGlobal('fetch', vi.fn(fakeGitHub));
});

describe('gist sync', () => {
  it('rejects a bad token without saving it', async () => {
    const a = await device();
    await expect(a.on(() => a.sync.connect('nope'))).rejects.toBe('auth');
    expect(a.sync.useSync).toBeTypeOf('function');
    expect(gists).toHaveLength(0);
  });

  it('brings two devices to the same dictionary', async () => {
    const a = await device();
    await a.on(() => a.store.addCard(fields('Haus')));
    await a.on(() => a.sync.connect('good-token'));
    expect(gists).toHaveLength(1);

    const b = await device();
    await b.on(() => b.store.addCard(fields('Bank')));
    await b.on(() => b.sync.connect('good-token'));
    expect(gists).toHaveLength(1); // found, not duplicated
    expect(words(b)).toEqual(['Bank', 'Haus']);

    await a.on(() => a.sync.syncNow());
    expect(words(a)).toEqual(['Bank', 'Haus']);

    // A deletion travels too and doesn't come back.
    const bank = b.store.getDb().cards.find((c) => c.word === 'Bank')!;
    await b.on(() => b.store.deleteCard(bank.id));
    await b.on(() => b.sync.syncNow());
    await a.on(() => a.sync.syncNow());
    expect(words(a)).toEqual(['Haus']);
    await b.on(() => b.sync.syncNow());
    expect(words(b)).toEqual(['Haus']);
  });

  it('does not write to the gist when nothing changed', async () => {
    const a = await device();
    await a.on(() => a.store.addCard(fields('Haus')));
    await a.on(() => a.sync.connect('good-token'));
    const before = writes;
    await a.on(() => a.sync.syncNow());
    await a.on(() => a.sync.syncNow());
    expect(writes).toBe(before);
  });
});
