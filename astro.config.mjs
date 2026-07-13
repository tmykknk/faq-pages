// @ts-check
import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
    adapter: cloudflare(),
    vite: {
        build: {
            // Keep client scripts external so the strict `script-src 'self'`
            // Content Security Policy can allow them without `unsafe-inline`.
            assetsInlineLimit: 0,
        },
    },
});
