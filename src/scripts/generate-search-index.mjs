import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BLOG_DIR = join(__dirname, '../content/blog');
const OUTPUT_PATH = join(__dirname, '../../public/search-index.json');

function parseFrontmatter(content) {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
	const match = content.match(frontmatterRegex);

	if (!match) return {};

	const frontmatter = {};
	const lines = match[1].split('\n');

	let currentKey = '';
	let currentValue = '';
	let inArray = false;
	let arrayValues = [];

	for (const line of lines) {
		const keyMatch = line.match(/^(\w+):\s*/);

		if (keyMatch) {
			// Save previous key-value pair
			if (currentKey) {
				if (inArray) {
					frontmatter[currentKey] = arrayValues;
				} else {
					frontmatter[currentKey] = currentValue.trim();
				}
			}

			currentKey = keyMatch[1];
			const rest = line.slice(keyMatch[0].length).trim();

			if (rest === '') {
				inArray = false;
				arrayValues = [];
				currentValue = '';
			} else if (rest.startsWith('[')) {
				inArray = true;
				arrayValues = rest.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''));
				currentValue = '';
			} else {
				currentValue = rest.replace(/^["']|["']$/g, '');
				inArray = false;
				arrayValues = [];
			}
		} else if (inArray && line.trim().startsWith('-')) {
			arrayValues.push(line.trim().slice(1).trim().replace(/^["']|["']$/g, ''));
		}
	}

	// Save last key-value pair
	if (currentKey) {
		if (inArray) {
			frontmatter[currentKey] = arrayValues;
		} else {
			frontmatter[currentKey] = currentValue.trim();
		}
	}

	return frontmatter;
}

function getAllFiles(dir, files = []) {
	const items = readdirSync(dir);

	for (const item of items) {
		const fullPath = join(dir, item);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			getAllFiles(fullPath, files);
		} else if (['.md', '.mdx'].includes(extname(item))) {
			files.push(fullPath);
		}
	}

	return files;
}

function generateSearchIndex() {
	const files = getAllFiles(BLOG_DIR);
	const searchIndex = [];

	for (const file of files) {
		try {
			const content = readFileSync(file, 'utf-8');
			const frontmatter = parseFrontmatter(content);

			if (frontmatter.hidden === 'true') continue;

			const id = basename(file, extname(file));
			const url = `/blog/${id}/`;

			searchIndex.push({
				id,
				title: frontmatter.title || '',
				description: frontmatter.description || '',
				pubDate: frontmatter.pubDate || '',
				heroImage: frontmatter.heroImage,
				tags: frontmatter.tags || [],
				url,
			});
		} catch (error) {
			console.error(`Error processing ${file}:`, error);
		}
	}

	// Sort by pubDate descending
	searchIndex.sort((a, b) => {
		const dateA = new Date(a.pubDate).getTime() || 0;
		const dateB = new Date(b.pubDate).getTime() || 0;
		return dateB - dateA;
	});

	writeFileSync(OUTPUT_PATH, JSON.stringify(searchIndex, null, 2));
	console.log(`Generated search index with ${searchIndex.length} entries at ${OUTPUT_PATH}`);
}

generateSearchIndex();