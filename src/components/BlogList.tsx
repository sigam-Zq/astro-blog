import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import Fuse from 'fuse.js';

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
		const tags = params.get('tag')?.split(',').filter(Boolean) || [];
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

	// Get all unique tags
	const allTags = useMemo(() => {
		const tags = new Set<string>();
		posts.forEach(post => post.data.tags?.forEach(tag => tags.add(tag)));
		return Array.from(tags).sort();
	}, [posts]);

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
				selectedTags.some(tag => post.data.tags?.includes(tag))
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

	const toggleTag = (tag: string) => {
		setSelectedTags(prev =>
			prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
		);
	};

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

			{/* Tags: single scrolling row on phones */}
			<div class="bl-tags" role="group" aria-label="按标签筛选">
				{selectedTags.length > 0 && (
					<button class="bl-chip bl-clear" onClick={clearTags}>✕ 清除</button>
				)}
				{allTags.map(tag => (
					<button
						key={tag}
						type="button"
						class={`bl-chip${selectedTags.includes(tag) ? ' on' : ''}`}
						aria-pressed={selectedTags.includes(tag)}
						onClick={() => toggleTag(tag)}
					>
						<span class="hash">#</span>{tag}
					</button>
				))}
			</div>

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
												<h4>{highlight(post.data.title)}</h4>
												{post.data.description && <p class="bl-desc">{highlight(post.data.description)}</p>}
												{post.data.tags && post.data.tags.length > 0 && (
													<div class="bl-post-tags">
														{post.data.tags.map(tag => <span key={tag}>#{tag}</span>)}
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

				.bl-tags {
					display: flex; gap: .5rem; padding: .25rem 0 .75rem;
					overflow-x: auto; scrollbar-width: none; scroll-snap-type: x proximity;
					-webkit-mask-image: linear-gradient(90deg, #000 88%, transparent);
					mask-image: linear-gradient(90deg, #000 88%, transparent);
				}
				.bl-tags::-webkit-scrollbar { display: none; }
				@media (min-width: 721px) {
					.bl-tags { flex-wrap: wrap; overflow: visible; -webkit-mask-image: none; mask-image: none; }
				}
				.bl-chip {
					flex: none; scroll-snap-align: start; min-height: 36px; padding: 0 .9rem; font: 500 .85rem/1 var(--font-body);
					color: var(--text-secondary); background: var(--bg-tertiary); border: 1px solid var(--border-color);
					border-radius: 999px; cursor: pointer; white-space: nowrap;
					transition: color .15s ease, background-color .15s ease, border-color .15s ease, transform .15s ease;
				}
				.bl-chip .hash { color: var(--accent); margin-right: 1px; }
				.bl-chip:active { transform: scale(.95); }
				.bl-chip.on { background: var(--accent); border-color: var(--accent); color: #fff; }
				.bl-chip.on .hash { color: inherit; }
				.bl-clear { color: var(--text-muted); background: transparent; }
				@media (hover: hover) { .bl-chip:not(.on):hover { border-color: var(--accent); color: var(--accent); } }

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
