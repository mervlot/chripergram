import { Fragment } from 'react';
import { Link } from 'react-router-dom';

// Splits text into plain segments, #hashtags, @mentions and URLs, rendering
// the special ones as React links. Because everything is rendered as text
// nodes / Link elements (never raw HTML), this is inherently XSS-safe.
const TOKEN_RE = /(#[\w]+|@[\w]+|https?:\/\/[^\s]+)/g;

export function RichText({ text }: { text: string }) {
  const parts = text.split(TOKEN_RE);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('#')) {
          return (
            <Link
              key={i}
              to={`/hashtag/${part.slice(1).toLowerCase()}`}
              className="text-brand hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }
        if (part.startsWith('@')) {
          return (
            <Link
              key={i}
              to={`/${part.slice(1)}`}
              className="text-brand hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-brand hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
