import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default [
  ...nextCoreWebVitals,
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
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [".next/**", "node_modules/**"],
  },
];
