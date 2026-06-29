import prettier from "eslint-config-prettier";
import { fileURLToPath } from "node:url";
import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import testingLibrary from "eslint-plugin-testing-library";
import vitest from "@vitest/eslint-plugin";
import { defineConfig } from "eslint/config";
import globals from "globals";
import ts from "typescript-eslint";
import svelteConfig from "./svelte.config.js";

const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

// Shared no-restricted-syntax entries for all test files (unit + E2E).
// Defined once so the E2E block can extend rather than replace them: in flat
// config a later block that re-declares a rule overrides the earlier value
// entirely, so the E2E block must re-list these to keep them in force.
const testRestrictedSyntax = [
  {
    selector:
      'CallExpression[callee.property.name="toHaveLength"][arguments.0.type="Literal"]',
    message:
      "Avoid exact length assertions on data arrays (breaks on additions). Use .length > 0 for existence checks. For behavioral invariants (deduplication, pagination), use eslint-disable-next-line with justification.",
  },
  {
    selector:
      'CallExpression[callee.property.name="toBe"][arguments.0.value=/^#/]',
    message:
      "Avoid hardcoded color assertions - breaks on design token changes. Test user-visible behavior instead.",
  },
  {
    selector: 'CallExpression[callee.property.name="toHaveClass"]',
    message:
      "Avoid CSS class assertions - tests implementation details. Use testing-library queries instead.",
  },
  {
    selector:
      'BinaryExpression[operator="==="][left.operator="typeof"][right.value="function"]',
    message:
      "Avoid function existence checks - TypeScript already validates this. Test behavior instead.",
  },
];

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
      // see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
      "no-undef": "off",
      // Allow @ts-nocheck during strict mode burndown (see #1609)
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-nocheck": false,
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
          "ts-ignore": "allow-with-description",
        },
      ],
      // Allow unused variables that start with underscore
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
        svelteConfig,
      },
    },
    rules: {
      // Regression guard: block raw {@html} sinks. Every legitimate sink must
      // carry an inline eslint-disable with provenance explaining why it is safe.
      "svelte/no-at-html-tags": "error",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    plugins: {
      vitest,
      "testing-library": testingLibrary,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // Vitest globals
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly",
      },
    },
    rules: {
      // Block querySelector and DOM node access in tests
      "testing-library/no-container": "error",
      "testing-library/no-node-access": "error",

      // Block patterns via no-restricted-syntax
      "no-restricted-syntax": ["error", ...testRestrictedSyntax],
    },
  },
  {
    // E2E (Playwright) selector convention: prefer role/testid/label locators
    // over brittle CSS class selectors. Flags inline string literals passed to
    // .locator() that start with a class (`.`), e.g. page.locator(".rack-header").
    // It does NOT flag the centralised `locators` registry (member expressions),
    // getByRole/getByTestId/getByLabel/getByText, attribute/id/tag selectors, or
    // Playwright text-engine locators such as `label:has-text("...")`.
    // Re-lists the shared test restrictions because a re-declared rule in a later
    // flat-config block replaces, rather than merges with, the earlier value.
    files: ["e2e/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...testRestrictedSyntax,
        {
          selector:
            'CallExpression[callee.property.name="locator"][arguments.0.type="Literal"][arguments.0.value=/^\\s*\\./]',
          message:
            "Avoid CSS class selectors in E2E locators - they break on styling changes. Prefer getByRole()/getByTestId()/getByLabel(), or add the selector to e2e/helpers/locators.ts. See docs/guides/TESTING.md.",
        },
      ],
    },
  },
  {
    // Storage seam: everything outside src/lib/storage imports the barrel,
    // never deep paths (tests may reach into internals).
    files: ["src/**/*.ts", "src/**/*.svelte"],
    ignores: ["src/lib/storage/**", "src/tests/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["$lib/storage/*"],
              message:
                "Import from the $lib/storage barrel instead of deep paths.",
            },
          ],
        },
      ],
    },
  },
  {
    // Storage access seam: block raw Web Storage member calls so reads/writes
    // go through the safe-storage helpers, which swallow access failures
    // (private mode, quota, disabled storage). The seam itself is exempted in
    // the block below. no-restricted-properties has no per-rule path scoping in
    // flat config, so scoping is expressed with files/ignores across two blocks.
    files: ["src/**/*.ts", "src/**/*.js", "src/**/*.svelte"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "localStorage",
          property: "getItem",
          message:
            "Use safeGetItem from $lib/utils/safe-storage instead of localStorage.getItem.",
        },
        {
          object: "localStorage",
          property: "setItem",
          message:
            "Use safeSetItem from $lib/utils/safe-storage instead of localStorage.setItem.",
        },
        {
          object: "localStorage",
          property: "removeItem",
          message:
            "Use safeRemoveItem from $lib/utils/safe-storage instead of localStorage.removeItem.",
        },
        {
          object: "sessionStorage",
          property: "getItem",
          message:
            "Use safeGetItem(key, 'session') from $lib/utils/safe-storage instead of sessionStorage.getItem.",
        },
        {
          object: "sessionStorage",
          property: "setItem",
          message:
            "Use safeSetItem(key, value, 'session') from $lib/utils/safe-storage instead of sessionStorage.setItem.",
        },
        {
          object: "sessionStorage",
          property: "removeItem",
          message:
            "Use safeRemoveItem(key, 'session') from $lib/utils/safe-storage instead of sessionStorage.removeItem.",
        },
      ],
    },
  },
  {
    // Storage access seam exemption: the helpers and the storage barrel are the
    // one place allowed to touch Web Storage directly. Tests are also exempt so
    // they can seed, mock, and assert persistence against raw Web Storage. This
    // covers both the src/tests tree and co-located *.test.ts/*.spec.ts files
    // (for example src/lib/utils/netbox-import.test.ts).
    files: [
      "src/lib/storage/**",
      "src/lib/utils/safe-storage.ts",
      "src/tests/**",
      "**/*.test.ts",
      "**/*.spec.ts",
    ],
    rules: {
      "no-restricted-properties": "off",
    },
  },
  {
    ignores: [
      "build/",
      ".svelte-kit/",
      "dist/",
      "node_modules/",
      "coverage/",
      "docs/research/",
    ],
  },
);
