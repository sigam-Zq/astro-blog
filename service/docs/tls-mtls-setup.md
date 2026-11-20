# 私密日记后端 TLS 与 mTLS 实施说明

本文档说明如何在 Go 后端（[service/cmd/server/main.go](../cmd/server/main.go)）直接集成 TLS 1.3 与自建 CA 双向认证（mTLS），以及如何配合 GitHub Pages 静态前端（`https://blogs.zqsrh.com`）与独立后端子域名（`https://api.blogs.zqsrh.com`）进行防抓包部署。

## 1. 架构与防抓包原理

- **前端（GitHub Pages）**：`https://blogs.zqsrh.com/diary/`
- **后端（ECS Go 服务）**：`https://api.blogs.zqsrh.com`（直接监听 443 或由防火墙映射至 443，无需前置 Nginx/Caddy）
- **OSS（RustFS）**：与 Go 后端同机部署在 ECS 上，通过 `http://127.0.0.1:9000`（或本机 Docker 网络）通信，不出公网网卡。

**防抓包能力：**
1. **防网络链路窃听**：浏览器与 `api.blogs.zqsrh.com` 之间强制使用 **TLS 1.3** 加密。
2. **防未授权设备/扫描器**：开启 `TLS_CLIENT_CA_FILE` 后，Go 服务强制 `tls.RequireAndVerifyClientCert`。未安装受信任客户端证书的设备在 TLS 握手阶段直接被拒绝，无法触及 HTTP 接口。
3. **防本地中间人代理抓包（Charles / Fiddler / Surge 等）**：中间人代理向 Go 后端发起 TLS 握手时没有客户端私钥，Go 后端直接断开连接，无法解密请求和响应。

---

## 2. 证书准备

### 2.1 服务端证书（Let's Encrypt）

为 `api.blogs.zqsrh.com` 申请公网受信任的 TLS 证书，确保浏览器跨域 `fetch` 时无需额外信任服务端根证书：

```sh
# 在 ECS 上使用 certbot 申请（示例）
certbot certonly --standalone -d api.blogs.zqsrh.com
```

生成后核心文件位于 `/etc/letsencrypt/live/api.blogs.zqsrh.com/`：
- `fullchain.pem` -> 对应 `TLS_CERT_FILE`
- `privkey.pem` -> 对应 `TLS_KEY_FILE`

### 2.2 自建私有 CA 与客户端证书（用于 mTLS）

在本地安全环境（离线保管 `ca.key`，切勿上传至服务器或代码仓库）执行：

```sh
# 1. 生成私有根 CA 私钥与证书（有效期 10 年）
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -subj "/CN=Diary-Private-CA" -out ca.crt

# 2. 为设备（如 Mac / iPhone）签发客户端证书
openssl genrsa -out device-mac.key 2048
openssl req -new -key device-mac.key -subj "/CN=z-macbook" -out device-mac.csr
openssl x509 -req -in device-mac.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out device-mac.crt -days 825 -sha256

# 3. 打包为浏览器/系统可导入的 .p12 文件（会提示设置导入密码）
openssl pkcs12 -export -out device-mac.p12 \
  -inkey device-mac.key -in device-mac.crt -certfile ca.crt
```

- 将 **`ca.crt`** 上传至 ECS（例如 `/etc/diary/ca.crt`），配置给 `TLS_CLIENT_CA_FILE`。
- 将 **`device-mac.p12`** 双击导入电脑钥匙串或通过 AirDrop/邮件导入手机系统设置中。

---

## 3. 后端配置与 CORS 改动

### 3.1 新增配置项

在 `config.yaml`（`server` 段）或环境变量（`.env` / `runtime.env`）中支持以下选项：

| 环境变量 | YAML 字段 | 说明 |
| --- | --- | --- |
| `TLS_CERT_FILE` | `server.tls_cert_file` | 服务端证书路径（如 `fullchain.pem`） |
| `TLS_KEY_FILE` | `server.tls_key_file` | 服务端私钥路径（如 `privkey.pem`） |
| `TLS_CLIENT_CA_FILE` | `server.tls_client_ca_file` | 可选。私有 CA 根证书路径（如 `ca.crt`）；设置后强制开启 mTLS |

> 注意：`TLS_CERT_FILE` 与 `TLS_KEY_FILE` 必须同时配置；配置 `TLS_CLIENT_CA_FILE` 时必须先配置服务端 TLS。

### 3.2 跨子域 CORS 支持

[service/internal/httpapi/api.go](../internal/httpapi/api.go) 已增加严格单源 CORS 支持：
- 仅当请求头 `Origin` 严格等于配置的 `APP_ORIGIN`（如 `https://blogs.zqsrh.com`）时，返回 `Access-Control-Allow-Origin`、`Access-Control-Allow-Credentials: true` 及允许的 `Methods`/`Headers`。
- 自动响应 `OPTIONS` 预检请求（返回 `204 No Content`）。
- 生产环境需设置 `APP_ORIGIN=https://blogs.zqsrh.com` 和 `REQUIRE_HTTPS=true`。
