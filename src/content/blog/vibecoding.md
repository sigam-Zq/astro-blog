---
title: 'vibe coding的思路和技巧'
description: 'vibe coding的思路和技巧'
pubDate: 2026-08-09T02:44:05.569Z
heroImage: '/blog-placehoder-7.jpg'
---


## vibe coding 的思路部分

> 关于使用了vibe coding 之后的一些思考

这里的agent的介入使得代码的产生变得容易和简单, 但是由于对代码负责的需要是一个个具体的人, 这里需要针对代码功能的实现负责部分的仍然是人, 具体来说是仍然是那个使用 agent 的具体的工作的人, 所以,agent 生产出来的东西 易于验证就是一件非常重要的事情了.

这里其实就得引出之前就具备的TDD [测试驱动开发（Test Driven Development）] 的概念, 对当前的开发模式尤为的契合. 这里自然而然的就得要求 任务进行具体理解和拆解出来具体可 测试 的小任务

比如
```text
你：

帮我写一个 Go HTTP Handler

AI：

给你代码
``` 
你自己决定：

文件放哪里
怎么设计
怎么测试
怎么运行


再进一步, 就是制定标准, 然后让agent自己来进行 测试和评估,当前,目前这里我还没有走到这一步目前

但是尝试过让自己进行这里的测试和评估, 但是到底这个程度上之后, 很明显效率是极高的, 但是很明显人脑已经跟不上这里评估的标准和具体条数了.

### 所需能力的转变

它的核心不是：

“我怎么 Prompt 才能让 Codex 写得更好？”

而是：

“我怎么把项目设计成一个 Agent 很容易正确工作的环境？

```text
                Human
                  │
                  │ Intent
                  ↓
             ┌─────────┐
             │  Agent  │
             └────┬────┘
                  │
        ┌─────────┼──────────┐
        ↓         ↓          ↓
      Code      Tools      Context
        │         │          │
        ↓         ↓          ↓
      Tests     Shell      AGENTS.md
        │         │        Skills
        ↓         ↓        Docs
        └──────┬──┘          │
               ↓             │
          Feedback Loop ←─────┘
```

所以真正决定 Agent 水平的东西逐渐变成：

① Context

Agent 知道什么。

② Tools

Agent 能做什么。

③ Rules

Agent 必须遵守什么。

④ Feedback

Agent 怎么知道自己做错了。

⑤ Verification

怎么判断“完成”。

⑥ Memory

下一次 Agent 怎么知道以前发生过什么。






### 关于修复提示



不要

```text
帮我修复这个bug
```

而是

```text
## Goal

修复 XXX 问题。

## Context

当前项目：
- Go
- Gin
- MySQL
- Redis

现象：
XXX

## Constraints

- 不修改公共 API
- 不改变数据库 schema
- 优先复用现有实现
- 不引入新依赖

## Investigation

先定位根因，不要立即修改代码。

需要检查：
- XXX
- XXX
- XXX

## Implementation

找到根因后：
1. 给出修复方案
2. 修改代码
3. 添加回归测试

## Verification

必须执行：

go test ./...
go vet ./...

如果失败，继续分析并修复。

## Done

只有满足以上 Verification 才认为完成。

最后告诉我：

- Root cause
- Changed files
- Tests
- Remaining risks
```




### 具体的一次项目创建

针对一个可以读取 mysql 的mcp 的创建 进行新建项目

工具 
* codex
* pi agent 

模型
* gpt-5.6-sol
* deeepseek-v4-pro

skill
* grill-me
* ponytail



#### 1. 先进行规划

codex 使用 gpt-5.6-sol medium 进行规划

```bash
$grill-me  帮我规划一个使用go语言的 mcp 项目,  主要针对读取数据库, 要求接口抽象封装, 当前主要针对mysql 数据库的读取进行实现
  给我架构选型
  本次主要给我生成一个规划文档, 进行任务的具体拆分 生成具体的子任务文档到 新建一个的docs 目录下
```

...... 这里是多轮对话的讨论 省略

具体就生成库下面的任务和工作的拆解

(指向文件)[https://github.com/sigam-Zq/db-mcp/tree/main/docs]


然后这里就使用 
pi agent 使用deeepseek-v4-pro 进行按照计划表进行施工了 
省略具体实施部分......

```bash
↑106k ↓145k R38M CH99.9% $6.193 23.2%/1.0M (auto)                                          (deepseek) deepseek-v4-pro • medium
○ 🐴 ponytail: ⚡ FULL
```

施工完成后进行代码审计
codex
```text
代码已经根据文档完成,依据文档帮我审计代码,保存到docs目录下
```

然后进行修改
pi agent
```text
@docs/code-audit.md  帮我判断并修复, 并且修复后进行文档上进行标记说明
```

生成文件如下
(审计修改文件)[https://github.com/sigam-Zq/db-mcp/blob/main/docs/code-audit.md]


然后配置mcp 到codex 中

配置文件
vim ~/.codex/config.toml

```toml

[mcp_servers.myDBMCP]

type = "stdio"  # 传输类型
command = "/Users/z/dev/DBHub/myDBmcp/target/mydbmcp"  # 如何启动这个 MCP 服务器
args = ["-config", "/Users/z/dev/DBHub/myDBmcp/target/mydbmcp.yaml"]
# 可选配置
env = { "MYSQL_READONLY_PASSWORD" = "xxxxx" }  # 环境变量
startup_timeout_ms = 20000  # 启动超时时间（毫秒）

```


然后就可以在codex 看到了

```bash

z@zdeMacBook-Pro myDBmcp % codex
╭──────────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.147.0)                       │
│                                                  │
│ model:     gpt-5.6-sol medium   /model to change │
│ directory: ~/dev/DBHub/myDBmcp                   │
╰──────────────────────────────────────────────────╯

  Tip: New Build faster with the Desktop app. Run 'codex app' or visit https://chatgpt.com/codex?app-landing-page=true

/mcp

🔌  MCP Tools

  • myDBMCP
    • Auth: Unsupported
    • Tools: db_describe_table, db_get_context, db_list_connections, db_list_schemas, db_list_tables, db_query, db_set_context



› Explain this codebase

  gpt-5.6-sol medium · ~/dev/DBHub/myDBmcp
```



最终形成项目 (这里)[https://github.com/sigam-Zq/db-mcp/]

