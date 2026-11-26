#!/usr/bin/env node
// 新建文章：npm run new
//   npm run new                                  交互式
//   npm run new -- "标题" -s my-slug -t go,gin   非交互
import { existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { listTagChoices, isKnownTag, resolveTag, labelOf, MAX_TAGS_PER_POST } from '../src/data/taxonomy.mjs';

const dir = fileURLToPath(new URL('../src/content/blog/', import.meta.url));
const args = process.argv.slice(2);
const opt = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
let title = args.find((a, i) => !a.startsWith('-') && !['-s', '-t', '-d'].includes(args[i - 1]));
let slug = opt('-s');
let tagInput = opt('-t');
let description = opt('-d') ?? '';

const slugify = (s) =>
	s.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

if (!title || tagInput === undefined) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	title ||= (await rl.question('标题: ')).trim();
	slug ||= (await rl.question(`文件名 slug [${slugify(title) || 'new-post'}]: `)).trim();
	description ||= (await rl.question('描述 (可空): ')).trim();
	if (tagInput === undefined) {
		console.log('\n可用标签 (id)：');
		for (const c of listTagChoices()) console.log(`${'  '.repeat(c.depth - 1)}${c.id}${c.depth === 1 ? '' : ''}  ${c.label}`);
		tagInput = await rl.question(`\n标签 id，逗号分隔，最多 ${MAX_TAGS_PER_POST} 个 (可空): `);
	}
	rl.close();
}

if (!title) { console.error('需要标题'); process.exit(1); }
slug = slugify(slug || title) || 'new-post';
const tags = (tagInput ?? '').split(',').map((t) => t.trim()).filter(Boolean);
if (tags.length > MAX_TAGS_PER_POST) { console.error(`最多 ${MAX_TAGS_PER_POST} 个标签，当前 ${tags.length} 个`); process.exit(1); }
for (const t of tags) {
	if (!isKnownTag(t)) console.warn(`⚠ 标签 "${t}" 不在 taxonomy 里，将归入 Other（要加到分类请编辑 src/data/taxonomy.mjs）`);
}

const file = `${dir}${slug}.md`;
if (existsSync(file)) { console.error(`已存在: ${file}`); process.exit(1); }

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const front = [
	'---',
	`title: ${q(title)}`,
	`description: ${q(description)}`,
	`pubDate: ${new Date().toISOString().slice(0, 10)}`,
	tags.length ? `tags:\n${tags.map((t) => `  - ${isKnownTag(t) ? labelOf(resolveTag(t).at(-1)) : t}`).join('\n')}` : 'tags: []',
	'# hidden: true   # 草稿：取消注释后不会出现在列表',
	'---',
	'',
	'## 前言',
	'',
	'',
].join('\n');

writeFileSync(file, front);
console.log(`✔ 已创建 src/content/blog/${slug}.md`);
