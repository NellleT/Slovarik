import { useEffect, useRef } from 'react';
import { cardsFromCsv, toCsv } from '../lib/csv';
import { LANG_NAMES, t, type LangPref } from '../lib/i18n';
import { addCards, exportJson, findDuplicate, importJson, updateSettings, useDb } from '../lib/store';
import { exportFile, isDesktop, openDataDir } from '../lib/storage';
import type { Settings } from '../lib/types';
import { openSettings, toast } from '../lib/ui';
import { Icon } from './Icon';

function Stepper({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  const L = t().settings;
  return (
    <div className="stepper">
      <button onClick={() => onChange(clamp(value - step))} aria-label={L.fewer}>
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
      />
      <button onClick={() => onChange(clamp(value + step))} aria-label={L.more}>
        +
      </button>
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

const today = () => new Date().toISOString().slice(0, 10);

export function SettingsDialog() {
  const db = useDb();
  const s = db.settings;
  const set = (patch: Partial<Settings>) => updateSettings(patch);
  const fileRef = useRef<HTMLInputElement>(null);
  const L = t().settings;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openSettings(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function doExport(kind: 'json' | 'csv') {
    try {
      const name = `slovarik-${today()}.${kind}`;
      const where = await exportFile(name, kind === 'json' ? exportJson() : toCsv(db.cards));
      toast(t().settings.saved(where));
    } catch (e) {
      toast(t().settings.saveFailed(String(e)));
    }
  }

  async function doImport(file: File) {
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        const r = importJson(text);
        toast(t().settings.imported(r.added, r.skipped));
      } else {
        const rows = cardsFromCsv(text);
        const fresh = rows.filter((f) => !findDuplicate(f.word));
        const n = addCards(fresh);
        toast(t().settings.imported(n, rows.length - n));
      }
    } catch {
      toast(t().settings.badFile);
    }
  }

  const languages: [LangPref, string][] = [
    ['auto', L.languageAuto],
    ['ru', LANG_NAMES.ru],
    ['en', LANG_NAMES.en],
    ['de', LANG_NAMES.de],
  ];

  return (
    <>
      <div className="overlay" onClick={() => openSettings(false)} />
      <div className="dialog" role="dialog" aria-label={L.title}>
        <div className="sheet-head">
          <span className="eyebrow">{L.title}</span>
          <button className="icon-btn" onClick={() => openSettings(false)} aria-label={t().common.close}>
            <Icon name="close" />
          </button>
        </div>
        <div className="settings">
          <section>
            <div className="setting">
              <div className="label">{L.language}</div>
              <div className="segmented" role="group" aria-label={L.language}>
                {languages.map(([v, label]) => (
                  <button key={v} aria-pressed={s.lang === v} onClick={() => set({ lang: v })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="setting">
              <div>
                <div className="label">{L.newPerDay}</div>
                <div className="hint">{L.newPerDayHint}</div>
              </div>
              <Stepper value={s.newPerDay} min={0} max={200} step={5} onChange={(v) => set({ newPerDay: v })} />
            </div>
            <div className="setting">
              <div>
                <div className="label">{L.maxReviews}</div>
                <div className="hint">{L.maxReviewsHint}</div>
              </div>
              <Stepper value={s.maxReviews} min={10} max={2000} step={50} onChange={(v) => set({ maxReviews: v })} />
            </div>
            <div className="setting">
              <div>
                <div className="label">{L.retention}</div>
                <div className="hint">{L.retentionHint}</div>
              </div>
              <div className="range">
                <input
                  type="range"
                  min={80}
                  max={97}
                  value={Math.round(s.retention * 100)}
                  onChange={(e) => set({ retention: Number(e.target.value) / 100 })}
                  aria-label={L.retention}
                />
                <output>{Math.round(s.retention * 100)}%</output>
              </div>
            </div>
          </section>

          <section>
            <div className="setting">
              <div>
                <div className="label">{L.reverse}</div>
                <div className="hint">{L.reverseHint}</div>
              </div>
              <Switch on={s.reverse} onChange={(v) => set({ reverse: v })} label={L.reverse} />
            </div>
            <div className="setting">
              <div>
                <div className="label">{L.hideArticle}</div>
                <div className="hint">{L.hideArticleHint}</div>
              </div>
              <Switch on={s.hideArticle} onChange={(v) => set({ hideArticle: v })} label={L.hideArticle} />
            </div>
            <div className="setting">
              <div>
                <div className="label">{L.autoSpeak}</div>
                <div className="hint">{L.autoSpeakHint}</div>
              </div>
              <Switch on={s.autoSpeak} onChange={(v) => set({ autoSpeak: v })} label={L.autoSpeak} />
            </div>
            <div className="setting">
              <div className="label">{L.theme}</div>
              <div className="segmented" role="group" aria-label={L.theme}>
                {(
                  [
                    ['system', L.themeSystem],
                    ['light', L.themeLight],
                    ['dark', L.themeDark],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} aria-pressed={s.theme === v} onClick={() => set({ theme: v })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h3 className="eyebrow">{L.data}</h3>
            <div className="data-actions">
              <button className="btn" onClick={() => doExport('json')}>
                {L.backup}
              </button>
              <button className="btn" onClick={() => doExport('csv')}>
                {L.exportCsv}
              </button>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                {L.import}
              </button>
              {isDesktop && (
                <button className="btn quiet" onClick={() => openDataDir()}>
                  {L.openFolder}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".json,.csv,.tsv,.txt"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) doImport(f);
                  e.target.value = '';
                }}
              />
            </div>
          </section>

          <section className="about">{L.about(__APP_VERSION__)}</section>
        </div>
      </div>
    </>
  );
}
