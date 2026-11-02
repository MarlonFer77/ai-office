'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders untrusted model output as Markdown. Raw HTML is never rendered. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-agent">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => (/^(https?:|mailto:|#)/i.test(url) ? url : '')}
        components={{ a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer nofollow" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
