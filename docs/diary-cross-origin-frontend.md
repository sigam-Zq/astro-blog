# 私密日记前端跨子域接入说明

针对前端托管在 GitHub Pages（`https://blogs.zqsrh.com`）、Go 后端独立部署在 ECS（`https://api.blogs.zqsrh.com`）的场景，前端已做如下适配。

## 1. 代码改动说明

在 [src/components/diary/DiaryApp.tsx](../src/components/diary/DiaryApp.tsx) 中：

1. **后端 API 地址环境变量化**：
   - 读取 `import.meta.env.PUBLIC_DIARY_API_ORIGIN`（自动去除末尾 `/`）。
   - 未设置时默认为空字符串 `""`，保持本地开发时同源请求 `/api/v1/*` 的行为。
   - 设置后（如 `https://api.blogs.zqsrh.com`），所有请求发往 `${API_ORIGIN}/api/v1/*`。
2. **跨域凭证模式自适应**：
   - 当 `PUBLIC_DIARY_API_ORIGIN` 非空时，`fetch` 的 `credentials` 自动切换为 `"include"`，确保跨子域名请求能够正常携带和保存 `__Host-diary_session` 会话 Cookie。

## 2. 构建与部署配置

在 GitHub Actions 或本地构建 Astro 静态站时，注入环境变量：

```sh
PUBLIC_DIARY_API_ORIGIN=https://api.blogs.zqsrh.com npm run astro -- build
```

本地开发无需设置该变量（继续由 Astro 开发服务器将 `/api` 代理到 `127.0.0.1:8080`）。

## 3. 浏览器 mTLS 使用提示

当后端开启了 `TLS_CLIENT_CA_FILE` 强制 mTLS 时：
- 首次从 `https://blogs.zqsrh.com/diary/` 发起跨域请求到 `https://api.blogs.zqsrh.com`，部分浏览器在后台 `fetch` 时可能不会主动弹出客户端证书选择框。
- 如遇请求直接报网络错误，可先在浏览器新标签页直接访问一次 `https://api.blogs.zqsrh.com/healthz`，完成客户端证书选择（或永久允许），之后再刷新 `/diary/` 即可正常使用。
