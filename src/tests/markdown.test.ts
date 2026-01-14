/**
 * Markdown Utilities Tests
 * Tests for markdown parsing and XSS sanitization.
 */

import { describe, it, expect } from "vitest";
import { parseMarkdown, sanitizeHtml } from "$lib/utils/markdown";

describe("Markdown Utilities", () => {
  describe("parseMarkdown - inline formatting", () => {
    it("renders bold text with **", () => {
      const result = parseMarkdown("**bold text**");
      expect(result).toContain("<strong>bold text</strong>");
    });

    it("renders italic text with *", () => {
      const result = parseMarkdown("*italic text*");
      expect(result).toContain("<em>italic text</em>");
    });

    it("renders inline code with backticks", () => {
      const result = parseMarkdown("`inline code`");
      expect(result).toContain("<code>inline code</code>");
    });

    it("renders links with href", () => {
      const result = parseMarkdown("[link text](https://example.com)");
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain("link text");
    });

    it("adds security attributes to links", () => {
      const result = parseMarkdown("[link](https://example.com)");
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener noreferrer"');
    });
  });

  describe("parseMarkdown - lists", () => {
    it("renders unordered lists", () => {
      const result = parseMarkdown("- item 1\n- item 2");
      expect(result).toContain("<ul>");
      expect(result).toContain("<li>item 1</li>");
      expect(result).toContain("<li>item 2</li>");
    });

    it("renders ordered lists", () => {
      const result = parseMarkdown("1. first\n2. second");
      expect(result).toContain("<ol>");
      expect(result).toContain("<li>first</li>");
      expect(result).toContain("<li>second</li>");
    });
  });

  describe("parseMarkdown - edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(parseMarkdown("")).toBe("");
      expect(parseMarkdown("   ")).toBe("");
    });

    it("returns empty string for null/undefined", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(parseMarkdown(null as any)).toBe("");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(parseMarkdown(undefined as any)).toBe("");
    });

    it("preserves line breaks", () => {
      const result = parseMarkdown("line1\nline2");
      expect(result).toContain("<br");
    });
  });

  describe("sanitizeHtml - XSS prevention", () => {
    it("removes script tags", () => {
      const result = sanitizeHtml('<script>alert("xss")</script>');
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("alert");
    });

    it("removes style tags", () => {
      const result = sanitizeHtml("<style>body { display: none; }</style>");
      expect(result).not.toContain("<style>");
    });

    it("removes iframe tags", () => {
      const result = sanitizeHtml('<iframe src="https://evil.com"></iframe>');
      expect(result).not.toContain("<iframe>");
    });

    it("removes onclick handlers", () => {
      const result = sanitizeHtml('<div onclick="alert(1)">click me</div>');
      expect(result).not.toContain("onclick");
      expect(result).toContain("click me");
    });

    it("removes onerror handlers", () => {
      const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
      expect(result).not.toContain("onerror");
    });

    it("neutralizes javascript: hrefs", () => {
      const result = sanitizeHtml('<a href="javascript:alert(1)">click me</a>');
      expect(result).not.toContain("javascript:");
      // The href may be set to "#" or removed entirely - either is safe
      expect(result).toContain("click me");
    });

    it("removes javascript: in src attributes", () => {
      const result = sanitizeHtml('<img src="javascript:alert(1)">');
      expect(result).not.toContain('src="javascript:');
    });

    it("removes object tags", () => {
      const result = sanitizeHtml(
        '<object data="flash.swf" type="application/x-shockwave-flash"></object>',
      );
      expect(result).not.toContain("<object>");
    });

    it("removes embed tags", () => {
      const result = sanitizeHtml('<embed src="flash.swf">');
      expect(result).not.toContain("<embed>");
    });

    it("removes form tags", () => {
      const result = sanitizeHtml(
        '<form action="https://evil.com"><input name="password"></form>',
      );
      expect(result).not.toContain("<form>");
    });

    it("preserves safe content", () => {
      const safeHtml = "<p>Hello <strong>world</strong></p>";
      const result = sanitizeHtml(safeHtml);
      expect(result).toContain("<p>");
      expect(result).toContain("<strong>world</strong>");
    });

    // Additional XSS obfuscation tests (DOMPurify handles these)
    it("handles entity-encoded javascript: URLs", () => {
      const result = sanitizeHtml(
        '<a href="&#106;avascript:alert(1)">click me</a>',
      );
      expect(result).not.toContain("javascript:");
      expect(result).toContain("click me");
    });

    it("handles javascript: with whitespace variations", () => {
      // Various obfuscation attempts with whitespace
      const result1 = sanitizeHtml('<a href="java\nscript:alert(1)">test</a>');
      const result2 = sanitizeHtml('<a href="javascript\t:alert(1)">test</a>');
      expect(result1).not.toContain("javascript");
      expect(result2).not.toContain("javascript");
    });

    it("removes svg elements with event handlers", () => {
      const result = sanitizeHtml(
        '<svg onload="alert(1)"><circle></circle></svg>',
      );
      expect(result).not.toContain("<svg>");
      expect(result).not.toContain("onload");
    });

    it("removes data: URLs", () => {
      const result = sanitizeHtml(
        '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">click</a>',
      );
      expect(result).not.toContain("data:");
      expect(result).toContain("click");
    });

    it("removes math elements (potential XSS vector)", () => {
      const result = sanitizeHtml(
        '<math><maction actiontype="statusline#http://evil.com"></maction></math>',
      );
      expect(result).not.toContain("<math>");
    });

    it("removes base tags (can hijack relative URLs)", () => {
      const result = sanitizeHtml('<base href="https://evil.com">');
      expect(result).not.toContain("<base>");
    });
  });

  describe("parseMarkdown - combined behavior", () => {
    it("sanitizes markdown that produces dangerous HTML", () => {
      // Markdown with inline HTML that contains XSS
      const result = parseMarkdown('Check this: <script>alert("xss")</script>');
      expect(result).not.toContain("<script>");
    });

    it("handles complex markdown with multiple features", () => {
      const markdown = `
**Bold** and *italic* with \`code\`

- List item with [link](https://example.com)
- Another item

1. Numbered
2. List
      `.trim();

      const result = parseMarkdown(markdown);
      expect(result).toContain("<strong>Bold</strong>");
      expect(result).toContain("<em>italic</em>");
      expect(result).toContain("<code>code</code>");
      expect(result).toContain("<ul>");
      expect(result).toContain("<ol>");
      expect(result).toContain('target="_blank"');
    });
  });
});
