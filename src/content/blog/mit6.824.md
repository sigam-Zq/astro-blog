---
title: 'MIT 6.824 课程学习'
description: 'MIT 6.824 课程学习'
pubDate: 2026-05-13T19:44:05.569Z
heroImage: '/blog-placehoder-7.jpg'
---


## Lecture 1: Introduction  


* 需要一直讨论 性能和容错

这里需要进行通信 涉及到对应 恶意代码的处理

并发编程加上网络会导致一些想不到的问题

Lab
1. mapreduce
2. Raft 多节点同步
3. K/V server
4. sharded K/V server 并行加速


Infrastructure 基础设施
* Storage
* 通信 communications
* 计算 computing


目的是抽象出来一个非分布式的对外接口

Impl
- RPC
- threds
- Lock


在一个目标是 高性能 和可扩展性的性能(吞吐量)


如果过多使用多个服务进行服务扩展,但是存储就会成为瓶颈

### 容错
 
 总是有一些节点可能的损坏在设计之初就应该想得到

 * Availability 可靠性
 * Recoverability 恢复性  可以正确进行恢复

多个副本的情况下需要考虑
 * 一致性

 设计上 可以区分为
 * 强一致性 Strong Consistency 保障获取最新的值 [这里普遍会需要消耗更多的通讯资源-但是一般副本考虑异地容灾的场景下-这里的通讯都比较慢]
 * 弱一致性 Weak Consistency 不保证获取最新的值 [常用]




### MapReduce

分布式的计算框架


````md
# 一文讲透 MapReduce 框架（原理+流程+角色+例子，通俗版）
## 一、MapReduce 是什么
**MapReduce** 是谷歌提出的**分布式并行计算编程模型 + 运行框架**。
核心作用：
把**海量大数据**拆分 → 多机器并行计算 → 再聚合结果，不用自己管分布式、容错、调度，只写业务逻辑就行。

适用：离线批处理、日志分析、数据清洗、统计求和、倒排索引。

---

## 二、核心思想 8 个字
**分而治之，先分后合**
- Map：**拆分、局部处理**
- Reduce：**汇总、全局聚合**

---

## 三、完整执行流程（必懂）
整个 MR 分为 5 个阶段：
1. **Input 输入分片**
2. **Map 阶段（映射）**
3. **Shuffle 洗牌排序**（MR 最核心、最复杂）
4. **Reduce 阶段（归约）**
5. **Output 输出结果**

### 1. Input 输入分片
海量大文件，框架自动切分成多个 **InputSplit**，分给不同 Mapper 节点并行处理。
> 你不用手动拆文件，框架自动分片。

### 2. Map 阶段（Map 函数）
输入格式：`<key1, value1>`
处理逻辑：自定义业务逻辑，输出中间键值对 `<key2, value2>`

举例（词频统计）：
一行文本 `hello world hello`
Map 输出：
```
hello 1
world 1
hello 1
```

**作用**：逐条处理原始数据，产出局部中间结果。

### 3. Shuffle 洗牌阶段（MR 灵魂）
做三件事：
1. **分区 Partition**：相同 key 发给同一个 Reduce
2. **排序 Sort**：key 字典序排序
3. **合并 Combine**：本地先小聚合（减少网络传输）

最终效果：
把所有 Mapper 输出的 **相同 key** 汇聚到同一个 Reducer，并且按 key 排好序。

示例汇聚后：
```
hello [1,1]
world [1]
```

> Shuffle 是 MapReduce 最耗 IO、网络的环节，也是调优重点。

### 4. Reduce 阶段（归约函数）
输入：`<key2, 迭代器[value2]>`
对同一个 key 的所有 value 做**聚合计算**（求和、求平均、去重、分组）

词频例子：
- hello → 1+1 = 2
- world → 1

### 5. Output 输出
把 Reduce 最终结果写入 HDFS/文件系统。

---

## 四、框架四大角色（Hadoop MR 架构）
1. **JobTracker**：全局老大，负责任务调度、资源分配、容错
2. **TaskTracker**：干活小弟，运行 MapTask / ReduceTask
3. **MapTask**：执行 Map 逻辑
4. **ReduceTask**：执行 Reduce 逻辑

现在 Hadoop 2.x 是 YARN 调度：
ResourceManager + NodeManager 替代了旧的 JobTracker/TaskTracker。

---

## 五、经典例子：单词计数 WordCount
### 业务目标
统计所有文件中每个单词出现次数。

1. **Input**：海量日志文本
2. **Map**：每行拆单词，输出 `单词,1`
3. **Shuffle**：相同单词归到一起，形成 `单词,[1,1,1...]`
4. **Reduce**：遍历数组累加求和
5. **Output**：`hello 2` `world 1`

---

## 六、MapReduce 核心特性
1. **分布式自动并行**：框架自动拆数据、分机器跑
2. **容错自动重试**：某节点挂了，任务自动转移到其他节点
3. **屏蔽底层细节**：开发只写 Map、Reduce 业务逻辑
4. **离线批处理**：适合海量冷数据，不适合实时计算

---

## 七、优缺点
### 优点
- 超大数据量扛得住
- 开发简单，不用管分布式底层
- 天然容错、易横向扩容

### 缺点
- 基于磁盘 IO，**速度慢、延迟高**
- 不适合实时流计算（被 Spark/Flink 替代）
- Shuffle 阶段开销大

---
demo

# Go 实现极简 MapReduce 完整逻辑
复刻经典 **Map → Shuffle → Reduce** 整套流程，纯 Go 标准库，**不用任何框架**，把 MapReduce 核心处理逻辑手写出来，和 Hadoop MapReduce 原理一模一样。

## 一、先对齐核心概念
- **Map**：遍历原始数据，产出 `key -> value`
- **Shuffle**：把**相同 key** 的 value 聚合到一起
- **Reduce**：对同一个 key 的一组 value 做聚合（求和/统计/聚合）

## 二、完整 Go 代码（可直接运行）
```go
package main

import (
	"fmt"
	"strings"
)

// ===================== 1. 定义类型 =====================
// Map 输出键值对
type KeyValue struct {
	Key   string
	Value int
}

// MapFunc 自定义Map函数类型
type MapFunc func(line string) []KeyValue

// ReduceFunc 自定义Reduce函数类型
type ReduceFunc func(key string, values []int) int

// ===================== 2. 核心MapReduce流程 =====================
// Map阶段：逐行执行Map逻辑
func MapStage(lines []string, mapFn MapFunc) []KeyValue {
	var res []KeyValue
	for _, line := range lines {
		kvs := mapFn(line)
		res = append(res, kvs...)
	}
	return res
}

// Shuffle阶段：相同key聚合，MR最核心
func Shuffle(kvs []KeyValue) map[string][]int {
	groups := make(map[string][]int)
	for _, kv := range kvs {
		groups[kv.Key] = append(groups[kv.Key], kv.Value)
	}
	return groups
}

// Reduce阶段：分组聚合计算
func ReduceStage(groups map[string][]int, reduceFn ReduceFunc) map[string]int {
	result := make(map[string]int)
	for key, vals := range groups {
		result[key] = reduceFn(key, vals)
	}
	return result
}

// 封装一键执行MapReduce
func MapReduce(lines []string, mapFn MapFunc, reduceFn ReduceFunc) map[string]int {
	kvs := MapStage(lines, mapFn)
	groups := Shuffle(kvs)
	return ReduceStage(groups, reduceFn)
}

// ===================== 3. 业务：单词统计 =====================
// 自定义Map逻辑：一行文本拆单词，每个单词输出 key=单词, val=1
func wordCountMap(line string) []KeyValue {
	words := strings.Fields(line)
	var kvs []KeyValue
	for _, w := range words {
		kvs = append(kvs, KeyValue{Key: w, Value: 1})
	}
	return kvs
}

// 自定义Reduce逻辑：同单词累加求和
func wordCountReduce(key string, values []int) int {
	sum := 0
	for _, v := range values {
		sum += v
	}
	return sum
}

// ===================== 主函数测试 =====================
func main() {
	// 模拟海量原始多行数据
	data := []string{
		"hello go mapreduce",
		"hello go runtime",
		"go mapreduce golang",
	}

	// 执行完整MapReduce流程
	res := MapReduce(data, wordCountMap, wordCountReduce)

	// 打印结果
	for k, v := range res {
		fmt.Printf("%-12s => %d\n", k, v)
	}
}
```

## 三、逐阶段拆解逻辑（对应原生MapReduce）
### 1. MapStage
- 输入：原始多行数据
- 逻辑：每行交给自定义 `Map` 函数
- 输出：批量 `<key,value>` 中间数据
对应 Hadoop：**InputSplit → Mapper 任务**

### 2. Shuffle （核心）
做一件事：
**把所有相同 key 的 value 归为一组**
```
hello → [1,1]
go    → [1,1,1]
```
对应 Hadoop：**分区、排序、分组**

### 3. ReduceStage
遍历每个 key 的 value 列表，执行自定义聚合逻辑，输出最终结果。
对应 Hadoop：**Reducer 分组聚合输出**

## 四、你可以自定义扩展
只需要自己写两个函数，就能实现任意大数据处理：
1. 写 **Map 函数**：怎么拆数据、生成什么 key-value
2. 写 **Reduce 函数**：同 key 怎么聚合（求和、去重、最大值、分组统计）

示例改需求：统计每行单词数、过滤特定词，只改两个业务函数即可，**框架流程不用动**。

## 五、分布式版扩展思路
上面是**单机版**，如果要改成**分布式 Go MapReduce**：
1. 数据分片分发到多个 Go 协程/机器
2. 每个节点本地跑 Map
3. 网络传输做 Shuffle 分组
4. 多节点并行跑 Reduce

和 Hadoop MapReduce 架构完全一致，只是用 Go 手写实现。

 **goroutine 并行版 MapReduce**（模拟分布式多 Task 并行）

 # Go 极简分布式 MapReduce（提炼版）
核心设计：
- 用 **Goroutine + Channel** 模拟多机器/多节点分布式
- 流程严格复刻原生 MR：**分片 → 并行Map → Shuffle → 并行Reduce**
- 极简无依赖，只保留分布式核心逻辑，好懂可扩展

## 整体架构极简模型
1. **Master**：拆分数据分片、调度任务、等待结果
2. **Map Worker**：多个协程并行做 Map
3. **Shuffle**：按 Key 分区路由，相同 Key 进同一个 Reduce
4. **Reduce Worker**：多个协程并行做 Reduce

---

## 完整可运行代码（分布式精简版）
```go
package main

import (
	"fmt"
	"strings"
	"sync"
)

// KeyValue 通用键值对
type KeyValue struct {
	Key   string
	Value int
}

// ==================== 配置 ====================
const (
	mapWorkerNum    = 3 // 3个Map节点
	reduceWorkerNum = 2 // 2个Reduce节点
)

// ==================== 业务自定义函数 ====================
// Map：一行文本拆单词，输出 <word,1>
func mapFunc(line string) []KeyValue {
	var kvs []KeyValue
	words := strings.Fields(line)
	for _, w := range words {
		kvs = append(kvs, KeyValue{Key: w, Value: 1})
	}
	return kvs
}

// Reduce：同key累加
func reduceFunc(key string, vals []int) int {
	sum := 0
	for _, v := range vals {
		sum += v
	}
	return sum
}

// ==================== 分布式MR核心 ====================

// 分区：把key分到指定reduce节点
func partition(key string) int {
	return len(key) % reduceWorkerNum
}

// 分布式Map阶段：多worker并行处理
func runMap(splitLines [][]string, mapOutChan chan<- KeyValue) {
	var wg sync.WaitGroup
	wg.Add(mapWorkerNum)

	for i := 0; i < mapWorkerNum; i++ {
		idx := i
		go func() {
			defer wg.Done()
			// 当前worker处理自己的数据分片
			for _, line := range splitLines[idx] {
				kvs := mapFunc(line)
				for _, kv := range kvs {
					mapOutChan <- kv
				}
			}
		}()
	}

	// 所有Map跑完关闭通道
	go func() {
		wg.Wait()
		close(mapOutChan)
	}()
}

// Shuffle：按分区把相同key聚合，分发给Reduce
func runShuffle(mapOutChan <-chan KeyValue) []map[string][]int {
	// 每个Reduce对应一个分组map
	reduceGroups := make([]map[string][]int, reduceWorkerNum)
	for i := range reduceGroups {
		reduceGroups[i] = make(map[string][]int)
	}

	// 路由KV到对应Reduce分组
	for kv := range mapOutChan {
		rid := partition(kv.Key)
		reduceGroups[rid][kv.Key] = append(reduceGroups[rid][kv.Key], kv.Value)
	}
	return reduceGroups
}

// 分布式Reduce阶段：多worker并行聚合
func runReduce(reduceGroups []map[string][]int) map[string]int {
	result := make(map[string]int)
	var mu sync.Mutex
	var wg sync.WaitGroup

	wg.Add(reduceWorkerNum)
	for i := 0; i < reduceWorkerNum; i++ {
		idx := i
		go func() {
			defer wg.Done()
			// 处理当前Reduce分区的所有key
			for k, vals := range reduceGroups[idx] {
				res := reduceFunc(k, vals)
				mu.Lock()
				result[k] = res
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	return result
}

// 入口：分布式MapReduce总调度
func DistributedMapReduce(data []string) map[string]int {
	// 1. 数据分片：分给每个Map Worker
	split := make([][]string, mapWorkerNum)
	for i, line := range data {
		idx := i % mapWorkerNum
		split[idx] = append(split[idx], line)
	}

	mapOutChan := make(chan KeyValue, 100)

	// 2. 并行Map
	runMap(split, mapOutChan)

	// 3. Shuffle 分区分组
	reduceGroups := runShuffle(mapOutChan)

	// 4. 并行Reduce
	return runReduce(reduceGroups)
}

// ==================== 测试运行 ====================
func main() {
	// 原始海量数据
	data := []string{
		"hello go mapreduce",
		"hello go runtime",
		"go mapreduce golang",
		"hello distributed go",
		"mapreduce go design",
	}

	res := DistributedMapReduce(data)

	// 打印结果
	for k, v := range res {
		fmt.Printf("%-15s => %d\n", k, v)
	}
}
```

---

## 核心提炼：对应原生MapReduce分布式原理
### 1. 数据分片 InputSplit
把原始数据均分成多份，分给不同 **Map Worker**，对应 Hadoop 切片。

### 2. 分布式 Map
多个 Goroutine 模拟**多台机器并行 Map**，各自处理本地分片，输出中间 KV。

### 3. Shuffle 核心（分布式关键）
- **Partition 分区**：按 Key 哈希分到不同 Reduce
- **相同 Key 必定进入同一个 Reduce**
- 模拟跨节点数据拉取、分组、排序

### 4. 分布式 Reduce
多个 Goroutine 模拟**多台 Reduce 节点**，各自处理自己分区的数据，并行聚合。

---

## 关键特性（和真实MapReduce一致）
1. **横向扩展**：改 `mapWorkerNum` / `reduceWorkerNum` 就能加节点
2. **数据局部性**：Map 只处理自己分片
3. **Shuffle 分区路由**：相同 Key 归到同一个 Reduce
4. **完全解耦**：只改 `mapFunc` / `reduceFunc` 就能做任意业务统计

---

## 扩展成真实集群的改造点
你后续要改成跨机器分布式，只需要替换3处：
1. Goroutine → 独立进程/不同服务器
2. Channel 通道 → HTTP/gRPC 网络传输
3. 内存分片 → 从 HDFS/对象存储拉取分片数据

原始海量数据
       ↓
   【Master调度节点】
  数据分片、任务分配
       ↓
┌─────┬─────┬─────┐
│MapW1│MapW2│MapW3│  多个Map Worker（并行goroutine/机器）
└─────┴─────┴─────┘
       ↓  输出中间KV
  【Shuffle 分区洗牌】
按Key哈希分区 → 同Key路由到同一个Reduce
       ↓
┌─────┬─────┐
│RedW1│RedW2│  多个Reduce Worker（并行goroutine/机器）
└─────┴─────┘
       ↓
    最终结果



````