import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';
import { MAX_TAGS_PER_POST } from './data/taxonomy.mjs';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: z.object({
		title: z.string(),
		description: z.string(),
		// Transform string to Date object
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),
		// 层级见 src/data/taxonomy.mjs；未登记的标签自动归入 Other，但数量最多 3 个
		tags: z.array(z.string()).max(MAX_TAGS_PER_POST).optional(),
		hidden: z.boolean().optional(),
	}),
});

export const collections = { blog };
