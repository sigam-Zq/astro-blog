# Astro 博客项目优化方向分析

## 一、项目现状

当前项目采用 **SSG + Preact 客户端水合** 的混合架构：
- 所有文章（26篇）在构建期通过 `getCollection('blog')` 一次性加载
- 序列化到 HTML 中传递给 `BlogList.tsx` 组件
- 客户端负责分页、搜索（Fuse.js）和标签筛选
- 当前规模下无性能问题，但架构存在扩展性隐患

### 当前性能指标

| 指标 | 现状 | 风险等级 |
|------|------|---------|
| 首屏加载时间 | ~300-500 ms | ✅ 安全 |
| HTML 初始大小 | ~40-60 KB (Gzip) | ✅ 安全 |
| 搜索响应延迟 | < 5 ms (26 篇) | ✅ 安全 |
| 编译构建时间 | ~5-8 秒 | ✅ 安全 |

---

## 二、问题1：静态渲染 & 全量数据加载

### 核心瓶颈

`/src/pages/blog/index.astro` 把所有文章数据嵌入 HTML，由客户端 Preact 组件负责分页/搜索。

| 文章规模 | HTML 大小 | 首屏延迟 | 风险 |
|---------|----------|---------|------|
| < 100 篇 | ~100 KB | 无感知 | ✅ 安全 |
| 100-500 篇 | 500 KB-2 MB | 移动端可感知 | ⚠️ 边界 |
| > 1000 篇 | > 5 MB | > 3s | ❌ 严重 |

### 优化方案与取舍

#### 方案 A：增量加载（推荐 50-500 篇）

**思路**：首页仅嵌入第1页数据，后续页通过静态 JSON API 按需加载

```typescript
// src/pages/api/blog/posts/[page].json.ts
export async function GET({ params }) {
  const posts = await getCollection('blog');
  const page = parseInt(params.page);
  const pageSize = 10;
  const data = posts.slice((page - 1) * pageSize, page * pageSize);
  return new Response(JSON.stringify(data));
}
```

| 优势 | 劣势 |
|------|------|
| 首屏 HTML 减小 90% | 翻页有网络延迟 (200-400ms) |
| 改动小，保留现有 URL 逻辑 | 搜索/筛选仍需全量数据 |
| 与 TinaCMS 编辑工作流兼容 | — |

#### 方案 B：静态标签页面（推荐分类清晰的博客）

**思路**：为每个标签预生成独立的静态 HTML 页面 `/blog/tag/{name}/{page}`

```typescript
// src/pages/blog/tag/[tag]/[page].astro
export async function getStaticPaths() {
  const posts = await getCollection('blog');
  const allTags = new Set(posts.flatMap(p => p.data.tags || []));
  
  const paths = [];
  for (const tag of allTags) {
    const taggedPosts = posts.filter(p => p.data.tags?.includes(tag));
    const pageCount = Math.ceil(taggedPosts.length / 10);
    for (let page = 1; page <= pageCount; page++) {
      paths.push({
        params: { tag, page: page.toString() },
        props: { posts: taggedPosts.slice((page - 1) * 10, page * 10) }
      });
    }
  }
  return paths;
}
```

| 优势 | 劣势 |
|------|------|
| SEO 最优化（独立 HTML） | 多标签组合筛选困难 |
| URL 语义化 (`/blog/tag/React/1`) | 构建文件数增多 (50-200个) |
| 无 JavaScript 依赖 | 难以动态同时筛选多个标签 |

#### 方案 C：完全客户端渲染（适合大规模/内部系统）

**思路**：构建期导出 JSON，运行时 fetch 加载

```typescript
// src/pages/api/blog/all.json.ts
export async function GET() {
  const posts = await getCollection('blog');
  return new Response(JSON.stringify(posts.map(p => ({
    id: p.id,
    title: p.data.title,
    description: p.data.description,
    pubDate: p.data.pubDate,
    tags: p.data.tags,
  }))));
}
```

| 优势 | 劣势 |
|------|------|
| 支持复杂组合筛选 | SEO 差 |
| 可伸缩到 10000+ 篇 | 依赖 JavaScript |
| 架构清晰 | 首次加载 JSON 1-2s |

#### 方案 D：混合 SSR + ISR（终极灵活性）

**思路**：Astro `output: 'hybrid'`，首页静态 + 后续按需渲染

```typescript
// astro.config.mjs
export default defineConfig({
  output: 'hybrid',
  integrations: [preact()],
});

// src/pages/blog/[page].astro
export const prerender = false; // 动态渲染
```

| 优势 | 劣势 |
|------|------|
| 首页静态（SEO 最优） | 需要服务器 |
| 后续按需渲染并缓存 | 配置复杂 |
| 支持服务端搜索 | 不能只用静态托管 |

---

## 三、问题2：分页与标签筛选

### 分页现状

- 纯客户端切片分页（`Array.slice`），URL 同步（`?page=2`）
- **问题**：全量数据都在内存中，分页只是视觉分页，不减少数据传输

### 标签筛选问题

| 问题 | 说明 | 影响 |
|------|------|------|
| OR 逻辑可能不符预期 | 选多标签返回"包含任一"的文章 | 用户可能期望交集(AND) |
| 无标签计数 | 看不到 "Rust (5篇)" | 用户体验差 |
| 标签重复计算 | 首页和 BlogList 各自独立提取 | 代码冗余 |
| SEO 不友好 | `?tag=Rust` 无独立 HTML | 搜索引擎无法索引 |

### 分页优化方向

| 方向 | 描述 | 取舍 |
|------|------|------|
| 静态分页路由 `/blog/page/2` | 每页预生成独立 HTML | SEO 友好，但丧失客户端筛选即时响应 |
| JSON API 分页 | 保持客户端交互，数据按页 fetch | 灵活，但增加请求延迟 |
| 混合方案 | 首页静态嵌入 + 后续页 JSON 按需加载 | 兼顾 SEO 和体验 |

---

## 四、立即可做的改进（无需大重构）

### 4.1 首页优化

```javascript
// /src/pages/index.astro
// 修改前：加载所有文章
const posts = await getCollection('blog');

// 优化：仅需要排序后取前3篇，标签提取独立为工具函数
const allPosts = (await getCollection('blog')).sort(
  (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
);
const latestPosts = allPosts.slice(0, 3);
```

### 4.2 提取标签工具函数

```typescript
// src/utils/tags.ts
import { getCollection } from 'astro:content';

export async function getAllTagsWithCount() {
  const posts = await getCollection('blog');
  const tagMap = new Map<string, number>();
  posts.forEach(post =>
    post.data.tags?.forEach(tag => {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    })
  );
  return Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]);
}
```

### 4.3 标签增加计数显示

在 BlogList.tsx 中显示每个标签的文章数：`{tag} (5篇)`

### 4.4 提供 AND/OR 筛选切换

```typescript
// BlogList.tsx 修改
const filteredPosts = useMemo(() => {
  let result = posts;
  if (selectedTags.length > 0) {
    result = result.filter(post =>
      filterMode === 'AND'
        ? selectedTags.every(tag => post.data.tags?.includes(tag))
        : selectedTags.some(tag => post.data.tags?.includes(tag))
    );
  }
  return result;
}, [posts, selectedTags, filterMode, searchQuery, fuse]);
```

### 4.5 搜索结果利用 Fuse.js 得分排序

当前 Fuse.js 返回带 score 的结果但未利用，应按相关度排序展示。

---

## 五、推荐路线图

| 阶段 | 文章数 | 推荐方案 | 重点 |
|------|--------|---------|------|
| 当前 | 0-100 | 保持现状 + 小改进 | 做4.1-4.5的快速改进 |
| 成长期 | 100-500 | 方案 A + B 混合 | 增量加载 + 静态标签页 |
| 成熟期 | 500+ | 方案 D (SSR/ISR) | 迁移到 hybrid 模式 + 专业搜索(Algolia) |

---

## 六、总体结论

当前架构选择正确：SSG 保证 SEO、Preact 提供交互、Fuse.js 满足搜索需求。**建议暂不做大架构改动**，优先完成第四节的5项快速改进。当文章超过 200 篇并观测到首屏加载变慢时，按"方案 A + B 混合"路线升级。
