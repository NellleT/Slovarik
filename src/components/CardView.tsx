import { emphasisParts } from '../lib/format';
import { t } from '../lib/i18n';
import { canSpeak, speak } from '../lib/speech';
import type { CardFields, Direction } from '../lib/types';
import { Icon } from './Icon';

export function spokenForm(c: CardFields): string {
  return c.article ? `${c.article} ${c.word}` : c.word;
}

export function Example({ text }: { text: string }) {
  return (
    <>
      {emphasisParts(text).map((p, i) => (p.em ? <em key={i}>{p.text}</em> : <span key={i}>{p.text}</span>))}
    </>
  );
}

function Headword({ card, hideArticle }: { card: CardFields; hideArticle: boolean }) {
  return (
    <div className="word">
      {card.article &&
        (hideArticle ? (
          <span className="article hidden">der/die/das?</span>
        ) : (
          <span className={`article art-${card.article}`}>{card.article}</span>
        ))}
      {card.word}
    </div>
  );
}

interface Props {
  card: CardFields;
  dir: Direction;
  revealed: boolean;
  hideArticle: boolean;
}

export function CardView({ card, dir, revealed, hideArticle }: Props) {
  const L = t();
  const speakButton = canSpeak() && (
    <button
      className="icon-btn"
      onClick={(e) => {
        e.stopPropagation();
        speak(spokenForm(card));
      }}
      title={L.common.speak}
      aria-label={L.common.speak}
    >
      <Icon name="speaker" />
    </button>
  );

  const gloss = (
    <div className="gloss">
      {card.en && (
        <>
          <span className="lang">EN</span>
          <span className="tr">{card.en}</span>
        </>
      )}
      {card.ru && (
        <>
          <span className="lang">RU</span>
          <span className="tr">{card.ru}</span>
        </>
      )}
    </div>
  );

  if (dir === 'rev') {
    const front = card.ru || card.en || card.definition;
    return (
      <>
        <div className="card-meta">
          <span>{L.review.reverseQuestion}</span>
          {revealed && speakButton}
        </div>
        <div className="headword reverse">
          <div className="word">{front}</div>
          {card.ru && card.en && <div className="sub">{card.en}</div>}
        </div>
        {revealed && (
          <div className="answer">
            <div className="answer-word">
              {card.article && <span className={`art-${card.article}`}>{card.article} </span>}
              {card.word}
            </div>
            {(card.forms || card.pos) && <Forms card={card} showPos />}
            {card.definition && <p className="definition">{card.definition}</p>}
            {card.example && (
              <p className="example">
                <Example text={card.example} />
              </p>
            )}
            {card.note && <p className="note">{card.note}</p>}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="card-meta">
        <span>{card.pos}</span>
        {speakButton}
      </div>
      <div className="headword">
        <Headword card={card} hideArticle={hideArticle && !revealed} />
        {revealed && card.ipa && <div className="ipa">[{card.ipa}]</div>}
      </div>
      {revealed && (
        <div className="answer">
          {card.forms && <Forms card={card} />}
          {card.definition && <p className="definition">{card.definition}</p>}
          {(card.en || card.ru) && gloss}
          {card.example && (
            <p className="example">
              <Example text={card.example} />
            </p>
          )}
          {card.note && <p className="note">{card.note}</p>}
        </div>
      )}
    </>
  );
}

function Forms({ card, showPos = false }: { card: CardFields; showPos?: boolean }) {
  return (
    <p className="forms">
      {showPos && card.pos && <span className="pos">{card.pos}</span>}
      {card.forms}
    </p>
  );
}
