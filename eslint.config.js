// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

/**
 * The repository had no linter at all, which is how a dead `BumbleBee` component and
 * ten stray `console.log`s survived to production. The rules below are the ones that
 * catch real defects; style is left to formatting.
 */
export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      // shadcn primitives are vendored, and .agents/ is reference material the Clerk
      // Marketplace installer wrote. Neither is ours to lint.
      "src/components/ui/**",
      ".agents/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // Unused code is dead weight; `_`-prefixed args stay allowed for destructuring.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],

      // `any` erases the type safety the rest of the codebase depends on.
      "@typescript-eslint/no-explicit-any": "error",

      // console.error survives on purpose (the error boundary needs it); the rest
      // is debugging left behind.
      "no-console": ["error", { allow: ["error", "warn"] }],

      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-implicit-coercion": ["error", { boolean: false }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    // Tests reach into internals and assert on loose shapes.
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
