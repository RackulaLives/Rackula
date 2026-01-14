/**
 * Markdown utilities for parsing and sanitizing user-provided markdown content.
 * Uses the marked library for parsing with custom configuration for security.
 */
import { marked, type MarkedOptions } from "marked";

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
 */
const secureRenderer = new marked.Renderer();
const originalLinkRenderer = secureRenderer.link.bind(secureRenderer);

secureRenderer.link = function (href, title, text) {
  const html = originalLinkRenderer(href, title, text);
  return html.replace("<a ", '<a target="_blank" rel="noopener noreferrer" ');
};

/**
 * List of HTML tags that are dangerous and should be removed.
 */
const DANGEROUS_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
] as const;

/**
 * Sanitizes HTML to prevent XSS attacks.
 *
 * Removes:
 * - Dangerous tags (script, style, iframe, etc.)
 * - Event handler attributes (onclick, onerror, etc.)
 * - javascript: URLs in href and src attributes
 *
 * @param html - Raw HTML string to sanitize
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHtml(html: string): string {
  // Use DOMParser for proper HTML parsing
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Remove dangerous elements
  for (const tag of DANGEROUS_TAGS) {
    const elements = doc.getElementsByTagName(tag);
    while (elements.length > 0) {
      elements[0].remove();
    }
  }

  // Remove dangerous attributes from all elements
  const allElements = doc.body.getElementsByTagName("*");
  for (const element of allElements) {
    // Remove event handlers (onclick, onerror, etc.) and javascript: in attribute values
    const attrs = [...element.attributes];
    for (const attr of attrs) {
      if (
        attr.name.startsWith("on") ||
        attr.value.toLowerCase().includes("javascript:")
      ) {
        element.removeAttribute(attr.name);
      }
    }

    // Remove src attributes with javascript: protocol
    if (
      element.hasAttribute("src") &&
      element.getAttribute("src")?.toLowerCase().includes("javascript:")
    ) {
      element.removeAttribute("src");
    }

    // Neutralize href attributes with javascript: protocol
    if (
      element.hasAttribute("href") &&
      element.getAttribute("href")?.toLowerCase().startsWith("javascript:")
    ) {
      element.setAttribute("href", "#");
    }
  }

  return doc.body.innerHTML;
}

/**
 * Parses markdown to HTML with security measures.
 *
 * Features:
 * - GFM support for lists
 * - Line breaks preserved
 * - Links open in new tabs with security attributes
 * - HTML sanitized to prevent XSS
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
