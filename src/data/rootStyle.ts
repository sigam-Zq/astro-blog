// 顶级分类的视觉身份：颜色 / 图标(24x24 stroke path) / 一句话简介。首页与 /blog 共用。
export const ROOT_HUE: Record<string, string> = {
	all: 'var(--accent)',
	life: '#f59e0b',
	coding: '#6366f1',
	infrastructure: '#10b981',
	wow: '#ec4899',
	other: '#64748b',
};

export const ROOT_ICON: Record<string, string> = {
	all: 'M4 6h16M4 12h16M4 18h10',
	life: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
	coding: 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14',
	infrastructure: 'M5 4h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 14h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM8 7h.01M8 17h.01',
	wow: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z',
	other: 'M6 12h.01M12 12h.01M18 12h.01',
};

export const ROOT_BLURB: Record<string, string> = {
	life: '生活碎片、阅读与思考',
	coding: '语言、框架与工程实践',
	infrastructure: '系统、网络与线上排障',
	wow: '让人眼前一亮的发现',
	other: '还没来得及归类的杂记',
};

export const hueOf = (root?: string) => ROOT_HUE[root ?? 'all'] ?? 'var(--accent)';
