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
