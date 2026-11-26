import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist", "node_modules", ".vercel"] },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["warn", { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_" }],
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: ["badgeVariants", "buttonVariants"],
        },
      ],
    },
  },
  {
    files: ["src/context/**/*.{js,jsx}", "src/routes.jsx", "src/test/**/*.{js,jsx}", "**/*.test.{js,jsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
];
