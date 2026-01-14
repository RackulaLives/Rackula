/**
 * Markdown utilities for parsing and sanitizing user-provided markdown content.
 * Uses the marked library for parsing with DOMPurify for XSS protection.
 */
import { marked, type MarkedOptions, type Tokens } from "marked";
import DOMPurify from "dompurify";

/**
 * Configuration for marked parser.
 * Enables GFM for lists and breaks for newline handling.
 */
const markedOptions: MarkedOptions = {
  gfm: true,
  breaks: true,
  async: false,
};

/**
 * Custom renderer that adds security attributes to links.
 * All links open in new tabs with noopener noreferrer.
 * Uses marked v17 token-based API.
 */
const secureRenderer = new marked.Renderer();
const originalLinkRenderer = secureRenderer.link.bind(secureRenderer);

secureRenderer.link = function (token: Tokens.Link) {
  const html = originalLinkRenderer(token);
  return html.replace("<a ", '<a target="_blank" rel="noopener noreferrer" ');
};

/**
 * Configure DOMPurify for safe markdown rendering.
 * Allow only elements that markdown can produce.
 */
const purifyConfig: DOMPurify.Config = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "code",
    "pre",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "hr",
    "del",
    "s",
  ],
  ALLOWED_ATTR: ["href", "target", "rel"],
  // Force all links to open in new tab
  ADD_ATTR: ["target", "rel"],
};

/**
 * Sanitizes HTML to prevent XSS attacks using DOMPurify.
 *
 * @param html - Raw HTML string to sanitize
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHtml(html: string): string {
  // DOMPurify.sanitize handles all XSS vectors including:
  // - Dangerous tags (script, style, iframe, svg, etc.)
  // - Event handler attributes (onclick, onerror, etc.)
  // - javascript: and data: URLs
  // - Entity-encoded and obfuscated attacks
  const clean = DOMPurify.sanitize(html, purifyConfig);

  // Post-process to ensure links have security attributes
  // DOMPurify strips target/rel if not in ALLOWED_ATTR, so we re-add them
  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}

/**
 * Parses markdown to HTML with security measures.
 *
 * Features:
 * - GFM support for lists
 * - Line breaks preserved
 * - Links open in new tabs with security attributes
 * - HTML sanitized via DOMPurify to prevent XSS
 *
 * @param markdown - Raw markdown string to parse
 * @returns Sanitized HTML string
 */
export function parseMarkdown(markdown: string): string {
  if (!markdown?.trim()) return "";

  try {
    const rawHtml = marked(markdown, {
      ...markedOptions,
      renderer: secureRenderer,
    }) as string;
    return sanitizeHtml(rawHtml);
  } catch {
    // If parsing fails, escape and return as plain text
    return markdown
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
