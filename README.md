# Astro 博客

这是一个使用 [Astro](https://astro.build/) 构建的高性能博客项目，集成了 [TinaCMS](https://tina.io/) 以支持在线编辑。

## ✨ 特性

-   🚀 **Astro** - 使用 Astro 构建，速度快，性能高。
-   📝 **TinaCMS** - **在线编辑支持**。通过可视化界面管理博文，实时预览。
-   ✍️ **MDX** - 使用 MDX 编写博文，可以在 Markdown 中使用组件。
-   RSS - 自动生成 RSS 订阅源。
-   🗺️ **Sitemap** - 自动生成站点地图，有利于 SEO。
-   部署 - 通过 GitHub Actions 自动部署到 GitHub Pages。

## 🛠️ 技术栈

-   [Astro](https://astro.build/)
-   [TinaCMS](https://tina.io/)
-   [MDX](https://mdxjs.com/)
-   [TypeScript](https://www.typescriptlang.org/)

## 🚀 项目结构

```
/
├── public/
│   └── admin/          # TinaCMS 生成的管理页面 (忽略)
├── src/
│   ├── components/
│   ├── content/
│   │   └── blog/       # 博客文章 (Markdown / MDX)
│   ├── layouts/
│   └── pages/
├── tina/               # TinaCMS 配置及模型定义
└── package.json
```

-   **`src/content/blog`**: 博客文章 (Markdown / MDX)。
-   **`tina/config.ts`**: TinaCMS 的内容模型和配置。

## 本地开发

1.  **克隆项目**

    ```bash
    git clone <your-repository-url>
    cd <your-repository-name>
    ```

2.  **安装依赖**

    ```bash
    npm install
    ```

3.  **启动开发服务器**

    ```bash
    npm run dev
    ```

    -   查看博客：`http://localhost:4321`
    -   **在线编辑**：访问 `http://localhost:4321/admin/index.html` 进入 TinaCMS 管理后台。

## 📦 命令

| 命令              | 描述                                     |
| :---------------- | :--------------------------------------- |
| `npm run dev`     | 启动本地开发服务器并同步启动 TinaCMS。     |
| `npm run build`   | 构建生产环境的静态文件（包含 Tina 编译）。 |
| `npm run preview` | 在本地预览构建后的站点。                   |

## 部署与云端编辑

1.  **自动部署**：该项目已配置为通过 GitHub Actions 自动部署到 GitHub Pages。当你将代码推送到 `main` 分支时，会自动触发部署流程。
2.  **云端编辑 (Tina Cloud)**：
    -   在 [tina.io](https://tina.io/) 注册并关联你的 GitHub 仓库。
    -   获取 `clientId` 和 `token` 并配置为环境变量。
    -   上线后，你就可以在你的线上域名 `/admin` 路径下直接编辑并自动提交代码。
