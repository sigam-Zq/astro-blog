import { useState, useEffect, useMemo } from 'preact/hooks';
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
		history.pushState({}, '', newUrl);
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

	return (
		<div class="blog-list">
			{/* Search Input */}
			<div class="search-container mb-6">
				<input
					type="search"
					placeholder="搜索文章标题或内容..."
					value={searchQuery}
					onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
					class="search-input w-full px-4 py-2 rounded-lg border"
					style={{
						backgroundColor: 'var(--bg-secondary)',
						color: 'var(--text-primary)',
						borderColor: 'var(--border-color)'
					}}
				/>
			</div>

			{/* Tags Filter Bar */}
			<div class="tags-filter-bar" style={{
				display: 'flex',
				alignItems: 'center',
				gap: '1rem',
				padding: '1rem 0',
				marginBottom: '1.5rem',
				flexWrap: 'wrap'
			}}>
				<span class="tags-label" style={{
					fontSize: '0.875rem',
					color: 'var(--text-muted)',
					fontWeight: 500,
					whiteSpace: 'nowrap'
				}}>标签</span>
				<div class="tags-list" style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: '0.5rem',
					flex: 1
				}}>
					{allTags.map(tag => (
						<span
							key={tag}
							onClick={() => toggleTag(tag)}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: '0.25rem',
								padding: '0.375rem 0.75rem',
								background: selectedTags.includes(tag) ? 'var(--accent)' : 'var(--bg-tertiary)',
								borderRadius: '9999px',
								fontSize: '0.875rem',
								color: selectedTags.includes(tag) ? 'white' : 'var(--text-secondary)',
								cursor: 'pointer',
								border: '1px solid transparent',
								transition: 'all 0.15s ease',
								transform: selectedTags.includes(tag) ? 'scale(1.05)' : 'scale(1)'
							}}
						>
							{tag}
							{selectedTags.includes(tag) && (
								<span
									onClick={(e) => { e.stopPropagation(); toggleTag(tag); }}
									style={{ fontSize: '0.625rem', marginLeft: '0.25rem', opacity: 0.7 }}
								>
									✕
								</span>
							)}
						</span>
					))}
				</div>
				{selectedTags.length > 0 && (
					<button
						onClick={clearTags}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: '0.25rem',
							padding: '0.375rem 0.75rem',
							background: 'transparent',
							border: '1px solid var(--border-color)',
							borderRadius: '9999px',
							fontSize: '0.75rem',
							color: 'var(--text-muted)',
							cursor: 'pointer',
							transition: 'all 0.15s ease',
							whiteSpace: 'nowrap'
						}}
					>
						✕ 清除全部
					</button>
				)}
			</div>

			{/* Results count */}
			<div class="results-info mb-4" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
				找到 {filteredPosts.length} 篇文章
				{searchQuery && <span>，搜索关键词: "{searchQuery}"</span>}
			</div>

			{/* Posts List */}
			<ul id="postsList" style={{
				display: 'flex',
				flexDirection: 'column',
				gap: '2rem',
				listStyleType: 'none',
				margin: 0,
				padding: 0
			}}>
				{paginatedPosts.map((post, index) => (
					<li
						key={post.id}
						data-tags={post.data.tags?.join(',') || ''}
						style={{
							opacity: 0,
							animation: `fadeInUp 0.5s ease forwards`,
							animationDelay: `${index * 0.05}s`
						}}
					>
						<a
							href={`/blog/${post.id}/`}
							style={{
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'center',
								gap: '2rem',
								padding: '1rem',
								borderRadius: '12px',
								background: 'transparent',
								textDecoration: 'none',
								transition: 'all 0.2s ease'
							}}
							onMouseEnter={(e) => {
								(e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)';
								(e.currentTarget as HTMLElement).style.transform = 'translateX(4px)';
							}}
							onMouseLeave={(e) => {
								(e.currentTarget as HTMLElement).style.background = 'transparent';
								(e.currentTarget as HTMLElement).style.transform = 'translateX(0)';
							}}
						>
							<div class="content-left" style={{ flex: 1 }}>
								<h4 class="title" style={{
									margin: '0 0 0.25rem 0',
									color: 'var(--text-primary)',
									lineHeight: 1.2,
									fontSize: '1.75rem',
									fontWeight: 600
								}}>
									{post.data.title}
								</h4>
								<p class="date" style={{ margin: 0, color: 'var(--text-muted)' }}>
									{post.data.pubDate.toLocaleDateString('zh-CN', {
										year: 'numeric',
										month: 'short',
										day: 'numeric'
									})}
								</p>
								{post.data.tags && post.data.tags.length > 0 && (
									<div class="post-tags" style={{
										display: 'flex',
										gap: '0.5rem',
										marginTop: '0.5rem',
										flexWrap: 'wrap'
									}}>
										{post.data.tags.map(tag => (
											<span key={tag} style={{
												fontSize: '0.75rem',
												padding: '0.125rem 0.5rem',
												background: 'var(--bg-tertiary)',
												borderRadius: '9999px',
												color: 'var(--text-secondary)',
												transition: 'all 0.15s ease'
											}}>
												{tag}
											</span>
										))}
									</div>
								)}
							</div>
							{post.data.heroImage ? (
								<img
									src={post.data.heroImage}
									alt=""
									width={240}
									height={135}
									loading="lazy"
									style={{
										width: '240px',
										height: '135px',
										objectFit: 'cover',
										borderRadius: '12px',
										marginBottom: 0,
										transition: 'transform 0.3s ease, box-shadow 0.3s ease'
									}}
								/>
							) : (
								<img
									src="/cat-1.svg"
									alt=""
									width={240}
									height={135}
									loading="lazy"
									style={{
										width: '240px',
										height: '135px',
										objectFit: 'cover',
										borderRadius: '12px',
										marginBottom: 0,
										transition: 'transform 0.3s ease, box-shadow 0.3s ease'
									}}
								/>
							)}
						</a>
					</li>
				))}
			</ul>

			{/* Pagination */}
			{totalPages > 1 && (
				<div class="pagination" style={{
					display: 'flex',
					justifyContent: 'center',
					gap: '0.5rem',
					marginTop: '2rem',
					paddingTop: '1rem'
				}}>
					<button
						onClick={() => goToPage(currentPage - 1)}
						disabled={currentPage === 1}
						style={{
							padding: '0.5rem 1rem',
							background: currentPage === 1 ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
							border: '1px solid var(--border-color)',
							borderRadius: '8px',
							color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
							cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
							transition: 'all 0.2s ease',
							opacity: currentPage === 1 ? 0.5 : 1
						}}
					>
						上一页
					</button>
					<span style={{
						display: 'flex',
						alignItems: 'center',
						padding: '0 1rem',
						color: 'var(--text-secondary)'
					}}>
						{currentPage} / {totalPages}
					</span>
					<button
						onClick={() => goToPage(currentPage + 1)}
						disabled={currentPage === totalPages}
						style={{
							padding: '0.5rem 1rem',
							background: currentPage === totalPages ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
							border: '1px solid var(--border-color)',
							borderRadius: '8px',
							color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
							cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
							transition: 'all 0.2s ease',
							opacity: currentPage === totalPages ? 0.5 : 1
						}}
					>
						下一页
					</button>
				</div>
			)}

			<style>{`
				@keyframes fadeInUp {
					from {
						opacity: 0;
						transform: translateY(20px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
				@media (max-width: 720px) {
					#postsList li a {
						flex-direction: column;
						align-items: flex-start;
						gap: 1rem;
					}
					#postsList li img {
						width: 100%;
						height: auto;
					}
				}
				.search-input:focus {
					outline: 2px solid var(--accent);
					outline-offset: 2px;
				}
			`}</style>
		</div>
	);
}