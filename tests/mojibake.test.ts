import { describe, expect, it } from 'vitest';
import { looksGarbled, repairMojibake } from '../src/lib/mojibake';

describe('repairMojibake', () => {
  it('repairs translations that came back from MyMemory garbled', () => {
    expect(repairMojibake('Ð^^Ñ^BÐ´ÐµÐ»ÐµÐ½Ð¸Ðµ')).toBe('Отделение');
    expect(repairMojibake('Ð^]Ð°Ð·Ð°Ð´')).toBe('Назад');
  });

  it('repairs the Windows-1252 flavour too', () => {
    expect(repairMojibake('ÐžÑ‚Ð´ÐµÐ»')).toBe('Отдел');
    expect(repairMojibake('Ã¼ber')).toBe('über');
  });

  it('leaves normal text alone', () => {
    for (const s of ['дом', 'wanderlust, itchy feet', 'Größe', 'Ça va', '^_^', 'Ð']) {
      expect(repairMojibake(s)).toBe(s);
      expect(looksGarbled(s)).toBe(false);
    }
  });
});
