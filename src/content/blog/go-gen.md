
---
title: 'Go generate demo'
description: 'go生成调研'
pubDate: 2026-06-02T20:52:05.569Z
heroImage: '/blog-placehoder-7.jpg'
---


# go generate 完整用法 + 极简 Demo
## 一、核心概念
`go generate` 是 **Go 代码生成工具**，**不是编译命令**，不会参与 `go build/go run` 自动执行，必须手动触发。
作用：根据源码里的**特殊注释指令**，执行外部命令/脚本/程序，自动生成 `.go` 代码。

### 核心规则（必记规律）
1. 指令格式：**`//go:generate 命令 [参数]`**
   - 注释必须**紧贴代码行**，`//` 和 `go:generate` 之间**不能有空格**
   - 一行一条指令，多个指令写多行
2. 执行时机：
   - 手动执行：`go generate`（在当前包目录）
   - 不会被 `go build`/`go run`/`go test` 自动调用
3. 环境变量（内置变量，生成器通用）
   - `$GOFILE`：当前**源码文件名**
   - `$GOLINE`：当前指令所在行号
   - `$GOPACKAGE`：当前包名
   - `$DOLLAR`：字符 `$`（用于转义美元符）
4. 执行目录：默认在**指令所在文件的目录**运行命令。

---

## 二、最简 Demo（零基础可跑）
### 步骤1：创建项目结构
```
demo/
 ├─ main.go
 └─ hello_gen.go  # 最终自动生成的文件
```

### 步骤2：编写 `main.go`
写入**生成指令** + 业务代码：
```go
package main

import "fmt"

//go:generate echo "===== 开始生成代码 ====="
//go:generate go run gen.go $GOFILE $GOPACKAGE  # 调用自定义生成脚本

func main() {
	fmt.Println("主程序运行")
	PrintHello() // 调用生成代码里的函数
}
```

### 步骤3：编写生成脚本 `gen.go`（同目录）
用来动态生成 `hello_gen.go`：
```go
package main

import (
	"fmt"
	"os"
	"strings"
)

func main() {
	// 读取 go generate 传入的参数
	args := os.Args
	if len(args) < 3 {
		return
	}
	pkg := args[2] // 获取当前包名

	// 构造待生成的 Go 代码
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("package %s\n\n", pkg))
	sb.WriteString(`import "fmt"

func PrintHello() {
	fmt.Println("这是 go generate 自动生成的代码")
}
`)

	// 写入文件
	_ = os.WriteFile("hello_gen.go", []byte(sb.String()), 0644)
	fmt.Println("代码生成完成：hello_gen.go")
}
```

### 步骤4：执行生成命令
进入项目根目录，执行：
```bash
go generate
```

#### 执行输出：
```
===== 开始生成代码 =====
代码生成完成：hello_gen.go
```

此时目录会多出 `hello_gen.go`，内容如下（自动生成）：
```go
package main

import "fmt"

func PrintHello() {
	fmt.Println("这是 go generate 自动生成的代码")
}
```

### 步骤5：运行主程序
```bash
go run .
```
输出：
```
主程序运行
这是 go generate 自动生成的代码
```

---

## 三、关键规律 & 常用技巧
### 1. 语法红线（踩坑点）
❌ 错误（有空格）：
```go
// go:generate echo xxx   // // 和 go:generate 之间加空格 → 无效指令
```
✅ 正确：
```go
//go:generate echo xxx
```

### 2. 多指令串行执行
从上到下依次执行：
```go
//go:generate echo 指令1
//go:generate echo 指令2
//go:generate mkdir -p out
```

### 3. 内置变量实战
```go
//go:generate echo 当前文件: $GOFILE
//go:generate echo 当前包名: $GOPACKAGE
```
执行 `go generate` 会打印当前文件名和包名。

### 4. 递归生成（子目录）
- `go generate` 默认只处理**当前目录**
- 加 `-r` 参数：递归所有子目录
  ```bash
  go generate -r ./...
  ```

### 5. 标准工程约定（业界通用规范）
1. 生成文件命名：统一加后缀 `_gen.go`，一眼区分手写/生成代码
2. 生成文件**不要手动修改**，重新执行 `go generate` 会覆盖
3. 生成脚本一般放在项目工具目录（如 `cmd/generator`）
4. 提交代码时：**生成文件建议一并提交**，保证编译不依赖生成环境

---

## 四、生产中常见使用场景
1. **枚举转字符串**（最常用）：根据枚举自动生成 `String()` 方法
2. **protobuf/grpc**：`protoc` + go 插件生成 Go 结构体/服务代码
3. **ORM/模型代码**：根据数据库表自动生成 Model 结构体
4. **常量、模板代码批量生成**

---

## 五、快速总结
1. 本质：**注释驱动的代码生成器**，手动触发，不随编译自动跑；
2. 格式：固定 `//go:generate 命令`，无前置空格；
3. 核心能力：调用任意命令、使用内置环境变量传参；
4. 规范：生成文件后缀 `_gen.go`，禁止手动编辑。