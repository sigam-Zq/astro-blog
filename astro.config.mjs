// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import preact from '@astrojs/preact';

// https://astro.build/config
export default defineConfig({
	site: 'https://blogs.zqsrh.com',
	integrations: [mdx(), sitemap(), tailwind(), preact()],
});