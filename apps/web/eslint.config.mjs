import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // Enforce consistent imports
      "no-duplicate-imports": "error",

      // Prevent common bugs
      "no-self-compare": "error",
      "no-template-curly-in-string": "warn",

      // React best practices
      "react/self-closing-comp": "warn",
      "react/jsx-no-useless-fragment": "warn",

      // Hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Allow unused vars prefixed with _
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [".next/**", "node_modules/**"],
  },
];
