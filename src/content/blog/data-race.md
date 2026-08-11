---
title: 'go数据竞争问题排查'
description: 'go数据竞争问题排查'
pubDate: '2026-08-11'
tags:
  - Code
---
# Gin 脱敏中间件偶发失效问题排查与修复

## 1. 问题背景

接口：

```text
GET /api/v1/threeactuals/populations
```

该接口返回人口列表，其中包含姓名 `name`、身份证号 `id_number` 等敏感字段。响应在返回客户端之前，会经过：

```text
pkg/middleware/desensitize.go
```

进行统一脱敏。

线上观察到的现象是：相同接口连续请求时，大部分响应正常脱敏，但偶尔会出现姓名没有脱敏的情况，例如十次请求中可能出现一次。

正常结果：

```json
{
  "name": "**明",
  "id_number": "1****************X"
}
```

异常结果：

```json
{
  "name": "王小明",
  "id_number": "1****************X"
}
```

最终确认：问题不是随机数、数据库数据变化或者 JSON 编码不稳定，而是中间件实例保存了请求级状态，在多个 HTTP 请求之间产生了数据竞争。

修复提交：

```text
32f2f1c0 fix(middleware): avoid desensitize request race
```

## 2. 请求处理链路

脱敏中间件在应用启动时只创建一次：

```go
desensitizeMiddleware := middleware.Desensitize(middleware.DesensitizeMiddleware{
    WhitelistedRoutes: config.C.Middleware.Desensitize.WhitelistedRoutes,
    Rids:              config.C.Middleware.Desensitize.Rids,
})
e.Use(desensitizeMiddleware.Handler())
```

整个生命周期可以简化为：

```text
                          application startup
                                  |
                                  v
                 +--------------------------------+
                 | DesensitizeMiddleware instance |
                 | created once and reused         |
                 +---------------+----------------+
                                 |
                      shared by all requests
                                 |
              +------------------+------------------+
              |                                     |
              v                                     v
       population request A                  enterprise request B
              |                                     |
              +--------------- Gin -----------------+
                              concurrent
```

单个请求进入中间件后的处理流程为：

```text
request
   |
   v
check route/method/permission
   |
   v
decide whether name should be masked
   |
   v
replace response writer with buffer
   |
   v
c.Next() -> execute API/BIZ/DAL
   |
   v
read buffered JSON response
   |
   v
maskSensitiveData()
   |
   v
write masked response to client
```

关键点是 `c.Next()` 前后存在明显的时间间隔。人口接口在 `c.Next()` 内需要查询数据库、组装数据。在这个时间窗口中，其他请求可以进入同一个中间件实例并修改共享字段。

## 3. 排查流程

### 3.1 先确认是否存在稳定的跳过条件

中间件会在以下情况直接跳过脱敏：

```go
if c.Query("show_raw") == "1" ||
    !d.isWhitelistedRoute(c.FullPath()) ||
    c.Request.Method != http.MethodGet {
    c.Next()
    return
}
```

权限判断也可能跳过脱敏：

```go
if userID == "root" || hasIntersection(d.Rids, userRids) {
    c.Next()
    return
}
```

对同一个 URL、同一个用户和同一种请求方法而言，这些条件通常是稳定的，不能自然解释“十次请求偶发一次”。如果它们是原因，结果应当是稳定地脱敏或稳定地不脱敏。

因此排查重点转向并发共享状态。

### 3.2 检查中间件实例字段

修复前的结构体包含：

```go
type DesensitizeMiddleware struct {
    WhitelistedRoutes []string
    Rids              []string
    shouldMaskName    bool
}
```

其中：

- `WhitelistedRoutes` 是启动配置，可以被所有请求只读共享。
- `Rids` 是启动配置，也可以被所有请求只读共享。
- `shouldMaskName` 会根据当前请求的路由不断变化，是请求级状态。

问题在于三者都被放进了同一个长生命周期对象。

修复前每个请求都会写这个字段：

```go
d.shouldMaskName = false

if d.isPopulationsRoute(c.FullPath()) ||
    d.isKeyPersonnels(c.FullPath()) ||
    d.isCarePersonnels(c.FullPath()) {
    d.shouldMaskName = true
}
```

响应脱敏阶段又会读取它：

```go
if rule.name == "name" {
    if d.shouldMaskName {
        itemMap[rule.name] = d.maskName(value.(string))
    }
}
```

Gin 会为并发请求使用不同的 goroutine，但这些 goroutine 调用的是同一个 `*DesensitizeMiddleware`，因此读写的是同一个内存地址。

### 3.3 建立单请求基线测试

首先验证没有并发时，脱敏规则本身是正确的：

```go
func TestDesensitizePopulationResponse(t *testing.T) {
    router := newDesensitizeTestRouter(nil, nil)
    recorder := performDesensitizeRequest(router, populationRoute)

    require.Equal(t, http.StatusOK, recorder.Code)
    assertPopulationMasked(t, recorder)
}
```

断言内容：

```go
require.Equal(t, "**明", response.Data[0].Name)
require.Equal(
    t,
    "1"+strings.Repeat("*", len(rawIDNumber)-2)+"X",
    response.Data[0].IDNumber,
)
```

运行结果：

```text
ok backend/pkg/middleware
```

这一步排除了姓名脱敏函数、身份证脱敏函数以及基本 JSON 处理逻辑本身存在确定性错误的可能。

### 3.4 用固定时序稳定复现业务现象

仅仅连续发送请求，能否复现取决于操作系统和 Go 调度器，测试容易变成偶发失败。为了得到稳定反馈，需要主动控制两个请求的执行顺序。

测试使用 channel 构造以下时序：

```text
time ------------------------------------------------------------->

population request A
    set shouldMaskName = true
    enter handler and wait
           |
           |       enterprise request B
           |           set shouldMaskName = false
           |           enter handler and wait
           |                    |
           +---- release A <----+
                    |
                    v
          A reads shouldMaskName = false
                    |
                    v
             name is not masked
```

核心测试代码：

```go
populationResult := make(chan *httptest.ResponseRecorder, 1)
go func() {
    populationResult <- performDesensitizeRequest(router, populationRoute)
}()
<-populationEntered

enterpriseResult := make(chan *httptest.ResponseRecorder, 1)
go func() {
    enterpriseResult <- performDesensitizeRequest(router, enterpriseRoute)
}()
<-enterpriseEntered

close(releasePopulation)
populationRecorder := <-populationResult
```

修复前，该测试稳定得到：

```text
expected: "**明"
actual:   "王小明"
```

这条测试证明的不是“代码中可能有竞态”，而是竞态确实可以产生用户观察到的业务结果。

### 3.5 使用 race detector 定位内存竞争

执行命令：

```bash
go test -race ./pkg/middleware
```

为了提高竞态触发概率，测试同时启动 64 个请求，一半请求人口接口，一半请求企业接口：

```go
const requestCount = 64

for i := 0; i < requestCount; i++ {
    path := populationRoute
    if i%2 == 1 {
        path = enterpriseRoute
    }

    go func(requestPath string) {
        <-start
        performDesensitizeRequest(router, requestPath)
    }(path)
}

close(start)
```

修复前得到的关键报告为：

```text
WARNING: DATA RACE

Write at 0x... by goroutine 25:
  backend/pkg/middleware.(*DesensitizeMiddleware).Handler.func...
      pkg/middleware/desensitize.go:49

Previous write at 0x... by goroutine 46:
  backend/pkg/middleware.(*DesensitizeMiddleware).Handler.func...
      pkg/middleware/desensitize.go:49
```

另一组报告同时指向：

```text
pkg/middleware/desensitize.go:49
pkg/middleware/desensitize.go:52
```

这两个位置对应修复前的代码：

```go
// line 49
d.shouldMaskName = false

// line 52
d.shouldMaskName = true
```

race detector 报告中最重要的信息有四项：

1. `Write at 0x...`：当前 goroutine 正在写某个内存地址。
2. `Previous write at 0x...`：另一个 goroutine 也在访问同一个地址。
3. 两次访问至少有一次是写操作。
4. 两次访问之间不存在 race detector 能识别的同步关系。

报告还会给出 goroutine 的创建位置：

```text
pkg/middleware/desensitize_test.go:109
```

这说明竞态不是测试框架内部产生的，而是并发请求从测试入口进入真实 Gin Handler 后，在生产中间件代码里发生的。

需要注意：race detector 只报告运行时真正执行到的竞争访问。它不会仅通过阅读源码推断所有潜在竞态。因此：

```text
没有 race 报告 != 代码一定没有竞态
有 race 报告     = 已经捕获到真实的并发冲突
```

## 4. 根因原理

### 4.1 配置状态与请求状态生命周期不一致

原设计把两类生命周期完全不同的数据放在同一个结构体中：

```text
+---------------------------------------------------+
| DesensitizeMiddleware                             |
+---------------------------------------------------+
| WhitelistedRoutes | application lifetime, readonly|
| Rids              | application lifetime, readonly|
| shouldMaskName    | request lifetime, mutable     |
+---------------------------------------------------+
```

中间件实例的生命周期约等于整个应用进程，而 `shouldMaskName` 的正确生命周期只应该覆盖一个请求。

只读配置被并发共享没有问题；可变的请求状态被并发共享就会产生请求间污染。

### 4.2 什么是 data race

在 Go 中，当以下条件同时成立时，就构成 data race：

1. 两个或多个 goroutine 访问同一个内存地址。
2. 至少一个访问是写操作。
3. 访问之间没有通过 channel、mutex、atomic 等方式建立同步关系。

本问题完全符合：

```text
goroutine A                              goroutine B
    |                                        |
    | write d.shouldMaskName = true          |
    |                                        | write d.shouldMaskName = false
    |                                        |
    | read d.shouldMaskName                  |
    |                                        |
    +------------ same memory address -------+
```

由于没有 happens-before 关系，程序不能依赖某个 goroutine 最后看到哪一个值。

### 4.3 为什么它表现为“偶发”

错误是否出现取决于多个时间因素：

- 两个请求是否同时进入服务。
- 路由匹配和权限判断执行到哪一步。
- 数据库查询耗时。
- Go 调度器何时切换 goroutine。
- CPU 核数和当前服务负载。
- 是否同时存在其他白名单接口请求。

因此生产环境可能出现：

```text
low concurrency  -> almost never reproduced
high concurrency -> reproduction rate increases
```

“十次出现一次”不是一个固定概率，只是当前流量、接口耗时和调度时序共同形成的观察结果。

### 4.4 为什么 `c.Next()` 放大了竞争窗口

共享字段在 `c.Next()` 之前写入，在 `c.Next()` 之后读取：

```go
d.shouldMaskName = true

c.Next() // API + BIZ + DAL, may take a long time

if d.shouldMaskName {
    // mask name
}
```

可以将其看成：

```text
write shared state
        |
        |<------ long concurrent window ------>|
        |
read shared state
```

请求处理时间越长，其他请求进入并覆盖共享状态的机会越多。

### 4.5 为什么身份证号不直接受该字段影响

修复前，姓名 `name` 的规则读取 `shouldMaskName`：

```go
if rule.name == "name" {
    if d.shouldMaskName {
        itemMap[rule.name] = d.maskName(value.(string))
    }
}
```

身份证号则无条件调用脱敏函数：

```go
{"id_number", d.maskIDNumber},
```

```go
itemMap[rule.name] = rule.maskFunc(value.(string))
```

因此，这次 data race 可以直接解释“姓名偶发不脱敏”，但不能单独解释同一响应中的姓名和身份证号同时保持原文。

如果两个字段同时完全未脱敏，应继续检查整个中间件是否被跳过：

- 请求是否携带 `show_raw=1`。
- 当前用户是否为 `root`。
- 当前用户角色是否命中 `Rids`。
- 路由是否在脱敏白名单中。
- 请求方法是否为 GET。
- 响应是否为 HTTP 200 JSON。
- 负载均衡后的服务实例是否存在配置或版本差异。

## 5. 修复方案

### 5.1 修复前

请求级策略保存在共享实例上：

```go
type DesensitizeMiddleware struct {
    WhitelistedRoutes []string
    Rids              []string
    shouldMaskName    bool
}

d.shouldMaskName = false
if d.isPopulationsRoute(c.FullPath()) {
    d.shouldMaskName = true
}

c.Next()

d.maskSensitiveData(data)
```

### 5.2 修复后

`shouldMaskName` 改为 Handler 调用栈中的局部变量：

```go
shouldMaskName := false
if d.isPopulationsRoute(c.FullPath()) ||
    d.isKeyPersonnels(c.FullPath()) ||
    d.isCarePersonnels(c.FullPath()) {
    shouldMaskName = true
}

c.Next()

d.maskSensitiveData(data, shouldMaskName)
```

调用链显式传递策略：

```text
Handler
   |
   | shouldMaskName
   v
maskSensitiveData
   |
   | shouldMaskName
   v
maskFields / maskNestedFields
```

现在每次 Handler 调用都有自己独立的 `shouldMaskName` 变量，不再通过中间件实例共享：

```text
goroutine A stack                   goroutine B stack
+-----------------------+           +-----------------------+
| shouldMaskName = true |           | shouldMaskName = false|
+-----------------------+           +-----------------------+
           |                                      |
           +--------- no shared mutable state ----+
```

这里的“stack”表示逻辑上的调用边界，不应理解为变量在物理上一定分配在 goroutine 栈中。Go 编译器可能根据逃逸分析把局部变量分配到堆上。是否发生 data race 的关键不是变量位于栈还是堆，而是多个 goroutine 是否持有并发访问同一份内存的引用。当前方案中，每次 Handler 调用持有独立变量，因此即使编译器选择堆分配，也不会产生请求间共享。

### 5.3 为什么没有使用 mutex

使用 mutex 可以消除 race detector 报告，但不适合这个场景。

如果只在字段读写时加锁：

```go
mu.Lock()
d.shouldMaskName = true
mu.Unlock()
```

锁释放后，其他请求仍然可以覆盖这个值，业务语义依旧错误。

如果从设置字段开始一直锁到响应脱敏完成，则所有相关 HTTP 请求会被串行执行：

```text
request A: lock ------------------------------- unlock
request B:          wait wait wait wait wait -> lock
```

这会显著降低并发能力。该状态本来就不需要共享，因此正确方案不是“保护共享”，而是“取消共享”。

同理，把字段改成 `atomic.Bool` 只能保证单次读写的原子性，不能保证请求 A 读取到的一定是请求 A 写入的值，也不能解决请求间语义污染。

## 6. 修复验证

普通测试：

```bash
go test ./pkg/middleware
```

结果：

```text
ok backend/pkg/middleware
```

race 检测：

```bash
go test -race ./pkg/middleware
```

结果：

```text
ok backend/pkg/middleware
```

验证覆盖了三个层次：

| 测试 | 目的 |
| --- | --- |
| `TestDesensitizePopulationResponse` | 验证单请求下姓名、身份证号脱敏规则正确 |
| `TestDesensitizePopulationConcurrentWithOtherWhitelistedRoute` | 用固定并发时序验证请求策略不会互相污染 |
| `TestDesensitizeHandlerConcurrentAccess` | 使用大量并发请求配合 race detector 检查共享内存竞争 |

## 7. 排查过程中的关键经验

### 7.1 中间件实例默认应被视为并发共享对象

在 Gin 中，通过 `Use()` 注册的中间件函数会被所有匹配请求复用。中间件闭包捕获的指针、全局变量和单例对象都可能被多个 goroutine 同时访问。

设计中间件结构体时，应优先遵守：

```text
middleware struct = immutable configuration + thread-safe dependencies
request state     = local variables or request context
```

### 7.2 请求级变量不要放进单例结构体

以下字段通常属于请求级状态：

- 当前请求是否需要某项处理。
- 当前用户、角色和租户。
- 当前路由派生出的策略。
- 当前响应缓冲区。
- 临时统计值和错误信息。

这些数据应优先放在：

1. Handler 局部变量。
2. `gin.Context`。
3. `context.Context`。

只有确实需要跨请求共享的数据，才应该进入中间件实例。

### 7.3 race detector 必须配合能触发路径的测试

最初执行：

```bash
go test -race ./pkg/middleware
```

如果包中没有测试，结果只会是：

```text
? backend/pkg/middleware [no test files]
```

这不代表没有 data race，只代表被怀疑的代码路径没有执行。

正确顺序是：

```text
build concurrent test scenario
             |
             v
execute actual Handler path
             |
             v
run with -race
             |
             v
interpret memory access stacks
```

### 7.4 业务断言和 race 检测解决不同问题

race detector 证明的是“存在未同步的内存访问”，业务测试证明的是“这种访问会造成用户可见错误”。二者不能完全互相替代。

```text
+----------------------+------------------------------------+
| deterministic test   | proves the exact masking failure   |
| race detector        | proves unsynchronized memory access|
+----------------------+------------------------------------+
```

本次同时保留两类测试：

- channel 控制时序，使姓名裸露稳定复现。
- 64 个并发请求，使 race detector 更容易捕获竞争访问。

### 7.5 偶发问题首先寻找时间和并发条件

当输入、用户、路由、配置都没有变化，但输出偶尔不同，应优先检查：

- 共享可变状态。
- goroutine 和异步任务。
- 缓存更新。
- 对象复用或池化。
- 超时和取消。
- 多实例版本、配置差异。

“偶发”通常不是没有原因，而是触发条件中包含不受业务代码直接控制的调度和时间顺序。

### 7.6 修复 data race 不等于只让 `-race` 通过

mutex 或 atomic 可能让 race 报告消失，但如果请求 A 仍可能读取到请求 B 写入的状态，业务错误仍然存在。

修复时需要同时满足：

```text
memory safety + request isolation + correct business semantics
```

本次将字段改为请求局部变量，同时满足了三项要求。

## 8. Go 并发与 race detector 教学

### 8.1 data race 和 race condition 不是同一个概念

这两个术语经常被混用，但含义不同。

`data race` 指未同步的并发内存访问：

```text
same memory address
        +
two or more goroutines
        +
at least one write
        +
no synchronization
        =
data race
```

`race condition` 指程序结果依赖事件的执行顺序。它可能不包含 data race，例如两个操作都通过 mutex 正确加锁，但业务上仍然采用了错误的检查与执行顺序。

示例：以下程序有 data race：

```go
package main

import "sync"

func main() {
    var wg sync.WaitGroup
    value := 0

    wg.Add(2)
    go func() {
        defer wg.Done()
        value = 1
    }()
    go func() {
        defer wg.Done()
        value = 2
    }()

    wg.Wait()
}
```

`WaitGroup` 只保证主 goroutine 会等待两个任务完成。它没有规定两个工作 goroutine 的写入顺序，也没有保护它们对 `value` 的并发访问。

以下程序没有 data race，但结果仍依赖顺序：

```go
var (
    mu    sync.Mutex
    value int
)

go func() {
    mu.Lock()
    value = 1
    mu.Unlock()
}()

go func() {
    mu.Lock()
    value = 2
    mu.Unlock()
}()
```

mutex 保证任意时刻只有一个 goroutine 写入，因此没有 data race；但最终值可能是 1，也可能是 2。如果业务要求固定结果，这仍然是需要解决的顺序问题。

本次脱敏问题同时具备两层问题：

- 内存层面：`shouldMaskName` 存在 data race。
- 业务层面：请求 A 可能读取到请求 B 的策略，存在请求间状态污染。

### 8.2 `go test -race` 做了什么

执行：

```bash
go test -race ./pkg/middleware
```

Go 会使用开启 race instrumentation 的方式重新编译目标包及其依赖，在内存读写、goroutine 创建和同步操作附近插入检测逻辑。程序运行时，race detector 记录内存访问以及 goroutine 之间的同步关系。

可以将检测过程简化理解为：

```text
source code
    |
    v
compile with -race instrumentation
    |
    v
run tests and record memory accesses
    |
    v
compare accesses to the same address
    |
    +-- synchronized ------> allowed
    |
    +-- unsynchronized
          and has write ---> DATA RACE
```

`-race` 是动态检测，不是纯静态扫描。只有测试实际执行到的代码路径才会被检查。

例如：

```text
go test -race ./pkg/middleware
? backend/pkg/middleware [no test files]
```

这个结果只说明没有测试执行中间件，并不能证明中间件没有竞态。必须先构造能运行目标路径的测试。

开启 race detector 会增加运行时间和内存消耗，因此一般用于：

- 本地并发问题排查。
- CI 中的专项测试任务。
- 集成测试或预发布环境。
- 对核心并发包定期执行检测。

通常不建议长期把 race 版本作为正式生产版本运行。

### 8.3 如何逐段阅读 race 报告

以下是本次报告的简化形式：

```text
==================
WARNING: DATA RACE
Write at 0x00c0005edb30 by goroutine 25:
  backend/pkg/middleware.(*DesensitizeMiddleware).Handler.func3()
      pkg/middleware/desensitize.go:49
  github.com/gin-gonic/gin.(*Context).Next()
      .../gin/context.go:174

Previous write at 0x00c0005edb30 by goroutine 46:
  backend/pkg/middleware.(*DesensitizeMiddleware).Handler.func3()
      pkg/middleware/desensitize.go:52

Goroutine 25 (running) created at:
  backend/pkg/middleware.TestDesensitizeHandlerConcurrentAccess()
      pkg/middleware/desensitize_test.go:109

Goroutine 46 (running) created at:
  backend/pkg/middleware.TestDesensitizeHandlerConcurrentAccess()
      pkg/middleware/desensitize_test.go:109
==================
```

可以按照下面的顺序阅读。

#### 第一步：确认访问类型

```text
Write at ...
Previous write at ...
```

这是一组 Write/Write 冲突，表示两个 goroutine 都在写同一内存地址。

常见组合还有：

| 报告组合 | 含义 |
| --- | --- |
| `Read` / `Write` | 一个 goroutine 读取时，另一个 goroutine 正在写入 |
| `Write` / `Write` | 两个 goroutine 并发写入同一内存 |
| `Read` / `Read` | 不构成 data race，race detector 不会因为纯并发读取报警 |

本次 Write/Write 对应多个请求同时执行：

```go
d.shouldMaskName = false
```

或者一个请求写 `false`，另一个请求写 `true`：

```go
d.shouldMaskName = false
d.shouldMaskName = true
```

#### 第二步：比较内存地址

```text
Write at 0x00c0005edb30
Previous write at 0x00c0005edb30
```

两个地址完全相同，说明两个 goroutine 操作的是同一个字段实例，而不是两个恰好同名的局部变量。

地址主要用于帮助 detector 和开发者确认访问对象一致。实际排查时不需要长期记住这个地址，因为每次运行的地址都可能不同。

#### 第三步：找到第一处项目代码

调用栈可能同时包含业务代码、Gin 框架和 Go 标准库。阅读时优先找第一条属于当前仓库的路径：

```text
backend/pkg/middleware.(*DesensitizeMiddleware).Handler.func3()
    pkg/middleware/desensitize.go:49
```

这表示：

- 包：`backend/pkg/middleware`
- 方法：`DesensitizeMiddleware.Handler` 返回的闭包
- 文件：`pkg/middleware/desensitize.go`
- 行号：修复前第 49 行

`func3` 是编译器对匿名函数生成的内部名称，不代表源码中存在一个叫 `func3` 的显式函数。

#### 第四步：查看另一侧访问栈

只看第一处访问通常无法判断竞争关系，还需要继续读：

```text
Previous write at ... by goroutine 46
```

本次另一侧指向同一个 Handler 的第 49 或第 52 行，说明同一个中间件实例正被多个 HTTP 请求并发修改。

如果报告是 Read/Write，则应分别确认：

```text
reader: where the stale or inconsistent value is consumed
writer: where another goroutine changes the value
```

两侧调用栈必须一起分析，不能只修 race 报告中的第一行。

#### 第五步：查看 goroutine 从哪里创建

```text
Goroutine 25 created at:
    pkg/middleware/desensitize_test.go:109
```

这部分不是共享内存的访问位置，而是 goroutine 的来源。它回答的是：“这两个并发执行单元为什么会同时存在？”

本次创建栈指向测试中的：

```go
go func(requestPath string) {
    performDesensitizeRequest(router, requestPath)
}(path)
```

再沿调用栈向下可以看到 `ServeHTTP`、Gin Router 和中间件 Handler，从而还原完整调用链：

```text
test goroutine
    |
    v
httptest request
    |
    v
gin.Engine.ServeHTTP
    |
    v
DesensitizeMiddleware.Handler
    |
    v
write shouldMaskName
```

#### 第六步：还原最小竞争关系

阅读完两侧栈后，可以把长报告压缩成一句话：

```text
两个由并发 HTTP 测试创建的 goroutine，正在无同步地写同一个
DesensitizeMiddleware.shouldMaskName 字段。
```

只有能写出这样的句子，才算真正读懂一份 race 报告。

### 8.4 行号与当前源码不一致时怎么办

race 报告记录的是测试运行时所使用代码的行号。代码修复、格式化或增加注释后，当前文件的行号可能已经变化。

本次报告中的第 49、52 行属于修复前版本。查看历史代码可以使用：

```bash
git show 32f2f1c0^:pkg/middleware/desensitize.go | nl -ba | sed -n '40,60p'
```

含义：

- `32f2f1c0^`：修复提交的父提交，也就是修复前版本。
- `git show <commit>:<path>`：读取指定提交中的文件。
- `nl -ba`：显示包括空行在内的准确行号。
- `sed -n '40,60p'`：只查看报告附近的代码。

查看当前版本则可以使用：

```bash
nl -ba pkg/middleware/desensitize.go | sed -n '40,60p'
```

排查历史 race 日志时，应始终使用日志产生时对应的 commit。否则很容易在已经变化的文件中找到错误代码位置。

### 8.5 happens-before 是什么

race detector 不只是判断两个操作的物理时间是否重叠，还会判断操作之间是否存在可证明的同步顺序，也就是 happens-before 关系。

可以简单理解为：如果同步机制保证操作 A 的结果对操作 B 可见，那么 A happens-before B。

#### channel

```go
value := 0
done := make(chan struct{})

go func() {
    value = 1
    close(done)
}()

<-done
fmt.Println(value)
```

`close(done)` 与 `<-done` 建立同步关系，`value = 1` 发生在主 goroutine 读取 `value` 之前。

#### mutex

```go
mu.Lock()
value = 1
mu.Unlock()

mu.Lock()
fmt.Println(value)
mu.Unlock()
```

对同一个 mutex，前一次 `Unlock` 与后续成功的 `Lock` 建立顺序。

#### WaitGroup

```go
var wg sync.WaitGroup
value := 0

wg.Add(1)
go func() {
    defer wg.Done()
    value = 1
}()

wg.Wait()
fmt.Println(value)
```

工作 goroutine 中 `Done` 之前的操作，在对应的 `Wait` 返回后可见。但 WaitGroup 不会自动保护多个工作 goroutine 之间同时读写同一个变量。

#### atomic

`sync/atomic` 可以为特定变量提供原子访问和内存顺序，但它只适合状态确实需要共享的场景。本次 `shouldMaskName` 不应该跨请求共享，所以使用 atomic 不是正确的建模方式。

### 8.6 常用 race 检测命令

运行一个包的所有测试：

```bash
go test -race ./pkg/middleware
```

只运行某个测试：

```bash
go test -race ./pkg/middleware \
  -run '^TestDesensitizeHandlerConcurrentAccess$'
```

禁用测试缓存，确保重新执行：

```bash
go test -race ./pkg/middleware -count=1
```

连续运行多次，提高低概率问题的触发机会：

```bash
go test -race ./pkg/middleware -count=20
```

测试整个仓库：

```bash
go test -race ./...
```

整个仓库的 race 测试通常耗时较长，也可能暴露与当前任务无关的既有问题。实际排查时建议先从最小包和单个测试开始，再逐步扩大范围。

可以通过 `GORACE` 调整 detector 行为，例如检测到第一处竞态后退出：

```bash
GORACE="halt_on_error=1" go test -race ./pkg/middleware
```

在 CI 日志中缩短绝对路径：

```bash
GORACE="strip_path_prefix=/workspace/" go test -race ./pkg/middleware
```

### 8.7 race detector 的能力边界

race detector 很重要，但它不能代替并发设计和业务测试。

它不能保证发现：

- 测试没有执行到的代码路径。
- 只在特殊生产流量下触发的路径。
- 没有未同步内存访问的逻辑竞态。
- 分布式系统中不同进程、不同服务实例之间的状态竞争。
- 数据库事务隔离、缓存一致性和消息顺序问题。

它也不会判断业务值是否正确。例如所有访问都使用 mutex 后，race detector 可能通过，但请求 A 仍可能在业务上采用请求 B 的状态。

因此完整验证应包含：

```text
unit assertions
      +
deterministic concurrency scenario
      +
race detector
      +
integration or production evidence when necessary
```

### 8.8 阅读 race 报告的快速清单

拿到一份 `WARNING: DATA RACE` 后，按以下顺序处理：

- [ ] 当前访问是 `Read` 还是 `Write`。
- [ ] Previous access 是 `Read` 还是 `Write`。
- [ ] 两侧是否指向同一个内存地址。
- [ ] 两侧调用栈中第一条项目代码在哪里。
- [ ] 行号对应的是哪个 commit。
- [ ] goroutine 是在哪里创建的。
- [ ] 两个访问为什么没有 happens-before 关系。
- [ ] 共享变量应该加同步，还是根本不应该共享。
- [ ] 是否存在能够证明用户可见错误的业务断言。
- [ ] 修复后是否同时重跑普通测试和 `-race`。

## 9. 并发中间件检查清单

后续新增或评审 Gin 中间件时，可以检查：

- [ ] 中间件结构体中的字段是否全部只读或并发安全。
- [ ] 是否把当前请求派生出的状态写入了共享实例。
- [ ] `c.Next()` 前写入、`c.Next()` 后读取的数据是否可能被其他请求修改。
- [ ] response writer、buffer、map、slice 是否为每个请求独立创建。
- [ ] 是否存在“加锁后没有 race，但请求语义仍互相覆盖”的情况。
- [ ] 是否有真实 Handler 级别的并发测试，而不仅是工具函数测试。
- [ ] `go test -race` 是否实际执行了目标代码路径。
- [ ] 是否同时验证了正常功能和高并发行为。

## 10. 总结

本次问题的根因可以概括为：

```text
request-scoped mutable state
             +
application-scoped middleware instance
             +
concurrent Gin requests
             =
cross-request state contamination and data race
```

排查过程中，先用单请求测试确认脱敏规则正确，再用 channel 固定并发时序复现姓名裸露，最后使用 `go test -race` 将竞争访问定位到修复前 `desensitize.go` 第 49、52 行。修复时没有通过 mutex 或 atomic 继续维护共享状态，而是把 `shouldMaskName` 恢复到它正确的生命周期：单个请求。

最终，确定性并发测试和 race 检测均通过，说明用户可见的脱敏异常和底层共享内存竞争都已被覆盖。
