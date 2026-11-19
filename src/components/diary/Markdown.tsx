import { useMemo } from "preact/hooks";
import { Marked } from "marked";
import DOMPurify from "dompurify";

// Reuse the versions already present in the site's dependency tree. Raw HTML
// and images never enter the output, and a final allowlist constrains HTML.
const parser = new Marked({ gfm: true, breaks: false });
parser.use({
  renderer: {
    html() {
      return "";
    },
    image({ text }) {
      return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    },
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!/^(https?:|mailto:)/i.test(href)) return text;
      const safe = href
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${text}</a>`;
    },
  },
});
export default function Markdown({ content }: { content: string }) {
  const html = useMemo(
    () =>
      DOMPurify.sanitize(parser.parse(content, { async: false }), {
        ALLOWED_TAGS: [
          "p",
          "br",
          "strong",
          "em",
          "del",
          "blockquote",
          "pre",
          "code",
          "ul",
          "ol",
          "li",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "hr",
          "a",
          "table",
          "thead",
          "tbody",
          "tr",
          "th",
          "td",
        ],
        ALLOWED_ATTR: [
          "href",
          "title",
          "target",
          "rel",
          "referrerpolicy",
          "start",
          "align",
        ],
        ALLOW_DATA_ATTR: false,
      }),
    [content]
  );
  return (
    <div
      class="diary-markdown prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
