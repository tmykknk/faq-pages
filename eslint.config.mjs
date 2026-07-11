import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

const typedRules = {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-argument": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-return": "error",
    "@typescript-eslint/no-unused-vars": "error",
};

export default defineConfig(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...astro.configs.recommended,
    {
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
            parserOptions: { projectService: true },
        },
        rules: typedRules,
    },
    {
        files: ["**/*.astro"],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
                project: "./tsconfig.eslint.json",
                extraFileExtensions: [".astro"],
            },
        },
        rules: typedRules,
    },
    {
        ignores: [
            "dist/",
            ".astro/",
            ".wrangler/",
            "worker-configuration.d.ts",
        ],
    },
);
