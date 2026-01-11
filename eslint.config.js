import prettier from "eslint-config-prettier";
import { fileURLToPath } from "node:url";
import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import testingLibrary from "eslint-plugin-testing-library";
import vitest from "eslint-plugin-vitest";
import { defineConfig } from "eslint/config";
import globals from "globals";
import ts from "typescript-eslint";
import svelteConfig from "./svelte.config.js";

const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

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
      "no-restricted-syntax": [
        "error",
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
