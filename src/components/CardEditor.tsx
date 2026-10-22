import { useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { t } from '../lib/i18n';
import type { Sense } from '../lib/wikitext';
import type { Article, CardFields } from '../lib/types';

function AutoText(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

const ARTICLES: (Article | null)[] = ['der', 'die', 'das', null];

interface Props {
  value: CardFields;
  onChange: (next: CardFields) => void;
  senses?: Sense[];
  senseIndex?: number;
  onPickSense?: (i: number) => void;
  wordInputRef?: React.Ref<HTMLInputElement>;
}

export function CardEditor({ value, onChange, senses, senseIndex = 0, onPickSense, wordInputRef }: Props) {
  const [showSenses, setShowSenses] = useState(false);
  const set = <K extends keyof CardFields>(k: K, v: CardFields[K]) => onChange({ ...value, [k]: v });

  const others = senses && senses.length > 1 ? senses : null;
  const L = t().editor;

  return (
    <div className="card editor">
      <div className="editor-top">
        <div className="article-pick" role="group" aria-label={L.article}>
          {ARTICLES.map((a) => (
            <button
              key={a ?? 'none'}
              type="button"
              className={a ?? 'none'}
              aria-pressed={value.article === a}
              onClick={() => set('article', a)}
            >
              {a ?? '—'}
            </button>
          ))}
        </div>
        <input
          className="inline pos"
          value={value.pos}
          placeholder={L.posPlaceholder}
          onChange={(e) => set('pos', e.target.value)}
          aria-label={L.pos}
        />
      </div>

      <input
        ref={wordInputRef}
        className="inline word"
        value={value.word}
        placeholder={L.word}
        onChange={(e) => set('word', e.target.value)}
        aria-label={L.word}
        spellCheck={false}
      />
      <input
        className="inline forms-field"
        value={value.forms}
        placeholder={L.formsPlaceholder}
        onChange={(e) => set('forms', e.target.value)}
        aria-label={L.forms}
        spellCheck={false}
      />

      <div className="fields">
        <label htmlFor="f-def">{L.definition}</label>
        <AutoText
          id="f-def"
          className="inline definition-field"
          value={value.definition}
          placeholder={L.definitionPlaceholder}
          onChange={(e) => set('definition', e.target.value)}
        />
        {others && (
          <div className="senses">
            {showSenses &&
              others.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className="sense"
                  aria-pressed={i === senseIndex}
                  onClick={() => onPickSense?.(i)}
                  title={L.useSense}
                >
                  <span className="n">{i + 1}</span>
                  <span>{s.text}</span>
                </button>
              ))}
            <button type="button" className="more-senses" onClick={() => setShowSenses((v) => !v)}>
              {showSenses ? L.collapse : L.otherSenses(others.length - 1)}
            </button>
          </div>
        )}

        <label htmlFor="f-en">{L.english}</label>
        <input
          id="f-en"
          className="inline tr-field"
          value={value.en}
          placeholder="house, home"
          onChange={(e) => set('en', e.target.value)}
        />

        <label htmlFor="f-ru">{L.russian}</label>
        <input
          id="f-ru"
          className="inline tr-field"
          value={value.ru}
          placeholder="дом"
          onChange={(e) => set('ru', e.target.value)}
        />

        <label htmlFor="f-ex">{L.example}</label>
        <AutoText
          id="f-ex"
          className="inline example-field"
          value={value.example}
          placeholder="Das *Haus* ist groß."
          onChange={(e) => set('example', e.target.value)}
        />

        <label htmlFor="f-note">{L.note}</label>
        <AutoText
          id="f-note"
          className="inline"
          value={value.note}
          placeholder={L.notePlaceholder}
          onChange={(e) => set('note', e.target.value)}
        />
      </div>
    </div>
  );
}
