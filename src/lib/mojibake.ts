// Some MyMemory translations arrive as UTF-8 that was read as Latin-1/Windows-1252
// ("ÐžÑ‚Ð´ÐµÐ»" instead of "Отдел"), sometimes with the 0x80–0x9F bytes
// further mangled into caret notation ("Ð^^" for D0 9E). Undo that when possible.

const CP1252: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

/** Lead bytes of two-byte UTF-8 (Cyrillic D0/D1, accented Latin C3/C2) shown as Latin-1. */
const SUSPECT = /[ÐÑÃÂ]/;

/** A lead byte followed by a continuation byte, in any of the mangled forms. */
const GARBLED = new RegExp(`[ÐÑÃ][\\u0080-\\u00bf^${Object.keys(CP1252).join('')}]`);

export function looksGarbled(text: string): boolean {
  return GARBLED.test(text);
}

export function repairMojibake(text: string): string {
  if (!SUSPECT.test(text) || !looksGarbled(text)) return text;
  const restored = text.replace(/\^([@-_])/g, (_, c: string) => String.fromCharCode(c.charCodeAt(0) - 0x40 + 0x80));
  const bytes: number[] = [];
  for (const ch of restored) {
    const code = ch.charCodeAt(0);
    if (code <= 0xff) bytes.push(code);
    else if (CP1252[ch] !== undefined) bytes.push(CP1252[ch]);
    else return text; // not a byte-for-byte view of UTF-8
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return text;
  }
}
