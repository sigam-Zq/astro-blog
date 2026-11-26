// 标签体系的唯一来源（站点 + `npm run new` 脚本共用）。
// 规则：
//  - 顶级只有 ROOTS 这 5 个；
//  - 标签最多 3 层（root > 二级 > 三级）；
//  - 每篇文章最多 MAX_TAGS_PER_POST 个标签（超出则构建失败）；
//  - 不在表里 / 追溯不到 ROOTS / 超过 3 层的标签，自动归入 Other。

export const MAX_DEPTH = 3;
export const MAX_TAGS_PER_POST = 3;
export const FALLBACK_ROOT = 'other';

/** @type {Record<string, { label: string }>} */
export const ROOTS = {
	life: { label: 'Life' },
	coding: { label: 'Coding' },
	infrastructure: { label: 'Infrastructure' },
	wow: { label: 'Wow' },
	other: { label: 'Other' },
};

/**
 * 非顶级标签：id -> { label, parent }。parent 必须是 ROOTS 的 key 或另一个标签 id。
 * @type {Record<string, { label: string, parent: string }>}
 */
export const TAGS = {
	// Coding
	go: { label: 'Go', parent: 'coding' },
	gin: { label: 'Gin', parent: 'go' },
	rust: { label: 'Rust', parent: 'coding' },
	frontend: { label: '前端', parent: 'coding' },
	threejs: { label: 'Three.js', parent: 'frontend' },
	webgl: { label: 'WebGL', parent: 'frontend' },
	wasm: { label: 'WebAssembly', parent: 'frontend' },
	database: { label: '数据库', parent: 'coding' },
	mysql: { label: 'MySQL', parent: 'database' },
	debug: { label: 'Debug', parent: 'coding' },
	// Infrastructure
	macos: { label: 'macOS', parent: 'infrastructure' },
	linux: { label: 'Linux', parent: 'infrastructure' },
	network: { label: 'Network', parent: 'infrastructure' },
	tun: { label: 'TUN', parent: 'network' },
	security: { label: 'Security', parent: 'infrastructure' },
	// Life / Wow 先留空位，需要时在这里加
};

/** 旧写法 / 拼写错误 -> 标准 id（key 一律小写；值可以是 ROOTS 或 TAGS 的 key） */
export const ALIASES = {
	code: 'coding',
	liunx: 'linux',
	safety: 'security',
	'3d': 'webgl',
	webassembly: 'wasm',
};

const lower = (s) => String(s).trim().toLowerCase();

/** 沿 parent 追溯到 root，返回 [root, ..., id]；追溯失败或超过 MAX_DEPTH 返回 null */
function pathOf(id) {
	const path = [];
	let cur = id;
	while (cur) {
		if (path.includes(cur)) return null; // 环
		path.unshift(cur);
		if (cur in ROOTS) return path.length <= MAX_DEPTH ? path : null;
		cur = TAGS[cur]?.parent;
	}
	return null;
}

const LOOKUP = new Map();
for (const [id, r] of Object.entries(ROOTS)) { LOOKUP.set(id, id); LOOKUP.set(lower(r.label), id); }
for (const [id, t] of Object.entries(TAGS)) { LOOKUP.set(id, id); LOOKUP.set(lower(t.label), id); }
for (const [a, id] of Object.entries(ALIASES)) LOOKUP.set(a, id);

/** 节点 id -> 显示名。未知 id 原样返回 */
export function labelOf(id) {
	return ROOTS[id]?.label ?? TAGS[id]?.label ?? id;
}

/** 是否是已登记的标签（含 root、别名） */
export function isKnownTag(raw) {
	const id = LOOKUP.get(lower(raw));
	return !!id && !!pathOf(id);
}

/**
 * 把 frontmatter 里的一个原始标签解析成层级路径。
 * 已登记 -> [root, ..., id]；否则 -> ['other', 原始标签小写]
 */
export function resolveTag(raw) {
	const id = LOOKUP.get(lower(raw));
	const path = id && pathOf(id);
	if (path) return path;
	const key = lower(raw);
	return key === FALLBACK_ROOT ? [FALLBACK_ROOT] : [FALLBACK_ROOT, key];
}

/** 文章的所有路径；没有标签的文章归入 Other */
export function resolvePostTags(tags) {
	const list = (tags ?? []).filter(Boolean);
	return list.length ? list.map(resolveTag) : [[FALLBACK_ROOT]];
}

/** 文章命中的全部节点 id（含祖先），用于层级筛选 */
export function postNodeIds(tags) {
	return new Set(resolvePostTags(tags).flat());
}

/** 未知标签的显示名需要原文；用 id 找回 */
export function displayLabel(id, rawTags = []) {
	if (ROOTS[id] || TAGS[id]) return labelOf(id);
	return rawTags.find((t) => lower(t) === id) ?? id;
}

/** 返回给 `npm run new` 用的可选标签列表（带层级前缀） */
export function listTagChoices() {
	const rows = [];
	const walk = (parent, depth) => {
		const kids = Object.entries(TAGS).filter(([, t]) => t.parent === parent);
		for (const [id, t] of kids) {
			rows.push({ id, label: t.label, depth });
			walk(id, depth + 1);
		}
	};
	for (const [rid, r] of Object.entries(ROOTS)) {
		rows.push({ id: rid, label: r.label, depth: 1 });
		walk(rid, 2);
	}
	return rows;
}
