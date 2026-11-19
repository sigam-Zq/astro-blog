# 私密日记 Go 服务

独立 Go API；现有 Astro 网站通过 `/diary/` 的 Preact 应用访问同源 `/api/v1/`。单管理员、单写入实例，S3 兼容 OSS 是唯一业务持久化存储。mTLS 尚未实施，要求见 [mTLS 需求](../docs/diary-mtls-requirements.md)。

## 开发和验证

需要 Go 1.26+。前端使用当前 Astro 支持的 Node，推荐 Node 22/24。

```sh
# 仓库根目录
npm run astro -- build

go -C service test -race ./...
go -C service vet ./...
go -C service run ./cmd/password-hash
```

密码工具从终端隐藏读取密码，输出 Argon2id 哈希。生产部署推荐配置哈希；也支持 `admin.password` / `ADMIN_PASSWORD` 明文输入，启动后业务只使用生成的哈希，不回写配置。密码不能同时配置两种表示。

不要将本地测试 harness 的账号用作真实配置。`TestBrowserHarness` 仅在显式设置 `DIARY_BROWSER_TEST=1` 时运行，使用一次性内存数据，不会编译进服务二进制；正常程序始终使用 S3。

## 配置

完整字段见 `config.example.yaml` 和 `.env.example`。OSS endpoint 包含协议和端口，如 `http://host:9000`；后端监听端口由 `HTTP_ADDR` / `server.addr` 控制；宿主机端口映射由 `DIARY_HOST_PORT` 控制。

优先级：内置非敏感默认值 < 指定的 YAML 文件 < 实际存在的环境变量。配置路径为 `--config` > `DIARY_CONFIG`；没有指定路径时不读取文件。空环境变量也算覆盖，必填值为空则启动失败。未知 YAML 字段、多个 YAML 文档、非法 URL/日期/布尔值等会被拒绝。

同一来源同时设置 password 和 password_hash 会报错。环境变量中只提供一种密码表示时，会整体替换文件中的密码表示，例如 `ADMIN_PASSWORD` 可以覆盖文件中的 `admin.password_hash`。

必填：ADMIN_USERNAME、一种密码表示、S3_ENDPOINT、S3_REGION、S3_BUCKET、S3_ACCESS_KEY_ID、S3_SECRET_ACCESS_KEY。APP_ORIGIN 默认 `http://localhost:4321`，支持 HTTP/HTTPS，必须与浏览器访问的前端来源一致；末尾 `/` 会自动去除，不能包含 `/diary/` 等路径。S3_PREFIX 默认 `diary/v1/`；S3_FORCE_PATH_STYLE 默认 true。

`server.require_https` / `REQUIRE_HTTPS` 默认 false，设为 true 时要求 APP_ORIGIN 使用 HTTPS。此开关校验浏览器入口协议，不会为 Go 监听端口自动签发证书或开启 TLS；HTTPS 入口由代理配置。

```sh
# 文件模式：复制并填写实际值，不要提交 config.yaml
cp service/config.example.yaml service/config.yaml
go -C service run ./cmd/server --config config.yaml
```

```sh
# 纯环境模式：在进程环境中设置 .env.example 所列字段后运行
# Go 本身不读取 dotenv 文件；Compose 的 env_file 才负责注入。
go -C service run ./cmd/server
```

Cookie 随 APP_ORIGIN 自动适配：HTTPS 使用 Secure 的 `__Host-diary_session`；HTTP 使用非 Secure 的 `diary_session`，两者都保留 HttpOnly、SameSite=Strict、Path=/ 和来源/CSRF 校验。HTTP 模式不加密网络传输；HTTPS 部署配置正确的 APP_ORIGIN 并可开启 REQUIRE_HTTPS。

本地开发可以直接使用 HTTP：在 `service/` 填写 config.yaml 的管理员及 OSS 配置，然后执行：

```sh
APP_ORIGIN=http://localhost:4321 REQUIRE_HTTPS=false go run ./cmd/server --config config.yaml
```

前端在仓库根目录执行 `npm run astro -- dev --host localhost`，浏览器打开 `http://localhost:4321/diary/`。Astro 将 `/api` 代理到 `127.0.0.1:8080`；APP_ORIGIN 是前端地址，不是 Go 的 8080 地址。若前端换成其他主机或端口，同步修改 APP_ORIGIN。Go 不会自动读取 runtime.env；命令行运行请选择配置文件或已导出的环境变量。

## Docker 与 Compose

Dockerfile 为多阶段构建，运行镜像带系统 CA，使用非 root 用户，不包含实际配置、凭据或证书。Compose 需要 **2.30+**（[Docker 官方说明](https://docs.docker.com/reference/compose-file/services/#format)），以 `env_file.format: raw` 保留密码哈希中的 `$`；原始 env 文件的值不加引号，不写 `$$`，每行一个 `NAME=value`。配置中有换行的值应使用 YAML 文件或另行受控挂载。

下面命令均在 `service/` 中执行：

```sh
# 纯环境模式：复制 .env.example 并填写实际值
cp .env.example runtime.env
docker compose build
docker compose up -d
```

```sh
# 纯文件模式：填写 config.yaml；runtime.env 不存在或不包含服务字段。
# 文件不存在会直接失败，不会创建一个目录。
cp config.example.yaml config.yaml
docker compose -f docker-compose.yaml -f docker-compose.config.yaml up -d --build
```

```sh
# 混合模式：config.yaml 提供基础配置，runtime.env 仅放要覆盖的变量。
# 不要将整个占位 .env.example 用作覆盖文件。
docker compose -f docker-compose.yaml -f docker-compose.config.yaml up -d --build
```

可使用 `DIARY_ENV_FILE` 指定运行 env 文件；它和 `DIARY_HOST_PORT` 是 Compose 插值变量，需要放在执行 Compose 的环境或其项目 `.env` 中。Compose 的项目 `.env` 插值与服务 env_file 注入是两套机制；本配置通过 raw env_file 显式传入服务变量。默认已将原始凭据放到独立的 `runtime.env`，避免将带 `$` 的哈希放进项目插值 `.env`；原始变量以最终容器内值为准，验证时不要把配置展开结果粘贴到日志。

默认不向宿主机发布 API 端口；容器代理可连接 `private-diary_diary` 网络中的 `diary:8080`。宿主机代理需要访问时叠加：

```sh
docker compose -f docker-compose.yaml -f docker-compose.local.yaml up -d
# 文件模式同时叠加 docker-compose.config.yaml
# 可选 DIARY_HOST_PORT 默认 8080，仅绑定 127.0.0.1
```

不要扩容副本，不要使用两个 Compose 项目写同一个前缀。更新必须停止旧实例再启动，旧进程最多有 110 秒优雅退出期，Compose 给予 120 秒：

```sh
docker compose build
docker compose stop
docker compose up -d
docker compose ps
docker compose logs --tail=100 diary
docker compose exec diary /usr/local/bin/diary --probe http://127.0.0.1:8080/readyz
# 停止并移除容器（数据仍在 OSS）
docker compose down
```

使用了 override 的部署，后续管理命令也需使用同样的 `-f` 组合。密码工具可在镜像构建后运行：

```sh
docker run --rm -it --entrypoint /usr/local/bin/password-hash private-diary:local
```

## HTTPS 入口与网络

`Caddyfile.example` 提供“同一网关托管 Astro dist + 代理 Go”的可选入口示例。将域名替换为自己的域名，APP_ORIGIN 配置成同一个 origin。也可保留 GitHub Pages，通过已有代理将 `/api/v1/*` 交给 Go，但必须自行验证 Host/SNI、证书与重定向。

入口不得缓存 API；日记页面设置 noindex/no-store，站点地图排除日记路径。入口应增加登录频率限制，避免记录查询参数、Cookie、密码及正文。服务忽略 X-Forwarded-For，按直接连接来源限制登录；经过单一代理时多个设备共享该限制。不要开放直连公网后端绕过入口。

`/healthz` 表示 HTTP 进程存活，容器使用它探测。`/readyz` 表示目录已加载且无待恢复提交，索引恢复期间为 503。它不是每次请求都访问 OSS 的远程可用性探针；存储读写失败后相关接口会进入恢复状态。入口应在 readiness 成功后放行日记 API。

给定 OSS 地址为 HTTP。实际部署前须确认使用可信内网/加密隧道，或提供 HTTPS endpoint 并严格验证证书。服务不提供跳过证书校验选项。

## Markdown 数据与恢复

没有草稿、发布快照和状态筛选。新建和编辑均调用一次保存，阅读显示当前已保存内容；正文非空。界面仅保留保存（支持 Ctrl/Cmd+S）、编辑、预览、删除和检索。

普通保存后停留编辑页；新建首次保存后原地切换为该篇编辑地址。手机端提供折叠筛选、底部吸附保存按钮和至少 44px 的按钮触控区域，日记页独立适配窄屏导航与容器。日记应用使用 Web Awesome 3.14.0 的按钮、表单、编辑/预览标签页、确认弹窗、错误/冲突提示、标签及加载组件。按需打包到本地，主题在构建时限制到 `.diary-app`，不引入全局 native reset；公开博客和导航/页脚保留原样式。主题随站点明暗设置同步；关闭/刷新页面时的未保存提示仍由浏览器负责。

```text
<S3_PREFIX>/entries/<uuid>.md         正文 + YAML frontmatter，软删除时增加 deletedAt
<S3_PREFIX>/index/catalog.json.gz     元数据目录，schemaVersion 2
<S3_PREFIX>/index/search/[0-f].json.gz 16 个正文检索分片
<S3_PREFIX>/control/pending.json      至多一笔待完成操作，成功后删除
```

MD 文件头包含标题、日期、标签、版本、创建/更新时间和幂等控制字段，之后是直接可读的 Markdown 正文，Content-Type 为 text/markdown。没有 draft.md、published.md 或其他编辑版本。索引中的正文检索文本是可重建派生数据，不是另一份正文版本。

一次保存涉及四个对象：pending、该篇 MD、全站 catalog、该篇所在的一个 search 分片；顺序为 **4 次 PUT → DELETE pending → GET 确认删除 → 更新内存并成功返回**。会读取必要版本/分片，但不会重写其他 15 个分片。成功后只留下三个持久变化：正文、目录和对应检索分片。

首次空前缀初始化生成 1 个 catalog 和 16 个空分片，共 17 个长期对象；catalog 先写 rebuilding 后写 ready，因此共 18 次 PUT。第一次保存增加一篇 MD，正常长期对象总数为 18。账号、会话、日志不作为额外对象写入 OSS；control/probes/ 只用于显式诊断测试，完成后清理。

启动通常只读取 pending 与目录。阅读按篇读取 MD，正文检索首次加载分片后缓存；目录缺失、损坏或版本不兼容时才完整重建。成功写入前崩溃/超时会保留 pending，后台每 5 秒尝试恢复。不要因 503 手动删除 pending。完整提交之前不会向客户端报告保存成功。

旧 JSON 日记仍能读取，取最新已保存内容；首次再次保存时写为 MD，原 JSON 保留备份，不自动删除。MD 优先于同 ID JSON，不重复计数；删除后的 MD 墓碑防止旧 JSON 重现。旧 pending 经摘要验证后可以恢复成 MD。升级时停旧启新，首次加载会重建新版索引。

人工导入或修改正文时先停止所有写入进程，维护版本与时间字段后重建索引。不要在服务运行期间绕过版本机制修改 OSS：

```sh
# service 目录，使用同一份配置；完成重建后继续提供服务
go run ./cmd/server --config config.yaml --rebuild-index
```

删除为软删除，MD 中保留恢复内容，正常 API 不可读取；没有额外回收站文件、恢复 UI 或自动物理清理。备份/桶版本能力需在实际部署验证，索引不能代替备份。

## 上线前仍需完成

核对 OSS Secret、bucket、region、真实管理员配置和部署入口；在隔离前缀验证 OSS 私有权限、读写一致性、分页枚举与超时行为。对实际目标主机测量 5,000 篇规模的启动、首次检索、保存耗时和内存；本地测试不能替代真实 OSS 与网络验证。Docker 镜像与 Compose 也需在有 Docker 的环境实际构建运行。mTLS 按独立需求另行实施。

## 本次验证记录（2026-10-17）

- 通过 Go 单元测试、S3 本地协议测试、`go test -race ./...`、`go vet ./...` 和服务二进制构建。
- 通过日记组件 TypeScript 检查与独立 `astro build`，站点地图不包含 `/diary/`。
- 使用一次性测试仓储完成浏览器登录、新建、预览、保存、编辑、检索、删除和退出流程；确认修改保存后直接更新当前内容，退出后清空敏感内容，390px 宽度下没有横向溢出。预览未产生脚本、危险协议链接或远程图片节点。
- 5,000 篇本地内存仓储测试（平均正文约 13.5 KiB）：目录加载约 22ms，首次检索约 270ms，缓存检索平均约 30ms；正常启动 2 次 GET、0 次 LIST，首次检索累计 18 次 GET。这些是测试进程数据，不代表真实 OSS、目标主机性能或生产 p95。
- Compose 配置已检查 YAML 语法，本机未安装 Docker，尚未实际构建/运行镜像。初次实现时未获得真实 OSS 的完整连接配置；后续故障排查已完成下述隔离 RustFS 验证。
- 现有 `tinacms build` 的 Tina Cloud 校验未通过，完整 `npm run build` 仍需处理该云端校验；独立 Astro 构建已通过。此次未修改 TinaCMS 配置或绕过其校验。

## 排查索引未就绪与 503

恢复日志的 `reason` 包含失败阶段、S3 操作、HTTP 状态和安全错误码，不输出原始 SDK 响应、凭据或日记正文。配置文件被环境变量覆盖时，启动日志只列出变量名。

在 `service/` 目录可以单独检查存储，不启动另一份日记写入服务：

```sh
# 只读：读取控制对象和目录，枚举 entries；不创建或改写对象
go run ./cmd/server --config config.yaml --check-storage

# 显式读写检查：在 control/probes/ 下创建随机诊断对象，读回并删除
# 不修改 entries、catalog、search 或 pending
go run ./cmd/server --config config.yaml --check-storage-write
```

基础读写检查通过不等于现有索引已校验通过，也不保证每个索引对象都有写权限。查看失败进程的 `reason` 继续定位。常见错误：`DNSFailure` 为域名解析，`ConnectionRefused` 为端口连接拒绝，`NoSuchBucket` 为桶不存在，`AccessDenied` 为权限问题，`InvalidAccessKeyId`/`SignatureDoesNotMatch` 为凭据、签名或 region 等配置需核对。

尤其注意：之前 `source .env` 导入的变量仍会覆盖 `--config` 文件。需要仅使用文件中的 S3 配置时，先停止旧服务，再执行：

```sh
env -u S3_ENDPOINT -u S3_REGION -u S3_BUCKET -u S3_PREFIX -u S3_ACCESS_KEY_ID -u S3_SECRET_ACCESS_KEY -u S3_FORCE_PATH_STYLE go run ./cmd/server --config config.yaml
```

`SERVICE_UNAVAILABLE` 表示本次请求未进入持久化写入，前端保留输入后可稍后重新提交；`WRITE_OUTCOME_UNKNOWN` 表示已开始写入，结果需恢复后核对，并使用同一 mutation ID 重试。不要为处理 503 直接删除日记、pending 或索引对象。

后续 RustFS 实测（2026-10-17）：使用当前配置完成只读检查、随机探针读写删除，以及随机隔离前缀下的新建索引、保存、重启加载、正文检索和删除；隔离测试对象均清理，未改写现有业务前缀的日记与索引。此结果验证当前文件配置的基本兼容性，不代表原运行进程使用相同配置，也不代替目标规模和生产故障恢复验收。

需要再次执行隔离生命周期测试时，必须显式指定配置和开启开关。测试会在配置前缀的 `control/probes/integration-<random>/` 下生成并清理测试对象：

```sh
# 仓库根目录；不要误用为生产日记的重建命令
DIARY_S3_INTEGRATION=1 DIARY_S3_TEST_CONFIG=/absolute/path/config.yaml go -C service test ./internal/diary -run '^TestIsolatedS3Lifecycle$' -count=1 -v
```

初始化报错已由用户确认解决：之前导入的环境变量覆盖了配置文件。后续不再将它归因于 RustFS 连通性或时区，也不为此自动重建/删除业务对象。
