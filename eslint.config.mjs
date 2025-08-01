import globals from "globals";
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["src/main/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
      ecmaVersion: 2023,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off", // 主进程需要 console
      "prefer-const": "warn",
      "no-var": "error",
      "no-undef": "error",
      "eqeqeq": "warn",
      "curly": "warn",
    },
  },
  {
    files: ["src/renderer/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: globals.browser,
      ecmaVersion: 2023,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "warn", // 渲染进程尽量减少 console
      "prefer-const": "warn",
      "no-var": "error",
      "no-undef": "error",
      "eqeqeq": "warn",
      "curly": "warn",
    },
  },
  {
    files: ["src/renderer/preload.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      ecmaVersion: 2023,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "warn",
      "prefer-const": "warn",
      "no-var": "error",
      "no-undef": "error",
    },
  },
  {
    files: ["*.config.js", "*.config.mjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
      ecmaVersion: 2023,
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: ["out/", "node_modules/", "native/"],
  },
];
