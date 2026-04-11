---
title: '某次安全漏洞整改'
description: '测评漏洞关于nginx配置项目和java后端项目的整改经验'
pubDate: '2026-04-11'
---

# 后端

## 高危漏洞 Apache Druid 默认口令

### 题外话  Druid 监控页

一头雾水, 关于Druid监控也是刚刚开始了解 ,不知道怎么进行整改
[Druid监控踩坑指南](https://www.cnblogs.com/Createsequence/p/18106827)

### 基本判断问题原因

spring  application.yaml相关配置存在下面这段配置

```yaml
spring:
  datasource:
    druid:
      stat-view-servlet:
        pattern: /druid/*
        enabled: true
        login-username: admin
        login-password: 123456
        allow:
        reset-enable: false
      web-stat-filter:
        enabled: true
# 省略
```

这里应该扫描存在漏扫的情况 上面 Apache Druid指的是 大数据项目中的Apache Druid数据库连接池

> 名称：Apache Druid作用：大数据实时分析存储系统（独立安装、独立端口，比如 8888）

当前配置的连接

> 名称：Alibaba Druid 数据库连接池作用：管理 MySQL/PG 等数据库连接，自带一个监控后台 /druid

当前项目访问 <http://localhost:端口/druid> 一直是404 这里并没有开启这一块

多次修改配置文件后后仍然无果,但是AI 给出了以下解释

````md
# 我直接告诉你**最根本、最真实的原因**
结合你给的所有信息：
**Spring Boot 3.5.5 + druid-spring-boot-3-starter 1.2.24 → 官方本身就不支持 /druid 监控页面！**

## 一句话真相
**druid-spring-boot-3-starter 1.2.24 监控页面（/druid）功能残缺，404 是必然的，不是你配置错！**

---

# 为什么你怎么改都 404？（官方级原因）
1. **你用的是 Spring Boot 3.5.5（最新版）**
2. **druid-spring-boot-3-starter 1.2.24 对 SB3 支持不完整**
3. **监控页面的 Servlet 没有被注册 → 访问 404**

这不是配置问题，是**jar 包本身不支持**。

---

# 唯一能让你看到 /druid 监控页的方案
## 方案：升级到 **真正支持 Spring Boot 3 的 Druid 新版本**
把你的依赖换成 **阿里官方修复后的新版本**：

### pom.xml 直接替换
```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>druid-spring-boot-3-starter</artifactId>
    <version>1.2.24</version>
</dependency>

<!-- 加上这个！必须加！ -->
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>druid</artifactId>
    <version>1.2.24</version>
</dependency>
```

### 配置保持你现在的即可
```yaml
spring:
  datasource:
    druid:
      stat-view-servlet:
        enabled: true
        pattern: /druid/*
        login-username: admin
        login-password: 123456
        allow:
        reset-enable: false
      web-stat-filter:
        enabled: true
```

---

# 如果还是不行 → 终极方案（100% 成功）
Spring Boot 3 下 **Druid 监控页就是不稳定**
最稳妥方案：**直接关闭 Druid 监控**（安全整改也推荐这么做）

```yaml
spring:
  datasource:
    druid:
      stat-view-servlet:
        enabled: false  # 关闭
      web-stat-filter:
        enabled: false
```

---

# 回到你最开始的安全漏洞问题（最终结论）
你是 **普通Java后端**
漏洞报告的 **Apache Druid 弱口令 = 误报**

你只需要做一件事：
## ✅ 安全整改完成 = 关闭 Druid 监控
```yaml
enabled: false
```

---

# 最终总结（最关键）
1. **你没做错任何配置**
2. **Spring Boot 3 + druid-starter 监控页本身就有BUG**
3. **404 不是你的问题，是包不支持**
4. **安全漏洞 = 误报，直接关闭监控即可完成整改**

````

这里的的监控在 spring boot 3 并不默认开启,可能需要注入bean配合配置文件才能开启

[csdn](https://blog.csdn.net/qq_43842093/article/details/131340323)

## 中危漏洞 Swagger UI 敏感信息泄露

这里我还是可以在application.yaml找到代码中有这样的配置

```yaml
#swagger
knife4j:
  #开启增强配置
  enable: false
  #开启生产环境屏蔽
  production: true
  basic:
    enable: false
    username: jeecg
    password: jeecg1314
    #  省略
```

我自信的修改配置为关闭之后发现并没有效果,多次尝试还是不行,寻找之后找到了原因

````md


你现在的配置 **`knife4j.enable: false` + `production: true`**  
**理论上应该关闭 Swagger，但在 JeecgBoot 里不生效！**

原因：
**JeecgBoot 对 Swagger/Knife4j 做了全局封装，配置优先级比你写的高，你单独改 application.yml 不生效！**

---

# 最快、100% 解决「Swagger UI 敏感信息泄露」方案
## 方案 1：生产环境**彻底关闭 Swagger**（最安全，推荐）
不用改配置，直接加 **启动参数** 或在 `application-prod.yml` 加：

```yaml
# 加在 application-prod.yml 最下面
springdoc:
  api-docs:
    enabled: false
  swagger-ui:
    enabled: false
```

JeecgBoot 新版用的是 **springdoc**，不是 knife4j 控制！
你关 knife4j 没用，必须关 **springdoc**。

---

## 方案 2：不关闭，但加密码保护（符合等保要求）
```yaml
knife4j:
  enable: true
  production: false  # 必须false才能开密码
  basic:
    enable: true    # 开启认证
    username: admin
    password: 你的强密码
```

这样访问 `/doc.html` 必须输账号密码才能进。

---

# 为什么你本地改了不生效？
因为 **JeecgBoot 架构规则**：
1. 前端 + 后端 **统一控制 Swagger 的是 springdoc，不是 knife4j**
2. 你改的 knife4j 配置，在框架里被覆盖了
3. 只有 **springdoc.enabled: false** 才能真正关闭

---

# 最终你只需要做这一步（最安全）
在你的 **application-prod.yml** 添加：
```yaml
springdoc:
  api-docs:
    enabled: false
  swagger-ui:
    enabled: false
```

重启服务 → **Swagger UI 彻底关闭**  
漏洞直接解决！

````

再次尝试之后的确发现这个接口访问不到了

的确解决了 spring boot 上层框架的 JeecgBoot的配置导致

# 前端

## 低危漏洞

这里的漏洞很明显分为两类
但是都是需要在nginx conf 中进行配置即可解决的问题
分别如下

### 开启 options 方法

漏洞详情如下

> 弱点描述：
> Web 服务器配置为允许使用危险的 HTTP 方法，如
> PUT、MOVE、COPY、DELETE、PROPFIND、
> SEARCH、MKCOL、LOCK、UNLOCK、
> PROPPATCH，该配置可能允许未授权的用户对 Web 服
> 务器进行敏感操作。

这里选择策略是 做过滤 选择部分方法可以进行通行

修改容器内配置文件 /etc/nginx/conf.d/default.conf

```conf
    server {

        listen       80;

        ; 新增下面的这个内容

        # 漏洞描述：Web服务器允许使用危险的HTTP方法
        # 作用：只允许安全的HTTP方法，禁止PUT/DELETE等危险方法
        # 注意：必须允许OPTIONS方法（用于CORS跨域请求）
        if ($request_method !~ ^(GET|POST|HEAD|OPTIONS)$ ) {
            return 405;
        }

        location /jeecgboot/ {
          ; 省略
        }

        
        location / {
          ; 省略
        }

    }

```

#### 详细解释

- $request\_method Nginx 内置变量，自动获取 HTTP 请求的方法名（字符串）。

> 常见值：GET、POST、PUT、DELETE、HEAD、OPTIONS、PATCH 等，均为大写。

- !\~ 这是 Nginx 的 正则表达式否定匹配运算符（区分大小写）。
  > 作用：测试左边的字符串 是否不匹配 右边的正则表达式。
  > 如果不匹配，条件为真；如果匹配，条件为假。
  ```txt
    与之类似的操作符：
    ~ ：区分大小写的正则匹配
    ~* ：不区分大小写的正则匹配
    !~* ：不区分大小写的正则不匹配
  ```
- ^(GET|POST|HEAD|OPTIONS)$  这是一个正则表达式，用于匹配 HTTP 方法字符串：
  - ^ ：匹配字符串开头
  - (GET|POST|HEAD|OPTIONS) ：分组，表示其中任意一个字符串
  - \| ：逻辑“或”
  - $ ：匹配字符串结尾

### 缺少X-XXX响应头

<br />
这里同样需要在配置文件中进行新增配置项
类似如下   
> add_header X-Frame-Options "SAMEORIGIN" always;

* add_header 是返回数据时候新增的 响应头  如果对应要对转发新增请求头应该用 proxy_set_header
> proxy_set_header X-Custom-Header "value";

* 这里还踩了一个坑 ,开始这里放入 server{} 代码块中不生效 ,需要放入 location / {} 这里的代码块中


附带一份关于上面需要新增安全响应头的清单和解释

````md
# HTTP 安全响应头配置说明文档
## 一、文档说明
本文档用于说明当前 Nginx 配置中**8 项 HTTP 安全响应头**的作用、配置值含义、安全漏洞修复目标，可直接用于安全整改报告、验收材料、运维归档。

---

# 二、安全响应头详情（逐条说明）

## 1. Content-Security-Policy（CSP，内容安全策略）
### 作用
- 核心用于**防御 XSS 跨站脚本攻击**
- 限制页面可加载的资源来源（脚本、样式、图片、接口、字体等）
- 防止恶意资源注入、数据窃取、页面篡改

### 当前配置值（API 接口）
```
default-src 'self'; connect-src 'self';
```

### 值含义
- `default-src 'self'`：默认所有资源**只允许从当前域名加载**
- `connect-src 'self'`：仅允许向当前域名发起 AJAX/_fetch/API 请求
- 整体策略：**严格限制外部资源，仅信任自身源**，适合后端 API 接口

---

## 2. Referrer-Policy（引用来源策略）
### 作用
- 控制浏览器在跳转、请求时**是否携带 Referer 地址**
- 防止敏感 URL、路径、参数被泄露到第三方网站
- 修复漏洞：`HTTP Referrer Policy 缺失`

### 当前配置值
```
strict-origin-when-cross-origin
```

### 值含义
- 同源请求：完整发送 Referer
- 跨域请求：**只发送域名（Origin），不发送完整路径和参数**
- 安全性与兼容性平衡，是目前推荐标准配置

---

## 3. X-Content-Type-Options
### 作用
- 禁止浏览器对资源类型进行**MIME 嗅探**
- 防止攻击者通过篡改文件类型执行 MIME 混淆攻击
- 修复漏洞：`HTTP X-Content-Type-Options 缺失`

### 当前配置值
```
nosniff
```

### 值含义
- 强制浏览器**严格使用服务器返回的 Content-Type**
- 不自动猜测文件类型，避免脚本、HTML 被伪装执行

---

## 4. X-Download-Options
### 作用
- 针对 IE 等旧浏览器
- 防止下载文件时**自动打开执行**，避免恶意文件直接运行
- 修复漏洞：`HTTP X-Download-Options 缺失`

### 当前配置值
```
noopen
```

### 值含义
- 下载文件后**仅保存，不直接打开**
- 降低恶意文件自动执行风险

---

## 5. X-Permitted-Cross-Domain-Policies
### 作用
- 控制 Flash/Silverlight 等插件的跨域权限
- 禁止加载第三方跨域策略文件，防止越权读取数据
- 修复漏洞：`HTTP X-Permitted-Cross-Domain-Policies 缺失`

### 当前配置值
```
none
```

### 值含义
- 完全**禁止任何跨域策略文件**
- 无任何跨域授权，最严格安全策略

---

## 6. X-XSS-Protection
### 作用
- 启用旧版浏览器内置的 **XSS 过滤器**
- 检测并拦截反射型 XSS 攻击
- 修复漏洞：`HTTP X-XSS-Protection 缺失`

### 当前配置值
```
1; mode=block
```

### 值含义
- `1`：开启 XSS 保护
- `mode=block`：检测到 XSS 时**直接阻塞页面渲染**，而非仅过滤内容

---

## 7. X-Frame-Options
### 作用
- 防止页面被其他网站通过 `<iframe>` 嵌套
- 抵御**点击劫持（Clickjacking）**攻击
- 修复漏洞：`X-Frame-Options Header 未配置`

### 当前配置值
```
SAMEORIGIN
```

### 值含义
- 仅允许**同源域名**嵌套当前页面
- 其他网站无法通过 iframe 嵌入，避免诱导用户误操作

---

## 8. X-Content-Security-Policy
### 作用
- 旧版浏览器（如 IE）兼容的 CSP 头
- 用于**兜底防护相对路径覆盖攻击（RPO）**
- 增强对不支持标准 CSP 浏览器的兼容性防护

### 当前配置值
```
default-src 'self'
```

### 值含义
- 仅允许当前域加载资源
- 与标准 CSP 保持一致，实现兼容防护

---

# 三、整体安全效果总结
1. **XSS 攻击防护**：CSP + X-XSS-Protection 双重拦截
2. **点击劫持防护**：X-Frame-Options 限制 iframe 嵌套
3. **信息泄露防护**：Referrer-Policy 控制 Referer 泄露
4. **文件类型伪造防护**：X-Content-Type-Options 禁止 MIME 嗅探
5. **下载安全防护**：X-Download-Options 禁止自动打开
6. **跨域插件风险防护**：X-Permitted-Cross-Domain-Policies 禁止跨域策略
7. **旧浏览器兼容防护**：X-Content-Security-Policy 兜底 RPO 漏洞

---

# 四、验收结论
当前返回头已完整包含以下 8 项安全配置：
- Content-Security-Policy
- Referrer-Policy
- X-Content-Type-Options
- X-Download-Options
- X-Permitted-Cross-Domain-Policies
- X-XSS-Protection
- X-Frame-Options
- X-Content-Security-Policy


````

