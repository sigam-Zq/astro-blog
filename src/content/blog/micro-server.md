---
title: '微服务学习'
description: '微服务学习'
pubDate: '2026-05-20'
---





## Lecture 1 概览

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




## Lecture 2 设计

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


![alt text](micro-server-v1.png)

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



## Lecture 3 gRPC & 服务发现




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











## Lecture 4 多集群 & 多租户


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




## Lecture 5 异常处理 -- Error vs Exception



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



### 对比多语言

* C 数字表示报错码 因为C 不支持多参数返回
* C++ 引入了Exception 概念
* Java 要求抛出和捕捉
* Go 外置 error 处理和 panic 弹出