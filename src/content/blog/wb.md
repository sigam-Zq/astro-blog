---
title: 'wasn学习'
description: 'WebAssembly 学习'
pubDate: 2026-05-11T10:44:05.569Z
heroImage: '/blog-placehoder-7.jpg'
tags:
  - Code
---

## 学习 WebAssembly

````md
**WebAssembly（简称 Wasm）** 是一种为浏览器和非浏览器环境设计的**低级二进制指令格式**，核心价值是让 C/C++、Rust 等语言能以**接近原生的性能**在 Web 上运行，作为 JavaScript 的高性能补充。

---

### 一、核心定义
- **本质**：基于栈式虚拟机的二进制字节码标准（非编程语言）
- **定位**：高级语言（C/C++/Rust/Go 等）的**编译目标**
- **标准**：W3C 开放标准，主流浏览器（Chrome/Firefox/Safari/Edge）原生支持
- **文件**：`.wasm`（二进制）、`.wat`（文本格式，调试用）

### 二、核心特性
1. **极致性能**
   - 接近原生执行速度（可达原生 80%–90%）
   - 静态类型、紧凑二进制、解码/编译极快
   - 无 JS 垃圾回收停顿，适合计算密集任务

2. **安全沙箱**
   - 内存安全、线性内存隔离
   - 遵循浏览器同源策略，无直接系统调用

3. **跨平台/跨语言**
   - 一次编译，多平台（浏览器/Node.js/边缘计算）运行
   - 语言中立：支持 C/C++、Rust、Go、AssemblyScript 等

4. **与 JS 互操作**
   - Wasm ↔ JS 双向调用
   - 共享内存、通过 JS 访问 DOM/Web API

### 三、运行原理（极简）
1. **编译**：C/C++/Rust → 工具链（Emscripten/wasm-pack）→ `.wasm`
2. **加载**：JS 用 `WebAssembly.instantiate` 加载/实例化
3. **执行**：在沙箱虚拟机中运行，线性内存读写
4. **交互**：通过 JS 桥接 DOM、网络、I/O

### 四、典型应用场景
- **游戏**：Unity/Unreal 引擎 Web 移植、3D 渲染
- **图像/视频**：实时滤镜、4K 处理、编解码（如 Photopea）
- **科学计算**：物理模拟、AI 推理、密码学
- **桌面应用 Web 化**：Figma、VS Code Web 等
- **边缘计算**：Serverless 轻量级沙箱（Cloudflare Workers）

### 五、优势与局限
**优势**
- 性能远超 JS（计算密集场景快 5–10 倍+）
- 复用现有 C/C++/Rust 代码库
- 体积小、加载快、跨平台
- 安全沙箱、内存隔离

**局限**
- **不能直接操作 DOM**：必须经 JS 桥接（少量开销）
- 开发/调试比 JS 复杂
- 内存需手动管理（类似 C/C++）
- 适合**计算密集型**，普通 Web 业务仍以 JS 为主

### 六、一句话总结
**Wasm 让 Web 拥有原生级性能，是高性能 Web 应用、游戏、AI、音视频处理的关键技术，与 JS 互补而非替代。**

````


## go demo


```go
package main

import "syscall/js"

// 导出给 JS 调用的函数
func add(this js.Value, args []js.Value) interface{} {
	a := args[0].Int()
	b := args[1].Int()
	return a + b
}

func main() {
	// 注册函数到全局
	js.Global().Set("goAdd", js.FuncOf(add))
	// 阻塞常驻
	<-make(chan struct{})
}

```


### 执行命令编译wasm

```bash
# 编译出来 wasm
GOOS=js GOARCH=wasm go build -o main.wasm
# 下载可以引用的js
curl  https://raw.githubusercontent.com/golang/go/master/lib/wasm/wasm_exec.js -o wasm_exec.js
```


### index.html

```html
<!DOCTYPE html>
<html>
<body>
<script src="wasm_exec.js"></script>
<script>
async function run() {
  const go = new Go();
  const res = await fetch("main.wasm");
  const bytes = await res.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  go.run(instance);

  // 测试调用
  console.log("Wasm 计算结果：", goAdd(10, 20));
}
run();
</script>
</body>
</html>
```



## rust demo



### 新建rust项目

```bash
cargo new wasm-rust

# 装上编译工具
cargo install wasm-pack
```


### 写rust代码



```toml
[package]
name = "wasm-rust"
version = "0.1.0"
edition = "2024"

<!-- 新增下面的内容 -->
[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"  
```


删除 src/main.rs 文件 新增 src/lib.rs 文件
```rust
// 引入 wasm-bindgen
use wasm_bindgen::prelude::*;

// 导出函数给 JS 调用
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

// 也可以写字符串、复杂逻辑
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}
```

````md

## 1. `[lib]`
意思是：
**我这个项目不是可执行程序，而是一个库（library）**
- Wasm 永远是**库**，给 JS 调用
- 不是独立运行的 exe/app
所以必须声明 `[lib]`

---

## 2. `crate-type = ["cdylib"]` 🔥 最重要
这是**Wasm 必需的核心配置**。

- `c` = C 语言风格的接口
- `dy` = dynamic 动态库
- `lib` = library

**作用：**
👉 让 Rust 编译出 **C 语言兼容格式的动态库**
👉 这种格式 **正好就是 WebAssembly 需要的格式**
👉 浏览器 / Node.js 才能加载它

**没有 cdylib → 无法生成 .wasm 文件**
这就是你刚才报错的根本原因。

---

## 3. `rlib`
这是**Rust 内部使用的库格式**
作用：
- 方便 Rust 之间互相依赖
- 方便调试、打包
- 对 Wasm 本身**不是必须**，但加上更兼容

````


### 编译

```bash
wasm-pack build --target web
```


### index.html

```html
<!DOCTYPE html>
<html>
<body>

<script type="module">
  // 直接导入编译好的 WASM 包
  import init from './pkg/wasm_rust.js';
  const { add, greet } = await init();

  // 调用 Rust 函数！
  console.log("加法结果：", add(10, 20));
  console.log("问候：", greet("Rust Wasm"));
</script>

</body>
</html>
```


## AssemblyScript demo

[AssemblyScript](https://caijiao.org/webassembly/practical/03-assemblyscript)



## 本地运行 wasm 


```bash
brew install wasmtime
......

z@zdeMacBook-Pro learn % wasmtime --version
wasmtime 44.0.1 (f302ebd6b 2026-04-30)
z@zdeMacBook-Pro learn % 

```


### 运行go 的wasm
```bash

z@zdeMacBook-Pro wasm-go $ GOOS=wasip1 GOARCH=wasm go build -o wasspi.wasm
package .
        imports syscall/js: build constraints exclude all Go files in /usr/local/go/src/syscall/js
```

查阅发现得重新写, 当前版本是支持前端页面的js调用的

```go
package main

import "fmt"

func main() {
    fmt.Println("✅ Go WASI 后端 Wasm 运行成功！")
    fmt.Println("👉 运行在 wasmtime 虚拟机中")

    // 调用函数
    res := add(10, 20)
    fmt.Printf("🧮 10 + 20 = %d\n", res)
}

// 加法函数（可被调用）
func add(a, b int) int {
    return a + b
}
```


```bash
# 编译
z@zdeMacBook-Pro wasm-go $ GOOS=wasip1 GOARCH=wasm go build -o wasmapi.wasm wasm-api/main.go 

z@zdeMacBook-Pro wasm-go $ wasmtime wasmapi.wasm 
✅ Go WASI 后端 Wasm 运行成功！
👉 运行在 wasmtime 虚拟机中
🧮 10 + 20 = 30

z@zdeMacBook-Pro wasm-go $ wasmtime --invoke add wasmapi.wasm 10 20
Error: failed to run main module `wasmapi.wasm`

Caused by:
    no func export named `add` found

# 这里为什么失败 -- 这里没有导出

```


 新增导出

 ```go

// 加法函数（可被调用）
// 关键！
// 导出函数 add，给 Wasm 虚拟机调用
//
//go:wasmexport add
func add(a, b int) int {
	return a + b
}

 ```

 继续编译

 ```bash
z@zdeMacBook-Pro wasm-go $ GOOS=wasip1 GOARCH=wasm go build -o wasmapi.wasm wasm-api/main.go 
# command-line-arguments
wasm-api/main.go:19:6: go:wasmexport: unsupported parameter type int
wasm-api/main.go:19:6: go:wasmexport: unsupported result type int
 ```

还是报错  查阅 这里只用 类型
* i32
* i64
* f32
* f64



 ```go

// 加法函数（可被调用）
// 关键！
// 导出函数 add，给 Wasm 虚拟机调用
//
//go:wasmexport add
func add(a, b int32) int32 {
	return a + b
}
```


```bash

z@zdeMacBook-Pro wasm-go $ GOOS=wasip1 GOARCH=wasm go build -o wasmapi.wasm wasm-api/main.go 
z@zdeMacBook-Pro wasm-go $ wasmtime --invoke add wasmapi.wasm 10 20
warning: using `--invoke` with a function that takes arguments is experimental and may break in the future
runtime: wasmexport function called before runtime initialization
        call _start first
Error: failed to run main module `wasmapi.wasm`

Caused by:
    0: failed to invoke `add`
    1: error while executing at wasm backtrace:
    0: 0x117807 - <unknown>!runtime.abort
    1: 0x11a0c7 - <unknown>!runtime.notInitialized
    2: 0x177f4b - <unknown>!add
    2: wasm trap: wasm `unreachable` instruction executed

z@zdeMacBook-Pro wasm-go $ wasmtime wasmapi.wasm  --invoke add  10 20
✅ Go WASI 后端 Wasm 运行成功！
👉 运行在 wasmtime 虚拟机中
🧮 10 + 20 = 30
z@zdeMacBook-Pro wasm-go $ wasmtime wasmapi.wasm --invoke add 10 20
✅ Go WASI 后端 Wasm 运行成功！
👉 运行在 wasmtime 虚拟机中
🧮 10 + 20 = 30
z@zdeMacBook-Pro wasm-go $ wasmtime wasmapi.wasm 
✅ Go WASI 后端 Wasm 运行成功！
👉 运行在 wasmtime 虚拟机中
🧮 10 + 20 = 30
z@zdeMacBook-Pro wasm-go $ 
```


> 这里多次踩坑发现go 不能支持使用 invoke 调用函数 他只能支持使用main.go


### 运行rust 的wasm

```bash

z@zdeMacBook-Pro wasm-rust % rustup target add wasm32-wasip1
info: downloading component rust-std
     rust-std installed                       21.81 MiB  

    #  安装对应 平台的编译支持

         
z@zdeMacBook-Pro wasm-rust % cargo build --target wasm32-wasip1 --release
   Compiling wasm-bindgen-shared v0.2.121
   Compiling unicode-ident v1.0.24
   Compiling once_cell v1.21.4
   Compiling cfg-if v1.0.4
   Compiling wasm-bindgen v0.2.121
   Compiling wasm-rust v0.1.0 (/Users/z/Desktop/code/learn/wasm-rust)
    Finished `release` profile [optimized] target(s) in 1.97s


z@zdeMacBook-Pro wasm-rust % wasmtime --invoke add target/wasm32-wasip1/release/rust_wasi_demo.wasm 10 20
Error: failed to open wasm module "target/wasm32-wasip1/release/rust_wasi_demo.wasm"

Caused by:
    No such file or directory (os error 2)

z@zdeMacBook-Pro wasm-rust % wasmtime --invoke add target/wasm32-wasip1/release/wasm_rust.wasm 10 20
Error: failed to run main module `target/wasm32-wasip1/release/wasm_rust.wasm`

Caused by:
    0: failed to instantiate "target/wasm32-wasip1/release/wasm_rust.wasm"
    1: unknown import: `__wbindgen_placeholder__::__wbindgen_describe` has not been defined

# 这里也是相同的问题- 也是得修改代码,支持原生的 wasm 调用 原本的是 js调用支持

```

修改代码

```rust
#[cfg(feature = "wasm-bindgen")]
use wasm_bindgen::prelude::*;

// ─── wasm-bindgen mode (default, for wasm-pack) ───
#[cfg(feature = "wasm-bindgen")]
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(feature = "wasm-bindgen")]
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

// ─── Raw C-ABI mode (for wasm32-wasip1) ───
#[cfg(not(feature = "wasm-bindgen"))]
#[unsafe(no_mangle)]  // 👈 这里改了！ 新特性要求！
pub extern "C" fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(not(feature = "wasm-bindgen"))]
#[unsafe(no_mangle)]  // 👈 这里改了 新特性要求！
pub extern "C" fn greet(ptr: *const u8, len: usize) -> *mut u8 {
    let name = unsafe { std::str::from_utf8_unchecked(std::slice::from_raw_parts(ptr, len)) };
    let s = format!("Hello, {}!", name);
    let r = s.as_ptr() as *mut u8;
    std::mem::forget(s);
    r
}

```

Cargo.toml新增特性

```toml
[package]
name = "wasm-rust"
version = "0.1.0"
edition = "2024"

[lib]
crate-type = ["cdylib", "rlib"]

[features]
default = ["wasm-bindgen"]
wasm-bindgen = ["dep:wasm-bindgen"]

[dependencies]
wasm-bindgen = { version = "0.2", optional = true }  
```

为了支持两种编译

```bash

z@zdeMacBook-Pro wasm-rust % cargo build --target wasm32-wasip1 --release --no-default-features
   Compiling wasm-rust v0.1.0 (/Users/z/Desktop/code/learn/wasm-rust)
    Finished `release` profile [optimized] target(s) in 0.28s
z@zdeMacBook-Pro wasm-rust % wasmtime --invoke add target/wasm32-wasip1/release/wasm_rust.wasm 10 20
warning: using `--invoke` with a function that takes arguments is experimental and may break in the future
warning: using `--invoke` with a function that returns values is experimental and may break in the future
30
z@zdeMacBook-Pro wasm-rust % 
```


解释上面的 features

````md

我给你用**最通俗、最清晰、最实用**的方式，把 **Cargo Features** 彻底讲明白！

# 一句话总结
```
[features]
就是给你的 Rust 项目做 **“功能开关”**
想开启哪块功能，编译时就打开，不用就关掉！
```

---

# 逐行解释你这段代码
```toml
[features]
default = ["wasm-bindgen"]          # 👈 默认开启的功能
wasm-bindgen = ["dep:wasm-bindgen"]  # 👈 定义这个功能依赖什么
```

## 1. `[features]`
作用：  
**声明项目有哪些可选功能**。

---

## 2. `wasm-bindgen = ["dep:wasm-bindgen"]`
意思：
> 我定义一个 **功能开关**，名字叫 `wasm-bindgen`  
> 打开这个开关 → **自动引入 wasm-bindgen 依赖**

`dep:wasm-bindgen` 的意思：
> 启用 `Cargo.toml` 里的 `wasm-bindgen` 依赖包

---

## 3. `default = ["wasm-bindgen"]`
意思：
> **默认情况下，自动打开 wasm-bindgen 开关**

也就是：
- 你直接 `cargo build`  
- 就等于 `cargo build --features wasm-bindgen`

---

# 结合你的项目，到底在干嘛？
你的项目 **一套代码，两套用途**：

## ✔ 模式 A：浏览器 / Web（默认）
```toml
default = ["wasm-bindgen"]
```
编译：
```bash
wasm-pack build --target web
```
效果：
- 启用 `#[wasm_bindgen]`
- 给 JS 调用
- **前端网页用**

---

## ✔ 模式 B：Wasmtime / 边缘计算（关闭默认）
编译：
```bash
cargo build --no-default-features --target wasm32-wasip1
```
效果：
- **关闭 wasm-bindgen**
- 启用 `#[unsafe(no_mangle)] extern "C"`
- 给 wasm 虚拟机调用
- **后端边缘计算用**

---

# 最直观的比喻
你的项目 = 一间房子

- **`default = ["wasm-bindgen"]`**  
  默认给你**配上网（浏览器模式）**
- **`--no-default-features`**  
  把网断掉，变成**纯本地服务器（Wasmtime模式）**

---

# 最终总结（背会这 3 句）
1. **`[features]` = 功能开关**
2. **`wasm-bindgen = ["dep:wasm-bindgen"]` = 定义一个开关，打开就加载依赖**
3. **`default = ["wasm-bindgen"]` = 默认打开浏览器模式**

---

# 你的项目为什么这样设计？
为了实现 **业界最顶级的 Wasm 架构：**

## **一套代码 = 前端 WebAssembly + 后端 WASI 边缘计算**
- 前端：`wasm-bindgen` on
- 后端：`wasm-bindgen` off

````