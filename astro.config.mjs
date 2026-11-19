// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import preact from '@astrojs/preact';

// https://astro.build/config
export default defineConfig({
	site: 'https://blogs.zqsrh.com',
	vite: { server: { proxy: { '/api': process.env.DIARY_DEV_API_TARGET || 'http://127.0.0.1:8080' } } },
	markdown: {
		syntaxHighlight: { type: 'shiki', excludeLangs: ['mermaid'] },
	},
	integrations: [mdx(), sitemap({ filter: (page) => !new URL(page).pathname.startsWith('/diary') }), tailwind(), preact()],
});
