import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import Fuse from 'fuse.js';
import { Fragment } from 'preact';
import { ROOTS, resolvePostTags, resolveTag, postNodeIds, displayLabel } from '../data/taxonomy.mjs';

import { ROOT_ICON, hueOf } from '../data/rootStyle';
const Icon = ({ id }: { id: string }) => (
	<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d={ROOT_ICON[id] ?? ROOT_ICON.other} />
	</svg>
);

interface Post {
	id: string;
	data: {
		title: string;
		description: string;
		pubDate: Date;
		heroImage?: string;
		tags?: string[];
		hidden?: boolean;
	};
}

interface Props {
	posts: Post[];
	postsPerPage?: number;
}

export default function BlogList({ posts, postsPerPage = 10 }: Props) {
	const [currentPage, setCurrentPage] = useState(1);
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [searchQuery, setSearchQuery] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	// Initialize from URL
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const first = params.get('tag')?.split(',').filter(Boolean)[0];
		const tags = first ? [resolveTag(first).at(-1)!] : [];
		const page = parseInt(params.get('page') || '1', 10);
		const q = params.get('q') || '';
		setSelectedTags(tags);
		setCurrentPage(page);
		setSearchQuery(q);
	}, []);

	// Focus search via ?focus=search, "/" or Cmd/Ctrl+K
	useEffect(() => {
		if (new URLSearchParams(window.location.search).get('focus') === 'search') {
			inputRef.current?.focus();
		}
		const onKey = (e: KeyboardEvent) => {
			const el = e.target as HTMLElement;
			const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
			if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
				e.preventDefault();
				inputRef.current?.focus();
				inputRef.current?.select();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	// Update URL when state changes
	useEffect(() => {
		const params = new URLSearchParams();
		if (selectedTags.length > 0) {
			params.set('tag', selectedTags.join(','));
		}
		if (currentPage > 1) {
			params.set('page', String(currentPage));
		}
		if (searchQuery) {
			params.set('q', searchQuery);
		}
		const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
		history.replaceState({}, '', newUrl);
	}, [selectedTags, currentPage, searchQuery]);

	// Tag tree: node id -> { label, parent, count }
	const tree = useMemo(() => {
		const nodes = new Map<string, { id: string; label: string; parent?: string; count: number }>();
		posts.forEach(post => {
			const seen = new Set<string>();
			resolvePostTags(post.data.tags).forEach((path: string[]) => path.forEach((id, i) => {
				if (!nodes.has(id)) nodes.set(id, { id, label: displayLabel(id, post.data.tags), parent: path[i - 1], count: 0 });
				if (!seen.has(id)) { seen.add(id); nodes.get(id)!.count++; }
			}));
		});
		return nodes;
	}, [posts]);

	const childrenOf = (parent?: string) => {
		const list = [...tree.values()].filter(n => n.parent === parent);
		if (!parent) {
			const order = Object.keys(ROOTS);
			return list.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
		}
		return list.sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
	};

	// Navigation model: root tabs + the drill-down panel of the active root
	const nav = useMemo(() => {
		const active = selectedTags[0];
		const chain: string[] = [];
		for (let id = active; id && tree.has(id); id = tree.get(id)!.parent as string) chain.unshift(id);
		const root = chain[0];
		// show children of the active node; for a leaf, show its siblings so you can switch sideways
		const focus = active && childrenOf(active).length ? active : tree.get(active ?? '')?.parent;
		const items = root ? childrenOf(focus).map(n => ({ ...n, drill: childrenOf(n.id).length > 0 })) : [];
		return { roots: childrenOf(undefined), chain, root, focus, items };
	}, [tree, selectedTags]);

	// Sliding highlight behind the active root tab
	const dockRef = useRef<HTMLDivElement>(null);
	const [blob, setBlob] = useState({ x: 0, w: 0, ready: false });
	useLayoutEffect(() => {
		const place = () => {
			const dock = dockRef.current;
			const el = dock?.querySelector<HTMLElement>(`[data-root="${nav.root ?? 'all'}"]`);
			if (!dock || !el) return;
			setBlob(b => ({ x: el.offsetLeft, w: el.offsetWidth, ready: b.ready || b.w > 0 }));
			const over = el.offsetLeft + el.offsetWidth - (dock.scrollLeft + dock.clientWidth);
			if (over > 0 || el.offsetLeft < dock.scrollLeft) dock.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' });
		};
		place();
		window.addEventListener('resize', place);
		return () => window.removeEventListener('resize', place);
	}, [nav.root, nav.roots.length]);

	// Keep last panel content while it collapses
	const lastNav = useRef(nav);
	if (nav.root) lastNav.current = nav;
	const panel = nav.root ? nav : lastNav.current;
	const maxCount = Math.max(1, ...panel.items.map(n => n.count));

	// Setup Fuse.js for search
	const fuse = useMemo(() => {
		return new Fuse(posts, {
			keys: ['data.title', 'data.description'],
			threshold: 0.3,
			includeScore: true,
		});
	}, [posts]);

	// Filter posts
	const filteredPosts = useMemo(() => {
		let result = posts;

		// Apply tag filter
		if (selectedTags.length > 0) {
			result = result.filter(post =>
				postNodeIds(post.data.tags).has(selectedTags[0])
			);
		}

		// Apply search
		if (searchQuery.trim()) {
			const searchResults = fuse.search(searchQuery);
			const searchedIds = new Set(searchResults.map(r => r.item.id));
			result = result.filter(post => searchedIds.has(post.id));
		}

		return result;
	}, [posts, selectedTags, searchQuery, fuse]);

	// Pagination
	const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
	const startIndex = (currentPage - 1) * postsPerPage;
	const paginatedPosts = filteredPosts.slice(startIndex, startIndex + postsPerPage);

	// Reset to page 1 when filters change
	useEffect(() => {
		setCurrentPage(1);
	}, [selectedTags, searchQuery]);

	const toggleTag = (id: string) => {
		// click selected node again -> step back to its parent
		setSelectedTags(prev => prev[0] === id ? (tree.get(id)?.parent ? [tree.get(id)!.parent!] : []) : [id]);
	};
	const pickRoot = (id?: string) => setSelectedTags(!id || nav.root === id ? [] : [id]);

	const clearTags = () => {
		setSelectedTags([]);
	};

	const goToPage = (page: number) => {
		setCurrentPage(page);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	// Group current page by year
	const groups = useMemo(() => {
		const map: { year: number; items: Post[] }[] = [];
		paginatedPosts.forEach(post => {
			const year = post.data.pubDate.getFullYear();
			const last = map[map.length - 1];
			if (last && last.year === year) last.items.push(post);
			else map.push({ year, items: [post] });
		});
		return map;
	}, [paginatedPosts]);

	const highlight = (text: string) => {
		const q = searchQuery.trim();
		if (!q) return text;
		const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
		return parts.map((part, i) =>
			i % 2 === 1 ? <mark key={i}>{part}</mark> : part
		);
	};

	return (
		<div class="bl">
			{/* Search */}
			<div class="bl-search">
				<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
					<circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
				</svg>
				<input
					ref={inputRef}
					type="search"
					placeholder="搜索文章标题或内容…"
					aria-label="搜索文章"
					value={searchQuery}
					onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
				/>
				<kbd aria-hidden="true">/</kbd>
			</div>

			{/* Category dock + drill-down panel */}
			<nav class="bl-tags" aria-label="按分类筛选" style={{ '--hue': hueOf(nav.root) } as any}>
				<div class="bl-dock" ref={dockRef} role="tablist">
					<span class={`bl-blob${blob.ready ? ' ready' : ''}`} style={{ transform: `translateX(${blob.x}px)`, width: `${blob.w}px` }} aria-hidden="true" />
					{[{ id: 'all', label: '全部', count: posts.length }, ...nav.roots].map(r => {
						const on = (nav.root ?? 'all') === r.id;
						return (
							<button
								key={r.id}
								type="button"
								role="tab"
								data-root={r.id}
								aria-selected={on}
								class={`bl-tab${on ? ' on' : ''}`}
								style={{ '--c': hueOf(r.id) } as any}
								onClick={() => pickRoot(r.id === 'all' ? undefined : r.id)}
							>
								<Icon id={r.id} />
								<span>{r.label}</span>
								<sup>{r.count}</sup>
							</button>
						);
					})}
				</div>

				<div class={`bl-panel${nav.root ? ' open' : ''}`} style={{ '--hue': hueOf(panel.root) } as any} aria-hidden={!nav.root}>
					<div class="bl-panel-in">
						<div class="bl-trail">
							{panel.chain.map((id, i) => (
								<Fragment key={id}>
									{i > 0 && <span class="sep" aria-hidden="true">/</span>}
									<button
										type="button"
										class={`crumb${i === panel.chain.length - 1 ? ' cur' : ''}`}
										tabIndex={nav.root ? 0 : -1}
										onClick={() => setSelectedTags([id])}
									>{tree.get(id)?.label ?? id}</button>
								</Fragment>
							))}
							<button type="button" class="bl-x" tabIndex={nav.root ? 0 : -1} onClick={clearTags} aria-label="清除筛选">
								<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
							</button>
						</div>
						{panel.items.length > 0 ? (
							<div class="bl-cloud" key={panel.focus}>
								{panel.items.map((n, i) => {
									const on = panel.chain.includes(n.id);
									return (
										<button
											key={n.id}
											type="button"
											class={`bl-leaf${on ? ' on' : ''}${n.drill ? ' drill' : ''}`}
											aria-pressed={on}
											tabIndex={nav.root ? 0 : -1}
											style={{ '--w': (n.count / maxCount).toFixed(2), animationDelay: `${i * 35}ms` } as any}
											onClick={() => toggleTag(n.id)}
										>
											<i>#</i>{n.label}<sup>{n.count}</sup>
											{n.drill && <svg class="chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>}
										</button>
									);
								})}
							</div>
						) : (
							<p class="bl-void">这里还没有细分标签 · 下方是该分类的全部文章</p>
						)}
					</div>
				</div>
			</nav>

			<p class="bl-count" aria-live="polite">
				共 <b>{filteredPosts.length}</b> 篇
				{searchQuery && <span>，关键词「{searchQuery}」</span>}
			</p>

			{filteredPosts.length === 0 ? (
				<div class="bl-empty">
					<div class="face">¯\_(ツ)_/¯</div>
					<p>没有找到相关文章，换个关键词或标签试试</p>
					{(searchQuery || selectedTags.length > 0) && (
						<button class="bl-chip on" onClick={() => { setSearchQuery(''); clearTags(); }}>重置筛选</button>
					)}
				</div>
			) : (
				<div class="bl-timeline" id="postsList">
					{groups.map(group => (
						<section key={group.year} class="bl-year">
							<h3 class="bl-year-title">
								<span>{group.year}</span>
								<small>{group.items.length} 篇</small>
							</h3>
							<ul>
								{group.items.map(post => (
									<li key={post.id} data-tags={post.data.tags?.join(',') || ''}>
										<a href={`/blog/${post.id}/`} class="bl-card">
											<div class="bl-main">
												<time dateTime={post.data.pubDate.toISOString()}>
													{post.data.pubDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
												</time>
												<h4 style={{ viewTransitionName: `post-title-${post.id}` } as any}>{highlight(post.data.title)}</h4>
												{post.data.description && <p class="bl-desc">{highlight(post.data.description)}</p>}
												{post.data.tags && post.data.tags.length > 0 && (
													<div class="bl-post-tags">
														{resolvePostTags(post.data.tags).map((path: string[]) => (
															<span key={path.join('/')} style={{ '--c': hueOf(path[0]) } as any}><i>#</i>{displayLabel(path[path.length - 1], post.data.tags)}</span>
														))}
													</div>
												)}
											</div>
											<img
												src={post.data.heroImage || '/cat-1.svg'}
												alt=""
												width={240}
												height={135}
												loading="lazy"
											/>
										</a>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			)}

			{totalPages > 1 && (
				<div class="bl-pager">
					<button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>← 上一页</button>
					<span>{currentPage} / {totalPages}</span>
					<button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>下一页 →</button>
				</div>
			)}

			<style>{`
				.bl-search { position: relative; display: flex; align-items: center; margin-bottom: 1rem; }
				.bl-search svg { position: absolute; left: 1rem; color: var(--text-muted); pointer-events: none; }
				.bl-search input {
					width: 100%; min-height: 52px; padding: 0 3rem 0 3rem; font-size: 16px;
					color: var(--text-primary); background: var(--bg-tertiary);
					border: 1px solid var(--border-color); border-radius: 16px;
					transition: border-color .2s ease, box-shadow .2s ease; outline: none;
				}
				.bl-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
				.bl-search kbd {
					position: absolute; right: 1rem; padding: 2px 8px; font: 600 12px/1.4 ui-monospace, monospace;
					color: var(--text-muted); border: 1px solid var(--border-color); border-bottom-width: 2px; border-radius: 6px;
				}
				.bl-search input:not(:placeholder-shown) ~ kbd { display: none; }
				@media (hover: none) { .bl-search kbd { display: none; } }

				/* ---------- category dock ---------- */
				.bl-tags { margin: .25rem 0 .5rem; }
				.bl-dock {
					position: relative; display: flex; gap: 2px; padding: 4px; width: max-content; max-width: 100%;
					overflow-x: auto; scrollbar-width: none;
					background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 14px;
				}
				.bl-dock::-webkit-scrollbar { display: none; }
				.bl-blob {
					position: absolute; top: 4px; bottom: 4px; left: 0; border-radius: 10px; pointer-events: none;
					background: var(--hue);
					box-shadow: 0 6px 18px -6px var(--hue), inset 0 1px 0 rgb(255 255 255 / .25);
				}
				.bl-blob.ready { transition: transform .45s cubic-bezier(.34,1.45,.5,1), width .45s cubic-bezier(.34,1.45,.5,1), background-color .3s ease, box-shadow .3s ease; }
				.bl-tab {
					position: relative; z-index: 1; flex: none; display: inline-flex; align-items: center; gap: .4rem;
					min-height: 38px; padding: 0 .85rem; border: 0; border-radius: 10px; background: none; cursor: pointer;
					font: 600 .86rem/1 var(--font-body); color: var(--text-secondary); white-space: nowrap;
					transition: color .25s ease;
				}
				.bl-tab svg { color: var(--c); transition: color .25s ease, transform .35s cubic-bezier(.34,1.6,.5,1); }
				.bl-tab sup { font: 600 .68rem/1 ui-monospace, monospace; opacity: .55; transform: translateY(-.15em); }
				.bl-tab.on, .bl-tab.on svg { color: #fff; }
				.bl-tab.on sup { opacity: .8; }
				@media (hover: hover) {
					.bl-tab:not(.on):hover { color: var(--text-primary); }
					.bl-tab:not(.on):hover svg { transform: rotate(-8deg) scale(1.15); }
				}
				.bl-tab:active svg { transform: scale(.85); }
				.bl-tab:focus-visible { outline: 2px solid var(--c); outline-offset: -2px; }

				/* ---------- drill-down panel ---------- */
				.bl-panel { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .35s ease, opacity .25s ease, margin .35s ease; }
				.bl-panel.open { grid-template-rows: 1fr; opacity: 1; margin-top: .6rem; }
				.bl-panel-in {
					min-height: 0; overflow: hidden; position: relative;
					border-radius: 16px;
					background:
						radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--hue) 13%, transparent), transparent 60%),
						var(--bg-tertiary);
					box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hue) 22%, var(--border-color));
					transition: background .3s ease, box-shadow .3s ease;
				}
				.bl-panel-in::before {
					content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 0 3px 3px 0; background: var(--hue);
				}
				.bl-trail { display: flex; align-items: center; gap: .35rem; padding: .85rem 1rem .2rem 1.25rem; font: 600 .78rem/1 var(--font-body); }
				.bl-trail .sep { color: var(--text-muted); opacity: .5; }
				.bl-trail .crumb {
					padding: .3rem .45rem; margin: -.3rem -.1rem; border: 0; border-radius: 6px; background: none; cursor: pointer;
					color: var(--text-muted); letter-spacing: .06em; text-transform: uppercase; font: inherit;
				}
				.bl-trail .crumb:hover { color: var(--hue); background: color-mix(in srgb, var(--hue) 10%, transparent); }
				.bl-trail .crumb.cur { color: var(--hue); }
				.bl-x {
					margin-left: auto; display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 50%;
					background: none; color: var(--text-muted); cursor: pointer; transition: background-color .15s, color .15s, transform .25s;
				}
				.bl-x:hover { color: var(--hue); background: color-mix(in srgb, var(--hue) 12%, transparent); transform: rotate(90deg); }

				.bl-cloud { display: flex; flex-wrap: wrap; align-items: baseline; gap: .45rem; padding: .6rem 1rem 1rem 1.25rem; }
				.bl-leaf {
					--sz: calc(.82rem + .22rem * var(--w));
					display: inline-flex; align-items: center; gap: .15rem; min-height: 34px; padding: 0 .75rem;
					font: 600 var(--sz)/1 var(--font-body); color: var(--text-secondary); cursor: pointer;
					background: color-mix(in srgb, var(--hue) calc(4% + 8% * var(--w)), var(--bg-primary));
					border: 1px solid color-mix(in srgb, var(--hue) 18%, var(--border-color)); border-radius: 999px;
					opacity: 0; animation: blPop .4s cubic-bezier(.34,1.5,.5,1) forwards;
					transition: color .15s, background-color .15s, border-color .15s, transform .15s, box-shadow .2s;
				}
				.bl-leaf i { font-style: normal; color: var(--hue); opacity: .7; }
				.bl-leaf sup { margin-left: .2rem; font: 600 .65rem/1 ui-monospace, monospace; opacity: .55; }
				.bl-leaf .chev { margin-left: .15rem; opacity: .5; transition: transform .2s; }
				.bl-leaf.on { color: #fff; background: var(--hue); border-color: var(--hue); box-shadow: 0 6px 16px -8px var(--hue); }
				.bl-leaf.on i, .bl-leaf.on sup, .bl-leaf.on .chev { color: inherit; opacity: .85; }
				@media (hover: hover) {
					.bl-leaf:not(.on):hover { color: var(--hue); border-color: var(--hue); transform: translateY(-2px); box-shadow: 0 8px 18px -10px var(--hue); }
					.bl-leaf.drill:hover .chev { transform: translateX(2px); }
				}
				.bl-leaf:active { transform: scale(.94); }
				.bl-void { margin: 0; padding: .5rem 1rem 1rem 1.25rem; font-size: .82rem; color: var(--text-muted); }
				@keyframes blPop { from { opacity: 0; transform: translateY(6px) scale(.9); } to { opacity: 1; transform: none; } }
				@media (prefers-reduced-motion: reduce) {
					.bl-blob.ready, .bl-panel, .bl-leaf { transition: none; animation: none; opacity: 1; }
				}

				/* chips still used by the empty state */
				.bl-chip {
					min-height: 36px; padding: 0 .9rem; font: 500 .85rem/1 var(--font-body); cursor: pointer;
					border: 1px solid var(--accent); border-radius: 999px; background: var(--accent); color: #fff;
				}

				.bl-count { margin: .5rem 0 1.5rem; font-size: .85rem; color: var(--text-muted); }
				.bl-count b { color: var(--text-primary); }

				.bl-year { position: relative; margin-bottom: 2.5rem; }
				.bl-year-title {
					position: sticky; top: 60px; z-index: 5; display: flex; align-items: baseline; gap: .75rem;
					margin: 0 0 1rem; padding: .4rem 0;
					background: color-mix(in srgb, var(--bg-primary) 85%, transparent);
					-webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
				}
				.bl-year-title span {
					font: 800 clamp(2rem, 8vw, 3rem)/1 var(--font-display);
					color: transparent; -webkit-text-stroke: 1.5px var(--accent);
				}
				.bl-year-title small { font: 500 .8rem var(--font-body); color: var(--text-muted); }
				.bl-year ul { list-style: none; margin: 0; padding: 0 0 0 1.4rem; border-left: 2px solid var(--border-color); }
				.bl-year li { position: relative; margin-bottom: 1rem; opacity: 0; animation: fadeInUp .5s ease forwards; }
				.bl-year li::before {
					content: ''; position: absolute; left: calc(-1.4rem - 6px); top: 1.5rem; width: 10px; height: 10px;
					border-radius: 50%; background: var(--bg-primary); border: 2px solid var(--accent);
					transition: background-color .2s ease, transform .2s ease;
				}
				.bl-year li:hover::before { background: var(--accent); transform: scale(1.3); }

				.bl-card {
					display: flex; justify-content: space-between; align-items: center; gap: 1.5rem; padding: 1rem 1.1rem;
					border: 1px solid transparent; border-radius: 18px; text-decoration: none; color: inherit;
					transition: background-color .2s ease, border-color .2s ease, transform .2s ease;
				}
				.bl-card:active { transform: scale(.985); }
				@media (hover: hover) {
					.bl-card:hover { background: var(--bg-secondary); border-color: var(--border-color); transform: translateX(4px); }
					.bl-card:hover img { transform: scale(1.04); }
				}
				.bl-main { flex: 1; min-width: 0; }
				.bl-main time { font: 600 .78rem var(--font-body); letter-spacing: .04em; color: var(--accent); }
				.bl-main h4 {
					margin: .25rem 0 .35rem; font: 700 clamp(1.15rem, 4.2vw, 1.5rem)/1.3 var(--font-display); color: var(--text-primary);
				}
				.bl-desc {
					margin: 0; font-size: .92rem; line-height: 1.6; color: var(--text-secondary);
					display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
				}
				.bl-post-tags { display: flex; flex-wrap: wrap; gap: .25rem .75rem; margin-top: .6rem; font: 500 .78rem var(--font-body); color: var(--text-muted); }
				.bl-post-tags i { font-style: normal; font-weight: 700; color: var(--c); margin-right: 1px; }
				.bl-card mark { background: linear-gradient(transparent 55%, var(--accent-soft) 55%); color: var(--accent); padding: 0 .1em; }
				.bl-card img {
					flex: none; width: 200px; height: 112px; margin: 0; object-fit: cover; border-radius: 12px;
					transition: transform .4s ease;
				}
				@media (max-width: 720px) {
					.bl-year ul { padding-left: 1rem; }
					.bl-year li::before { left: calc(-1rem - 6px); }
					.bl-card { flex-direction: column-reverse; align-items: stretch; gap: .8rem; padding: .8rem; }
					.bl-card img { width: 100%; height: auto; aspect-ratio: 16 / 9; }
				}

				.bl-empty { text-align: center; padding: 3rem 1rem; color: var(--text-secondary); }
				.bl-empty .face { font: 700 2rem var(--font-display); color: var(--text-muted); margin-bottom: 1rem; }

				.bl-pager { display: flex; justify-content: center; align-items: center; gap: .75rem; margin-top: 1.5rem; }
				.bl-pager span { color: var(--text-secondary); font-size: .9rem; min-width: 4rem; text-align: center; }
				.bl-pager button {
					min-height: 44px; padding: 0 1.1rem; font: 600 .9rem var(--font-body); color: var(--text-primary);
					background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 999px; cursor: pointer;
					transition: border-color .2s ease, color .2s ease;
				}
				.bl-pager button:disabled { opacity: .4; cursor: not-allowed; }
				@media (hover: hover) { .bl-pager button:not(:disabled):hover { border-color: var(--accent); color: var(--accent); } }
				@media (prefers-reduced-motion: reduce) { .bl-year li { animation: none; opacity: 1; } }
			`}</style>
		</div>
	);
}
