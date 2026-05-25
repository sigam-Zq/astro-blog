---
title: '微服务学习'
description: '微服务学习'
pubDate: '2026-05-20'
---





# Lecture 1 微服务

## 1.1 概览

### 演进


1. 单体巨石架构


2. SOA 面向服务的架构 (萌芽)

3. 微服务

利弊
* 单体交付, 分库分表
* 基础设施复杂性变高
* 依赖各自的数据库, 可扩展性灵活
* 因为依赖各自服务, 服务调用开销变大 ,需要进程调用



### 思路

1. 组件服务化
 传统实现组件方式是 通过library 
 * kit  微服务基础库
 * service 业务代码 + kit 依赖 + 第三方依赖组成的业务微服务
 * RPC + message Queue 轻量级通信



2. 去中心化
 * 技术去中心化 可以多语言写不同的服务
 * 治理去中心化 
 * 数据去中心化

3. 基础设施自动化
 无自动化不微服务 包括测试和部署
 * CICD gitlab + gitlab Hooks + kubenretes
 * Testing 测试环境 单元测试 API自动化测试
 * 在线运行时 k8s 以及一系列prometheus,ELK ,Control_Panle

4. Design For Dailure. 可用性 & 兼容性设计
 * 隔离
 * 超时
 * 负载保护
 * 限流
 * 降级
 * 重试
 * 负载均衡


 API 设计上需要注意
 Be conservative in what you send ,be liberal in what you accept
 发送时要保守, 接受时要开放. 博斯塔尔法则的思想 [消息发送要最小化 - 接受要最大化]




##  1.2 设计

### API Gate Way

思路垂直代码拆分 先拆出来用户角色服务

SOA 开始进行设计时候 [没有网关的情况]
 * 老的借口的兼容 - 旧版本用户如果不进行升级的情况 
 * 多次请求, 客户端聚合数据, 工作量较大. 延迟高 -(因为服务端是拆分的)  [一般是 前轻后重 客户端少做数据处理]
 * 协议不利于统一
 * 面向 “端“ API适配 耦合到了内部服务
 * 多终端处理逻辑兼容适配.
 * 统一逻辑无法收敛 比如安全认证和限流
上面的这些问题需要引出网关的概念 要求内聚模式配合


or. 面向资源的 接口 
在网关后心中一个 Backend For Frentend 一个data-interface
[BFF](https://zhuanlan.zhihu.com/p/617185805)


优势
- 轻量交互
- 差异服务 数据裁剪和聚合
- 动态升级
- 沟通效率提升 协作模式演进为移动业务+网关小组


[康威定律](https://zhuanlan.zhihu.com/p/104614255)

这里的模式带来一个问题是 BFF 带来沟通成本的递增, 进一步针对BFF单独的app-interface 进行进一步的拆分 横切面的逻辑-安全认证-日志监控-熔断限流随着时间越来越复杂技术栈越来越多

引入  跨横切面(Cross-cutting concerns) 全部上沉 引入到网关层面
实现架构上的 关注分离(Separation concerns)


![alt text](/micro-server-v1.png)

最后后端流量进来 网关-> BFF -> 微服务



### 微服务上下界划分


* Business Capability

根据公司不同部门提供职能进行划分


* Bounded Context
限界上下文是DDD用来划分不同业务边界的元素, 这里业务边界的含义是 ”解决不同业务问题“ 的问题域和对应解决方案域,为了解决某种类型的业务数据。本质上促进了组织结构的演进 service per team



#### 一个例子 CQRS（Command Query Responsibility Segregation）
把应用程序分为两部分 命令端和查询端
 命令端 复杂程序的创建更新和删除 数据更改时发出事件.
 查询端 针对一个或多个视图执行查询来处理查询,这些物化视图通过订阅数据更改时的事件流而保持更新.


 这里推进了 Polling pushlisher -> Transaction log tailing 进行演进 
Pull vs Push


### Mircoservice 安全

外网 API Gateway 进行统一认证拦截 一旦认证成功 我们会使用Header的方式通过RPC元数据传入BFF层 ,然后获取到身份信息注入到应用到Context中 BFF到其他下层的微服务,建议是直接在RPC Requesr 中带入用户信息(UserID) 请求服务

* API Gateway -> BFF -> Service
* Biz Auth -> UID -> Request Args

对于服务内部,一般要区分身份认证(他是谁)和授权(他能干什么)

* Full Trust 完全信任
* Half Trust 明文可被抓
* Zero Trust 零信任 微服务之间也要进行解密认证[Token or 证书 进行认证]



## 1.3 gRPC & 服务发现




### gRPC

[gRPC](https://grpc.io/)
A high performance, open source universal RPC framework


* 多语言 语言中立
* 轻量级 高性能 序列号支持PB(protocol Buffer)
* 可拔插
* IDL 基于文件定义服务 通过proto3生成置顶数据结构 服务端接口和客户端stub
* 设计理念
* 移动端: 基于标准的HTTP/2 设计 支持双向流, 消息头压缩 单TCP的多路复用 服务端推送等特性 ,这些特性让GRPC 在移动端更加省电和节省网络流量


```bash
protoc --go_out=. --go_opt=paths=source_relative \
    --go-grpc_out=. --go-grpc_opt=paths=source_relative \
    helloworld/helloworld.proto
```

```proto3
// The greeting service definition.
service Greeter {
  // Sends a greeting
  rpc SayHello (HelloRequest) returns (HelloReply) {}
}

// The request message containing the user's name.
message HelloRequest {
  string name = 1;
}

// The response message containing the greetings
message HelloReply {
  string message = 1;
}
```

* 服务并非对象 消息而非引用 促进为符合系统间颗粒度消息
* 负载无关的 可使用 pb json xml
* 流 Streaming API
* 阻塞和非阻塞式
* 元数据交换
* 标准的状态码

**先定义标准 不要过早关注性能**

### gRPC HealthCheck
gRPC 有一个标准的健康监测协议, 在gRPC都实现了生产代码和用于设置运行状态的功能
区分

* liveness 活着
* readiness 是否可以接受流量



### 服务发现


生命周期的问题需要进行管理 需要引入 服务发现

一个服务的下线的状态

1. Online
2. Cancel(kill cancel)
3. Offline (graceful timeout)



```text
                     ┌────────────┐
                     │ Discovery  │
                     └────────────┘
                       ↑        ↓
         (register)  /            \  (poll)
                   /              \
┌────────────┐   /                \   ┌────────────┐
│  Provider  │<──────────────────────>│  Consumer  │
└────────────┘         (call)         └────────────┘
      ↑                                         ↓
      └─────────── (health check) ──────────────┘
```



#### 客户端发现（Client-Side Discovery）
 服务器实例启动后,网络地址写到注册表.服务器实例终止时从注册表删除


 ```text
 ┌──────────┐  register  ┌──────────┐
│ Provider │──────────>│ Discovery│
└──────────┘           └──────────┘
                            ↑
┌──────────┐ poll      ┌──────────┐
│ Consumer │<─────────│ Discovery│
└──────────┘           └──────────┘
      │
      │ (load balancing)
      ▼
┌──────────┐
│ Provider │
└──────────┘
 ```


Consumer 从 Discovery 拉取所有 Provider 列表
Consumer 自己做负载均衡、节点选择、故障重试
直接请求 Provider，不经过额外的代理

#### 服务端发现 （Server-Side Discovery）
 客户端 通过负载均衡器 向一个服务发送请求, 负载均衡器查询服务注册表,并将请求路由到可用的服务器实例上, 服务实例在在服务注册表被注册和注销(Consul Template + nginx ,k8s+etcd)


 ```text
 ┌──────────┐ register  ┌──────────┐
│ Provider │──────────>│ Discovery│
└──────────┘           └──────────┘
                            ↑
                            │ (registry)
┌──────────┐           ┌──────────┐
│ Consumer │─────────>│ Discovery/│
└──────────┘           │  LB      │
                        └──────────┘
                            │ (load balancing)
                            ▼
                        ┌──────────┐
                        │ Provider │
                        └──────────┘
 ```




#### 扩展最新方案 service mesh

这个把服务注册发现放到边车服务当中

#### 关于常用服务注册发现服务异同

> ZooKeeper 和 Eureka/Nacos 有什么区别？

答：
* ZooKeeper：强一致性（CP），适合对一致性要求高的场景，比如分布式锁、主从选举
* Eureka：高可用（AP），适合服务注册发现，允许短暂不一致
* Nacos：支持 AP/CP 切换，兼顾服务发现和配置中心，功能更全


ZK注册发现流程
```text

┌─────────────────┐        ┌─────────────────┐
│   Provider 1    │───────▶│   ZooKeeper     │
│ (user-service)  │ register /dubbo/service/ │
└─────────────────┘        │ user-service    │
                            └─────────────────┘
┌─────────────────┐           ↑   ↑
│   Provider 2    │───────────┘   │
│ (user-service)  │ register      │
└─────────────────┘               │
                                  │ poll/watch
┌─────────────────┐               │
│   Consumer      │◀──────────────┘
│ (order-service) │  get list of
└─────────────────┘  user-service instances
          │
          ▼ (call directly)
    ┌─────────────────┐
    │   Provider 1/2 │
    │  user-service  │
    └─────────────────┘
```



分布式小知识科普

````md
CAP 三定理​
C = 一致性  A = 可用性  P = 分区容错​
分布式系统三者只能选其二，不能同时全占​
字母直译​
C Consistency 一致性​
所有节点同一时刻查到的数据一模一样，不分新旧​
A Availability 可用性​
任何时候请求服务，都能正常响应、不宕机、不拒绝​
P Partition tolerance 分区容错​
网络断连、机房不通、节点失联，系统依然能正常跑​
互联网跨机器通信，网络分区 P 必然存在，所以所有分布式架构只剩二选一：​
要么 CP，要么 AP

​
转账（必须 CP）​
钱不能一边扣一边没加，不一致直接出事，宁可暂停服务​
服务注册（用 AP）​
某个服务上下线慢几秒同步无所谓，服务能调用最重要
````



#### 原理

1. 通过 Family(appid) 和 Addr (IP:Port) 定位实例 除此之外还需要附加跟多元数据: 权重 染色标签 集群

2. Provider 注册后定期 心跳一次, 下线需要同步 注册和下线都需要长轮循推送

3. Consumer 拉取实例 发起30s等 长轮询  故障时,需要client 测cache节点信息

* Server 定期 60s 监测失效90s的实例 失效进行剔除,短时间丢失了大量的心跳连接











## 1.4 多集群 & 多租户


L0 服务 类似账号 之前一直是一个大集群,一旦故障影响巨大,所以需要考虑多集群的必要性
1. 从单一集群考虑 多个节点保证可用性,通常使用N+2来冗余节点
2. 单一集群故障带来影响,考虑多集群
3. 机房故障考虑多机房


### 多集群

* 这里多集群的带来一些问题
1. 这里的流量转发 不好切换
2. 缓存命中率过低   集群需要独占缓存-带来更好的性能和冗余能力



* subset 算法 低峰期减少heathcheck 对cpu消耗



### 多租户


允许多系统共存-多版本的存在
 * 金丝雀发布  染色发布
 * 影子系统(shadow systems)
    * 流量路由


本质描述为 :
  跨服务传递请求携带上下文 context ,数据隔离的流量路由方案 利用服务发现注册租户信息,注册成特定的租户

  需要针对日志指标存储消息队列和缓存等配置都带有隔离的标签标记,不然不好进行识别




## Lecture 2 异常处理 

### 2.1 Error vs Exception



这里errors.New 返回的 其实都是 errorString 对象的指针对象
对应源码如下

src/errors/errors.go
```go

package errors

// New returns an error that formats as the given text.
// Each call to New returns a distinct error value even if the text is identical.
func New(text string) error {
	return &errorString{text}
}

// errorString is a trivial implementation of error.
type errorString struct {
	s string
}

func (e *errorString) Error() string {
	return e.s
}
```


为什么要返回指针
```go

package main

import (
	"errors"
	"fmt"
)

type errorString string

func (e errorString) Error() string {
	return string(e)
}

func New(text string) error {
	return errorString(text)
}

var ErrNameType = New("EOF")
var ErrStructType = errors.New("EOF")

func main() {
	if ErrNameType == New("EOF") {
		fmt.Println("Name Type Errors")
	}

	if ErrStructType == errors.New("EOF") {
		fmt.Println("Struct Type Error")
	}

	if ErrStructType == ErrNameType {
		fmt.Println("ErrStructType == ErrNameType")
	}

}

//返回 Name Type Errors

```

这里是为了保证这里的判断同步使用的是指针地址而不是字符串


go 规范
自定义错误的时候 带上包名冒号
eg https://cs.opensource.google/go/go/+/refs/tags/go1.26.3:src/bufio/bufio.go
```go
package bufio

//......
var (
	ErrInvalidUnreadByte = errors.New("bufio: invalid use of UnreadByte")
	ErrInvalidUnreadRune = errors.New("bufio: invalid use of UnreadRune")
	ErrBufferFull        = errors.New("bufio: buffer full")
	ErrNegativeCount     = errors.New("bufio: negative count")
)
```



#### 对比多语言

* C 数字表示报错码 因为C 不支持多参数返回
* C++ 引入了Exception 概念
* Java 要求抛出和捕捉
* Go 外置 error 处理和 panic 弹出




概念区别。对于不可恢复的程序错误的情况 使用panic 仅仅是意外情况的时候使用go中的error

go Error 概念相较于其他的比如java的Exception
* 简单
* 考虑失败(Plan for failure, not success)。
* 没有隐藏的控制流
* 完全交给你控制
* Error are values

[文章](https://blog.csdn.net/weixin_40426261/article/details/121095289)

you only need to check the error value if you care about the result. – Dave
This blog post from Microsoft’s engineering blog in 2005 still holds true today, namely:
My point isn’t that exceptions are bad. My point is that exceptions are too hard and I’m not smart enough to handle them.


### 2.2 Handling Error



扫描器模式代码 
- 把error 隐藏起来的一个模式




```go

func CountLines(r io.Reader)(int,error) {
  var (
    br := bufio.Reader(r)
    lines int
    err error
  )
  for {
    _,err := br.ReadString('\n')
    // 这里需要注意 io.EOF 也是一种Error
    lines++
    if err != nil{
      break
    }
  }
  if err != io.EOF{
    return 0,err
  }
  return lines,nil
}

```

替换为
```go
func CountLines(r io.Reader)(int,error) {
	scanner := bufio.NewScanner(r)
  lines := 0
	for scanner.Scan() {
		lines++
	}
  return lines,scanner.Err()
}
```

比如在sql 执行获取对象的时候也有类似的封装 .Scan() 返回的对象需要注意.Err() 方法里的error 被暂存了,需要注意返回



#### Error 包装思路

关于上面实现错误包装的思路


源代码

```go


type Header struct {
	Key, Value string
}

type Status struct {
	Code   int
	Reason string
}

func WriteResponse(w io.Writer, st Status, headers []Header, body io.Reader) error {
	_, err := fmt.Fprintf(w, "HTTP/1/1 %d %s\r\n", st.Code, st.Reason)
	if err != nil {
		return err
	}
	for _, n := range headers {
		_, err := fmt.Fprintf(w, "%s: %s\r\n", n.Key, n.Value)
		if err != nil {
			return err
		}
	}

	if _, err := fmt.Fprintf(w, "\r\n"); err != nil {
		return err
	}
	_, err = io.Copy(w, body)
	return err
}

//  上面的基础上封装 包装类进行错误放封装

type WarpErrWriter struct {
	io.Writer
	err error
}

func (w *WarpErrWriter) Write(buf []byte) (int, error) {
	if w.err != nil {
		return 0, w.err
	}
	var n int
	n, w.err = w.Write(buf)
	return n, nil
}

func WriteResponseRf(w io.Writer, st Status, headers []Header, body io.Reader) error {
	wr := &WarpErrWriter{
		Writer: w,
	}
	fmt.Fprintf(wr, "HTTP/1/1 %d %s\r\n", st.Code, st.Reason)

	for _, n := range headers {
		fmt.Fprintf(wr, "%s: %s\r\n", n.Key, n.Value)

	}

	fmt.Fprintf(wr, "\r\n")
	io.Copy(wr, body)
	return wr.err
}

```

#### 代码打印规范

如果仅仅是 直接往上抛代码
一层层的往上传之后,回导致一个问题,不知道调用链路和行号位置
所需需要下面的改动
```go

if err != nil {
  return err
}

// 修改为

if err != nil {
  return fmt.Errorf("[方法名] failed: %v",err)
}
```

但是这种模式 和[sentinel errors](https://www.17golang.com/article/494384.html) 和 type assertions 的使用不兼容


> type assertions
 外面调用
ne, ok := err.(NetworkError) // → ok = false ❌ 这里不支持


```go
// 判断哨兵错误
if errors.Is(err, ErrNotFound) { // ✅ 正确
}

// 类型断言
var ne NetworkError
if errors.As(err, &ne) { // ✅ 正确
}
```


Go 1.13 在 fmt 里加了一个新类型：wrapError。
使用上 需要使用 %v --> %w
或者使用 github.com/pkg/errors库的
errors.Wrap(e2, "middle") 或 func WithMessage(err error, message string) error

这个errors 库还支持打印堆栈信息

```go
if err !=nil{
  fmt.Printf("original error: %T %v \n",errors.Cause(err),errors.Cause(err))
  fmt.Printf("stack trace: \n%+v\n",err)
  os.Exit(1)
}
```
其中知识点

它和 Go 普通 %v 的区别：
%v → 只打印错误字符串（普通错误）
%+v → 打印 错误信息 + 完整调用栈（文件名 + 行号 + 函数名

打印出来的样子
```text
original error: *errors.errorString database connect failed
stack trace:
database connect failed
test2 failed
main.test2
	/Users/xxx/demo.go:22
main.test1
	/Users/xxx/demo.go:18
main.main
	/Users/xxx/demo.go:10
runtime.main
	/usr/local/go/src/runtime/proc.go:250
runtime.goexit
	/usr/local/go/src/runtime/asm_arm64.s:1165
```


pkg/errors.go 
```text
pkg/errors 函数层级关系
┌─────────────────────────────────────────────────────────┐
│  入口包装函数                                           │
├─────────────┬─────────────────────────────────────────┤
│ Wrap()      │ WithMessage() + WithStack()             │
│ Wrapf()     │ WithMessagef() + WithStack()            │
└──────┬──────┴─────────────────────────────────────────┘
       │
┌──────▼─────────────────────────────────────────────────┐
│ 基础构造函数                                             │
├─────────────┬─────────────────────────────────────────┤
│ New()       │ 创建原始错误                             │
│ WithMessage │ 仅追加错误描述，无堆栈                   │
│ WithStack   │ 仅捕获调用堆栈，无额外描述               │
│ WithCause   │ 绑定根错误                                │
└──────┬──────┴─────────────────────────────────────────┘
       │
┌──────▼─────────────────────────────────────────────────┐
│ 内部封装结构体                                           │
├─────────────┬─────────────────────────────────────────┤
│ errorString │ 原生基础错误                              │
│ withMessage │ 带文本包装错误                           │
│ withStack   │ 带堆栈包装错误                           │
│ withCause   │ 根错误关联结构                           │
└──────┬──────┴─────────────────────────────────────────┘
       │
┌──────▼─────────────────────────────────────────────────┐
│ 解析拆解工具函数                                         │
├─────────────┬─────────────────────────────────────────┤
│ Cause()     │ 递归解包，获取最源头根错误               │
│ Unwrap()    │ 只拆解当前一层包装                       │
│ Is()        │ 判断错误链是否包含目标错误               │
│ As()        │ 类型断言匹配自定义错误                   │
└─────────────┴─────────────────────────────────────────┘

调用最简链路
Wrap(err, msg)
├─▶ WithMessage(加文案)
└─▶ WithStack(捕获堆栈)

层级嵌套示例
WrapErr
└─ withStack
   └─ withMessage
      └─ 原始root error
```


* 这里如果第三方库使用了这里的堆栈错误捕获的同时, 在应用也使用了 这种方式进行捕获的时候,回产生两个堆栈信息的打印这里.
   - 引申 这里如果开发第三方库的时候不建议使用warp这种方式, 只建议在主应用中使用这种warp拿到堆栈信息的方法,不然这里会有不必要的性能消耗

* 如果错误处理了,这里进行了降级了,这里应该返回nil

#### 错误处理原则
you should only handle errors 
once, Handling an error means inspection the error value and making a single decision.
应该只处理错误一次

```go
if err != nil{
  fmt.Println("xxxx failed",err)
  return err
}
```
这里就打印了而且又往上抛出了

正确的办法是 
1. 不能处理的时候直接往上抛 做%w的包装
2. 能处理的,打印之后 返回空 然后需要做降级处理的做降级处理(前面处理的一半多事情需要撤回 [事务很像])

😑这里的日志的原则应该是 某项东西失败了,日志记录了原因
如果日志记录和错误无关切对调试没有帮助的信息应该被视为噪音.



### 2.3 Error Type

##### Sentinel Error

   上面提过的内容
   就是预定义在代码中的error

  * 这里预定义了 必然会成为API的公开部分
  * 这里进一步会造成两个包的依赖
  * 排查过程不好用,需要用字符串进行查找,但是程序需要用等值判断
#####  Error Types
  
    * 这里的问题是也就增加包的耦合现象和上面一样 也是尽量少用

实现error 接口的方法 然后其中的错误文本记录其中的文件和行号

```go
type MyErr struct{
  Msg,Flie string
  Line int
}

// 然后使用断言进行打印
err := test()
switch err := err.(tyoe){
  case nil:
  // on sucessded
  case *MyErr:
    fmt.Println(err.Line)
  default:
    //,,,
}

```

例如 os.PathError


> 这里都是尽量少暴漏作为公共API的部分,因为只有少暴漏的才能用起来简单



#####  Opaque errors

 * 最灵活的错误处理策略,要求代码和调用者之间的耦合最少
 不透明的错误处理

```go

func fn ()error{
  x,err := bar.Foo()
  if err != nil{
    return err
  }
}

```

* Assert errors for behaviour ,not type
去判断是否具备某种行为 ,而不是类型


```go

type temporary interface{
  Teporary()bool
}

func IsTemporary(err error)bool{
  te,ok := err.(temporary)
  return ok &&te.temporary()
}

```

标准库的 net 包下
src/net/net.go
```go

// An Error represents a network error.
type Error interface {
	error
	Timeout() bool // Is the error a timeout?

	// Deprecated: Temporary errors are not well-defined.
	// Most "temporary" errors are timeouts, and the few exceptions are surprising.
	// Do not use this method.
	Temporary() bool
}


// 其他地方 使用判断

  if nerr, ok := err.(Error); !ok || (!nerr.Timeout() && !nerr.Temporary()) {
    return
  }

```

只去判断行为的方式去判断

三大特点
* 低耦合：调用方不依赖被调用方的错误类型 / 结构，API 最稳定。
* 黑盒化：仅用 err != nil 二分判断，不暴露内部实现。
* 极简：代码干净，无类型断言、无 Sentinel 判断。


### 2.4 Error Inspection

1.13新特性
* error 很多新特性 
  实现 
   * 方法 Is [Unwarp 递归去判断是否相同的错误]
   * 方法  As  替代类型断言
    ```go
    var e *QueryErr
    if errors.As(err,&e) {
      _ := e.Attr
    }

      // 替代之前的 
      switch e := err.(type) {
        case *QueryErr: 
          //xxx
        default:
         // xxx   
      }
    ```
   * 可以适配的interface Unwarp()
   * fmt 新增 %w 可以进行 包装error 然后后续可以进行Is As 方法使用


(go2新特性题案)[https://zhuanlan.zhihu.com/p/50978421]




## Lecture 3 并行编程



### 3.1 Goroutine


#### Processes and Threads

Process 拥有资源的主体 资源包括内存地址空间 文件句柄 设备 线程

Threads  存在一个主线程，主线程是进程执行起点，并且主线程结束时进程也就终止了
CSP 模型
#### Goroutines And Paralelism


系统层面是不支持协程的，这里的协程是go运行时虚拟出来的概念，由go运行时进行调用逻辑执行单元（P）来实现和线程进行绑定运行
这里可以轻松调度数十万个协程

Concurrency is not Parallelism
并发不是并行。 并行是两个或更多线程在不同的处理器进行执行代码。如果运行时配置为使用多个逻辑处理器。则调度程序将在这些逻辑处理器之前分配gotoutine，但是，要是想获取真正的并行性，需要在具备多个物理处理的计算机上运行程序，否则goroutine将正对单个物理处理器并发运行，即使go运行时使用多个逻辑处理器。换而言之，这里goroutine 是并行和并发要针对具体机器和go运行时的使用情况相关、



* go 关键字进行并发
  * 搭配 select {} 这里的空select {} 语句将永远阻塞


但是这里需要检查注意的一个原则  keep yourself busy or do the work yourself  如果你要等这个线程完成后再去做。不如自己做

leave concurrency to the caller  将并发处理交给调用者处理
```go
func  ListDirectory(dir string)([]string,error)

func  ListDirectory(dir string)chan string
```
这里的处理就有区别了
  一个是需要处理完所有的数据才可以返回， 第二个是处理一个就及时的返回了，类似于流式的处理

但是这里的第二个还会出现两个问题
 * 无法返回一个错误，无法区分没有数值和报错，这里都表现为通道关闭为特征
 * 调用者必须持续从通道获取， 因为这里不去取出来，内部协程会一直阻塞

 针对这两个问题的优化
 ```go
 func ListDirectory(dir string, fn func(string))
 ```
 eg。标准库的 filepath.WalkDir 

 这里如果函数启动goroutine 则必须向调用方提供显式停止改 goroutine的方法。通常，将异步执行函数的决定权交给该函数的调用方通常更容易（不然这个协程容易泄露）
  泄露的demo
  ```go
  func leak(){
    ch := make(chan int)

    go func(){
      val := <=ch
      fmt.Println("we received a value:".val)
    }()
  }
  ```
  Never start a goroutine without knonwning when it will stop 这个协程永远不会停止

  使用协程前要问自己两个问题
  * When will it terminate? 什么时候终止
  * What could prevent it from terminating? 有什么因素阻止其终止


协程有时候会使用下面的内容
小知识点 
> log.Fatal 会调用 os.Exit(1)  这里defer 不会被调用到

这种调用一般只推荐两个地方用 一个是 init() 函数 或者main 配置解析失败的情况 




#### Application Lifecycle

这里的协程最主要的就是关于对启用一个服务的生命周期的管理

[demo](https://github.com/da440dil/go-workgroup/tree/master)


main 函数启用多个服务要怎么样管理启停，要怎么优雅终止

服务的启动还涉及到下面的工作
* 应用的信息 版本名称
* 服务的启停
* 信号的处理 sigterm 之类 这里是一个启动服务的包装器
  ```GO
  package util

  import (
    "context"
    "os"
    "os/signal"
    "syscall"
    "time"

    "backend/pkg/logging"
    "go.uber.org/zap"
  )

  // The Run function sets up a signal handler and executes a handler function until a termination signal
  // is received.
  func Run(ctx context.Context, handler func(ctx context.Context) (func(), error)) error {
    state := 1
    sc := make(chan os.Signal, 1)
    signal.Notify(sc, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT)
    cleanFn, err := handler(ctx)
    if err != nil {
      return err
    }

  EXIT:
    for {
      sig := <-sc
      logging.Context(ctx).Info("Received signal", zap.String("signal", sig.String()))

      switch sig {
      case syscall.SIGQUIT, syscall.SIGTERM, syscall.SIGINT:
        state = 0
        break EXIT
      case syscall.SIGHUP:
      default:
        break EXIT
      }
    }

    cleanFn()
    logging.Context(ctx).Info("Server exit, bye...")
    time.Sleep(time.Millisecond * 100)
    os.Exit(state)
    return nil
  }
  ```
* 服务的注册



关于一个应用管理器的扩展  go-kratos kit 库的设计涉及技术思想
 * [errorgroup](https://zhuanlan.zhihu.com/p/338999914)  关于waitgroup的扩展
 * [function options](https://www.cnblogs.com/taadis/p/go-functional-options-pattern.html) 简单灵活可选配置应用参数


 #### Incomplete work

 * 一个事件上报的采集逻辑直接使用 go 开启协程取进行事件上报，但是主进程如果结束，这里协程逻辑会直接断开，导致工作没有进行导致数据的上报失败，并且没有错误日志
     * 解决 使用 sync.WaitGroup 主程序最后wait  等待上报完成后关闭
    > 这里进一步讨论- 但是这种情况这里不能无限等待 子协程的结束，主协程 需要加入超时控制的功能
    
    然后这里需要在原有的基础上使用context 进行超时控制，然后使用channel(包括 ctx.done 的捕捉) 使用暂停信号进行统一协调退出

> 然后这里channel 协调的时候 需要注意最好是写的channel的owner 先去退出，然后读的owner 再去退出


关于等价代码
```go
for data := range ch {
	fmt.Println(data)
}
```
和
```go
for {
	data, ok := <-ch

	if !ok {
		break
	}

	fmt.Println(data)
}
```



### 3.2 Memory model

[官方原文](https://go.dev/ref/mem)
如何保证一个协程看到另一个协程的最新改动， 这里如果程序中修改数据时有其他gorotine 同时读取， 那么必须将读串行化。为了串行化访问，这里请使用channel 或者 其他同步原语， 例如 sync 和sync/atomic 来保护数据


Happend-Before
* 注意 cpu重排和编译器重排 结合 多核心场景下 改变执行顺序导致协程读写打印顺序导致bug出现 （因为多核心场景下，重排优化策略下没法判断优化后的代码语义一致-【是因为不同的线程在不同核心下各自独享store buffer 然后这里缓存buffer 刷到内存还需要一定时间-然后这里的内存不一致性导致读写的不是一块内容】）

memory Reordering 的影响

这里需要引入 锁的操作了  cpu 支持的[berrier或者fence](https://blog.csdn.net/fengyuyeguirenenen/article/details/123558970) 在支持 go语言层面支持了lock和原子操作的原语句

扩展 [COW](https://zhuanlan.zhihu.com/p/333675803) copy on write linux的fork机制 go map的扩容机制

这里interface 和 [slice的赋值也不是原子的](https://mianshi.idocdown.com/app/articles/blogs/detail/12266) 需要注意


[MESI](https://zhuanlan.zhihu.com/p/351550104) CPU 怎么保持缓存的一致性



### 3.3 package sync


* share Meemory By Communicating


chan 底层实现其实也是互斥锁的实现

多线程访问同一资源(变量或者数据结构)的情况需要注意这里的数据静态
小公举
go 1.1 引入 race detector
go build -race 这里编译后如果产生data race 执行会有打印 [非生产环境使用]
go test -race


其实i++这样的指令在汇编里是三条指令-不一定是原子操作 ,这里可以通过 gobuild -S 生成汇编去验证 寄存器读写两步 自增一步

go 鼓励去使用channel 而不推荐使用 共享统一变量
但是 channel 比较适用于 任务分发这一类比较重的任务上, 一些比较轻量的任务还是 使用变量等使用 Mutex Atomic 这类的 轻的

#### Detecting Race Conditions With Go

其中 single machine word 赋值这里将是原子的,
但是这里
```go
type interface struct{
 Type uintptr 
 Data uintptr
}
```
由于这里类型并不是单个 macheine word , 所以这个的赋值操作并不是原子的在 Go memory model 被提及

普通指针, map,slice 可以安全更新么 
没有安全的data race(safe data race) 您的程序要么没有data race 要么其操作没有定义
* 原子行
* 可见性 (别人能不能立刻看到你改完的数据)

atomic.Value 的值满足这个原子行和可见性的要求
其中数据多的情况下。使用 atomic.Value 和 Copy on write [老的数据做成只读- 这里只做拷贝替换]的策略,性能要比使用读写锁的性能还要好  实现无锁访问共享数据

扩展阅读
[redis bgsave 方案](https://cloud.tencent.com/developer/article/2594926)


#### Mutex
上面讲了 atomic 这里是Mutex


有个小demo 反应了一些问题

```go
package main

import (
	"fmt"
	"sync"
	"time"
)

func main() {

	done := make(chan bool, 1)
	var mu sync.Mutex

	g1Count := 0
	// goroutine 1
	go func() {
		for {
			select {
			case <-done:
				return
			default:
				g1Count++
				mu.Lock()
				time.Sleep(100 * time.Microsecond)
				mu.Unlock()
			}
		}
	}()
	fmt.Printf("g1 count: %d\n", g1Count)

	// goroutine 2
	for i := 0; i < 10; i++ {
		time.Sleep(100 * time.Microsecond)
		mu.Lock()
		//do sometinring
		mu.Unlock()
	}
	done <- true
}
```
```bash
z@MacBookPro goroutine-mutex % go run main.go 
g1 count: 0
# 这里没有复现 这里如果是go1.8版本的情况下 g1 count: 应该能达到七十万 然后g2运行十次
```

关于锁的几种实现

* Barging
为了提高吞吐量,锁释放的时候会唤醒第一个等待者,然后把锁给一个等待者或者给第一个请求锁的人,(会锁饥饿?)

* Handsoff
锁准备释放的时候,一直持有直到第一个等待者准备好获取锁,它降低了吞吐量
一个互斥锁的hansoff会完美的平衡两个goroutine之间的锁分配,但是会降低性能,因为他会迫使第一个goroutine 等待锁

* Spinning
自旋, 自旋在等待队列为空或者应用程序重度使用锁效果不错. parking 和unparking gorouteines 有着不敌的性能成本开销,相比自旋来说要慢点很多


go 1.8 使用了barging 和spining 的结合实现, 当试图获取已经持有的锁的时候,如果本地队列为空并且P的数量大于1,goroutine将自旋几次(用一个P会阻塞程序),自旋后, goroutine park .在程序高频使用锁的情况下,它充当了一个快速路径

go 1.9 通过添加一个新的饥饿模式来解决前期解释的问题,改模式将会释放的时候触发handsoff. 所有等待超过1毫秒的goroutine(也被称为有界等待) 会被标记为饥饿状态. 当被标记为饥饿状态时 unlock方法会handsoff把锁直接扔给下一个等待者.
饥饿模式下,自旋也会被停用,因为传入的goroutines 将没有机会获取为下一个等待者保留的锁.



#### errorgroup

多个并发数据做数据聚合的情况 使用waitgroup 然后多一个返回错误的情况 使用[errgroup](golang.org/x/sync/errgroup)

* 并行工作流
* 错误处理 或者优雅降级
* context 传播和取消
* 利用局部变量和闭包


新版本的特性
Go 1.25（2025-08 发布）
```go
var wg sync.WaitGroup
wg.Go()
```
func (wg *WaitGroup) Go(f func()) 
而 errgroup 一直有这样的用法,
然后这里的 主要是封装wg.Add(1) wg.Done() 的结束逻辑



#### sync.Pool


 sync.Pool 的场景是用来保存和复用临时对象,以减少内存分配, 降低GC压力(Request-Driven).
  针对频繁使用,可能会导致从栈数据逃逸到堆数据的变量 ,建议用这种方式进行管理

  这里也会被GC清空,不过清空后再去取会重新new一个出来, go1.13之后引入了[victim cache](https://zhuanlan.zhihu.com/p/700363736) 将会pool內数据拷贝一份, 避免GC将其清空,即使没有引用的内容,也可以保留最多两轮GC. 

  还有 ring buffer 概念





### 3.4 package context

#### channel

* Unbuffered channels

ch := make(chan struct{})
这里发送消息的时候,如果另一边一一直没有取到数据的时候,发送消息的那一方会一直阻塞.反之亦然
 
> 无缓冲的通道本质是保持同步

* Receice 先于 Send 发生 
* 好处, 100%会收到
* 代价 延迟效果未知

#### Buffered channel

有容量的channel

* Send 先于 Receive 发生.
* 好处延迟更小
* 代价: 不保证到达, 越大的buffer ,越小的保障代价,buffer = 1时,给你一个延迟信息的保障


Latencies due to under-sized buffer


#### GO Concurrency Patterns

* Timing out  eg. ctx的超时取消
* Moving on。 eg, 多个查询, 只要最快的
  ```go
    func Query(conns []Conn,query string)Result{
      ch := make(chan Result)
      for _,conn :=range conns{
        go func(c Conn){
          select {
            case ch <- c.DoQuery(query):
            default:
          }
        }(conn)
      }
      return <-ch
    }
  ```
* Pipeline
* Fan-out, Fan-in
* Cancellation
  * Close 一定要先于Receive发生(类似于Buffered)
  * 不需要传递数据, 或者传递 nil
  * 非常适合取消和超时控制

* Context
......


#### 原则
  最最重要
  > Close 一定要先于Receive发生(类似于Buffered)
  
  对于吞吐量 buffer 的大小并不完全正相关,只要阻塞了这里就会降低吞吐
   
  这里的本质是内存换时间

  如果buffer 满的情况,看看是否可以视情况 要不要丢弃消息


#### Context
go 1.7引入

请求级别的上下文 用户信息 trace-id等 
可以做取消,超时控制

* 这里主要针对 goroutine 进行生命周期的管控 通过context 的树形分发


两种使用方式 

1. 直接挂到传参的第一个 Foo(ctx context.Context)
2. 使用option 选项 net/http 中 Request.WithContext(ctx context.Context)



一些特性
 这里ctx 一般是放到某个请求或者调用链当中, 一般不应该出现在结构体中(比如ctx代表每次网络请求, 但是和下面的数据库对象本身无关)



#### 原理


context.WithValue 内部基于valueCtx 出现
```go
type valueCrx struct{
  Context,
  key,val interface{}
}
```

这里是链表形式存储的,每次WithValue都会创建一个新的ctx,读取值也会递归查找

这里为什么没有使用map ?

因为这里是协程 并发的, 可以上下层级隔离的,也在这种场景下,value 应该是immutable的
每次都是新的 context

还有就是
Context Value should inform not control

Replace a Context using WithCannel, WithDeadline WithTimeout WithValue 
这里需要总是用复制然后加新的内容处理 Copy on Write 保障并发隔离,不具备data race


##### 级联取消
 所有 WithCannel 方法会递归 当下的 ctx 的 done信号传播下去

 加上时间就是间接的等同于 Timeout




## Lecture 4 Go的工程化实现


### 4.1 工程项目结构



### 4.2 API 设计

google gRPC 设计框架

[proto3规范](https://protobuf.com.cn/programming-guides/proto3/)

[google protobuf 规范](https://protobuf.dev/reference/php/api-docs/Google/Protobuf/Duration)
```protobuf
syntax = "proto3";

import "google/protobuf/duration.proto";

package config.redis.v1

message redis {
  .......
  google.protobuf.Duration read_timeout = 5;
}


```

git 单独维护一个API 的库, 在原本仓库使用 hook 复制 pb 等IDL文件复制过去


### 4.3 配置管理


* 环境变量
* 静态文件配置
* 动态配置。expval 项目
* 全局配置

两个人
[Dave chenry](https://dave.cheney.net/)
[Rob Pike](https://zhuanlan.zhihu.com/p/701900373)


区分可选和必选的配置

模式 Functional options 设置配置
eg net.http DialOption方法
* 这里还限制了  options 可修改的项  相比 struct 直接管理配置


配置的防御编程 (异常值不允许)
权限和变更跟踪
配置版本和应用对齐
安全的配置变更 逐步部署,回滚更改,自动回滚



### 4.4 模块 & 单元测试


#### 依赖管理
  module repo 模式

 GOPATH 模式   1.6 Vendor 特性 Go Module 包管理 


使用GOPROXY会去连接后查询项目
如果使用本地私有仓库的情况下可以使用 GOPRIVATE 进行配置, 这里相当同步配置了 GONOPROXY(不走GOPROXY代理) 和GONOSUMDB(sum和校验)
同时 GPRPIVATE 也可以识别git ssh key 进行权限校验

需要搭配项目[ goproxy ](https://github.com/goproxy/goproxy) 进行使用
* 用户本地配置 GONOSUMDB=私仓仓库 go env 配置
* goproxy server 配置 exclude 进行排除所代理仓库
* goproxy server 配置 ssh key 并且在仓库添加只读权限
* goproxy server 配置 .gitconfig 把ssh 替换为http方式访问 - 不同部门的不同仓库 http不带有身份信息


#### Unittest

(GOOGLE测试之道)(https://github.com/ztly/tools/blob/master/books/%E3%80%8AGoogle%E8%BD%AF%E4%BB%B6%E6%B5%8B%E8%AF%95%E4%B9%8B%E9%81%93%E3%80%8B.pdf)


go 官方 Subtests + Gomock完成整个测试



## 5 Go架构设计 微服务可用性建设


### 5.1 隔离

#### 服务隔离
 * 动静隔离
   小到 cpu 的 cacheline 的 false_sharing ,数据库, mysql bufferpool. 还有静态资源的缓存加速。还有CDN

  eg.  这里同一个对象, 分两个表, 一个经常不更新的字段一个表(rarely update) 一个经常更新的一个表(frequently update) 


 * 读写分离

 主从 Replicaset CQRS

#### 轻重隔离
 * 核心
 对服务进行资源池等级划分 L0 L1 L2

  这里还得考虑故障域的差异隔离
  多集群使用冗余资源来提升吞吐和容灾能力


 * 快慢 
  主要针对 吞吐量的有快慢概念
  多sink
 
 * 热点
 经常访问的数据就是热点 对访问频次最高的Top k 数据, 并对其访问进行缓存
  * 小表广播 remotecache 提升为localcache app定时更新 运营平台支持广播刷新localcache. atomic.Value
  * 主动预热 bypass监控主动防御

#### 物理隔离
  * 线程
   java 会出现线程池满的情况
   go 这里只会阻塞goroutine 不会影响到线程
   这里需要考虑掉goroutine到规模的控制 ,防止OOM

   有必要需要这里熔断,(基于信号量或者池化技术 设置maxSize 触发 fallback)

  * 进程 集群 机房

  隔离之后 把一些全局的故障可以做成局部的故障

### 5.2 超时

主要是为了快速失败。fail fast
针对内网要求100ms 外网要求1s 一秒钟法则
* 网络环境有不确定性 
* 客户端和服务端不一致的超时策略导致资源浪费
* ”默认值“策略
* 高延迟服务 导致client 浪费资源等待, 使用超时传递.进程间传递+跨进程传递

超时控制是微服务可用性的第一道关,良好的超时策略,可以尽可能让服务不堆积请求,尽快清空高延迟的请求,释放goroutine



超时分为
 1. 连接超时
 2. 写超时
 3. 读超时


跨进程的超时传递
服务的提供者要定义好latency SLO 更新到 grpc proto 定义中,后续服务迭代, 都保证SLO


### 5.3 过载保护和限流


### 5.4 降级&重试


### 5.5 重试和负载均衡


## 6 评论系统架构设计


### 6.1 功能和架构设计

### 6.1 存储和可用性设计

