import DOMPurify from 'dompurify'
import { Marked } from 'marked'

// A single configured instance: GitHub-flavoured line breaks, no raw HTML
// passthrough (LLM output is untrusted, so we never let it inject markup).
const marked = new Marked({
  gfm: true,
  breaks: true,
})

// Force every link to open safely in a new tab.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer nofollow')
  }
})

/**
 * Convert markdown emitted by the agent into sanitized HTML.
 * Returns an empty string for empty input so callers can `v-html` safely.
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''
  const html = marked.parse(text, { async: false }) as string
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'del',
      'code',
      'pre',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'h1',
      'h2',
      'h3',
      'h4',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
  })
}
