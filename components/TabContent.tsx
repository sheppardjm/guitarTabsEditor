import React from "react";

// Renders raw tab text using Ultimate Guitar conventions:
//   [ch]Am[/ch]        -> highlighted chord
//   [tab]...[/tab]     -> tablature block (kept verbatim)
//   [Verse 1] on a line by itself -> section header
// Whitespace is significant everywhere (chords align above lyrics).

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\[ch\]([\s\S]*?)\[\/ch\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <span key={`${keyBase}-ch${i++}`} className="chord">
        {m[1]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderTextBlock(text: string, keyBase: string): React.ReactNode[] {
  return text.split("\n").map((line, i) => {
    const key = `${keyBase}-l${i}`;
    const header = line.match(/^\s*\[([^\]\n]+)\]\s*$/);
    if (header && !/^(ch|\/ch|tab|\/tab)$/i.test(header[1])) {
      return (
        <div key={key} className="section-header">
          {header[1]}
        </div>
      );
    }
    return (
      <div key={key} className="tab-line">
        {line ? renderInline(line, key) : " "}
      </div>
    );
  });
}

export default function TabContent({ content }: { content: string }) {
  const parts: React.ReactNode[] = [];
  const re = /\[tab\]([\s\S]*?)\[\/tab\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      parts.push(...renderTextBlock(content.slice(last, m.index), `t${i}`));
    }
    const inner = m[1].replace(/^\n+|\n+$/g, "");
    // Only box real tablature (string lines like e|---0---). UG also wraps
    // chord-over-lyric pairs in [tab] to keep them together; render those flat.
    const isTablature = /(^|\n)\s*[A-Ga-g][#b]?\s*\|.*-/.test(inner);
    parts.push(
      isTablature ? (
        <div key={`tab${i}`} className="tab-block">
          {renderTextBlock(inner, `tb${i}`)}
        </div>
      ) : (
        <React.Fragment key={`tab${i}`}>
          {renderTextBlock(inner, `tb${i}`)}
        </React.Fragment>
      )
    );
    last = m.index + m[0].length;
    i++;
  }
  if (last < content.length) {
    parts.push(...renderTextBlock(content.slice(last), `t-end`));
  }
  return <div className="tab-content font-mono">{parts}</div>;
}
