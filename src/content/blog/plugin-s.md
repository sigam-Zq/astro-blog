---
title: '动态插件系统调研'
description: 'go动态加载调度插件技术调研'
pubDate: '2026-04-26'
---


## 调查go实现插件的技术方案

* 动态加载


````md
# Go 动态扫描目录 + 提取接口 + 动态注册插件（无静态 import）
Go 本身**不支持真正的运行时动态加载**（不像 Python/Java），但可以通过 **插件模式（plugin 包）** + **目录扫描** + **接口反射提取** 实现**无静态 import** 的动态插件注册。

核心方案分两种：
1. **Go 官方 plugin 模式**（Linux/macOS 支持，Windows 不支持）：编译为 `.so` 共享库，运行时动态加载
2. **可执行文件扫描模式**（全平台通用）：把插件编译为独立可执行文件，扫描目录自动注册

我给你**最实用、可直接运行**的 **plugin 模式完整实现**（无静态导入、自动扫描目录、自动提取接口、自动注册）。

---

## 整体架构
1. 定义**公共插件接口**（所有插件必须实现）
2. 插件目录：存放所有插件 `.so` 文件
3. 主程序：
   - 动态扫描插件目录
   - 动态加载 `.so`
   - 反射提取插件接口
   - 自动注册到插件管理器

---

## 步骤 1：定义公共接口（核心）
创建 `pluginapi/api.go`（公共依赖，**不静态导入插件**）
```go
package pluginapi

// 插件接口：所有插件必须实现这个接口
type Plugin interface {
	// 插件名称
	Name() string
	// 插件版本
	Version() string
	// 插件执行逻辑
	Run() error
}
```

---

## 步骤 2：编写插件（编译为 .so）
创建 `plugins/hello.go`（插件 1）
```go
package main

import (
	"fmt"
	"your_module/pluginapi" // 只依赖公共接口，不被主程序 import
)

// 插件结构体（必须实现 pluginapi.Plugin）
type HelloPlugin struct{}

// 实现 Plugin 接口
func (h *HelloPlugin) Name() string    { return "hello_plugin" }
func (h *HelloPlugin) Version() string { return "v1.0.0" }
func (h *HelloPlugin) Run() error {
	fmt.Println("[HelloPlugin] 执行成功！")
	return nil
}

// 导出变量：主程序通过这个变量获取插件实例
var Plugin pluginapi.Plugin = &HelloPlugin{}
```

### 编译插件为 .so（关键命令）
```bash
go build -buildmode=plugin -o plugins/hello.so plugins/hello.go
```

可以写 N 个插件，全部编译到 `plugins/` 目录下。

---

## 步骤 3：主程序 —— 动态扫描 + 加载 + 注册
**主程序完全不 import 任何插件**，纯动态扫描目录加载。

```go
package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"plugin"

	"your_module/pluginapi"
)

// 插件管理器：存储所有注册的插件
var pluginManager = make(map[string]pluginapi.Plugin)

// 扫描插件目录，动态加载所有 .so 文件
func loadPlugins(dir string) error {
	// 打开目录
	files, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	// 遍历目录文件
	for _, f := range files {
		if f.IsDir() {
			continue
		}

		// 只加载 .so 插件文件
		if filepath.Ext(f.Name()) != ".so" {
			continue
		}

		soPath := filepath.Join(dir, f.Name())
		fmt.Printf("正在加载插件：%s\n", soPath)

		// 1. 动态加载 .so 文件（核心：无静态 import）
		p, err := plugin.Open(soPath)
		if err != nil {
			return fmt.Errorf("加载插件失败 %s: %w", f.Name(), err)
		}

		// 2. 查找导出的 Plugin 变量
		sym, err := p.Lookup("Plugin")
		if err != nil {
			return fmt.Errorf("查找插件符号失败 %s: %w", f.Name(), err)
		}

		// 3. 类型断言：提取接口（必须实现 pluginapi.Plugin）
		pInstance, ok := sym.(pluginapi.Plugin)
		if !ok {
			return errors.New(f.Name() + " 未实现 Plugin 接口")
		}

		// 4. 自动注册插件
		pluginManager[pInstance.Name()] = pInstance
		fmt.Printf("✅ 注册成功：%s (%s)\n", pInstance.Name(), pInstance.Version())
	}

	return nil
}

// 运行所有已注册插件
func runAllPlugins() {
	fmt.Println("\n==== 执行所有插件 ====")
	for name, p := range pluginManager {
		fmt.Printf("执行：%s\n", name)
		_ = p.Run()
	}
}

func main() {
	// 动态扫描 plugins 目录
	err := loadPlugins("./plugins")
	if err != nil {
		fmt.Printf("加载插件失败：%v\n", err)
		return
	}

	// 执行插件
	runAllPlugins()
}
```

---

## 运行效果
```
正在加载插件：./plugins/hello.so
✅ 注册成功：hello_plugin (v1.0.0)

==== 执行所有插件 ====
执行：hello_plugin
[HelloPlugin] 执行成功！
```

---

## 关键特性（满足你的需求）
1. **无静态 import**
   主程序**完全不 import 任何插件代码**，只依赖公共接口。

2. **动态扫描目录**
   自动遍历 `plugins/`，加载所有 `.so`。

3. **自动提取接口**
   通过 `plugin.Lookup` + 类型断言，自动提取并校验 `Plugin` 接口。

4. **动态注册插件**
   自动存入插件管理器，随时调用。

---

## Windows 兼容方案（全平台）
Windows **不支持 `go plugin`**，改用 **「配置文件 + 独立可执行文件」** 方案：
1. 插件编译为普通 `.exe`
2. 主程序扫描目录，读取插件元信息
3. 通过 **进程调用 / RPC / 网络通信** 执行插件

同样**无静态 import**，全平台通用。

---

## 总结
- **Linux/macOS**：用 `go plugin` 模式，直接动态加载 `.so`，最简单高效
- **Windows**：用独立可执行文件 + 扫描注册
- 全程**无静态 import**，纯动态扫描、提取接口、自动注册

````

### go 原生插件系统


知识点

* go 注释跨平台编译注释
```go
//go:build !windows

```
当前文件只在非windows平台编译
执行时候进行识别

* go list -f '{{.GoFiles}}'
 使用 //go: linux 等跨平台编译时查看当前平台编译使用什么文件

	```bash

	z@zdeMacBook-Pro go-plugin (master) $ ls
	build.sh                loader_windows.go       main.go                 plu2                    run
	loader_notw.go          loader.go               makefile                plugin-e
	z@zdeMacBook-Pro go-plugin (master) $ go list -f '{{.GoFiles}}'
	[loader.go loader_notw.go main.go]
	```

	其中 
	> loader_notw.go

	```go loader_notw.go
	//go:build !windows

	package main
	// 省略
	```
	> loader_windows.go
	```go loader_windows.go
	//go:build windows

	package main
	// 省略
	```

[demoLink](https://github.com/sigam-Zq/base-study/tree/master/go-plugin)




* 缺点: 只支持 Linux/macOS，Windows 不支持 window需要使用dll 作为补充,由于dll调用需要插件为了适配win需要写两遍 这里使用第二个方案


### 使用二进制进行插件的管理


[demoLink](https://github.com/sigam-Zq/base-study/tree/master/go-plugin2)


*  优点: 二进制可执行的要求宽泛,并且可以单独调试
----
* 缺点: 过于宽泛,plugin 约束不好规范 ,新增了 genPlugin 命令弥补这一点
* 缺点: 当前传入参数的约束过于繁琐,需要简化