---
title: '隔离沙箱技术调研'
description: 'AI agent大环境的下的沙箱隔离技术'
pubDate: '2026-05-20'
---



##  主流沙箱虚拟机技术

* KVM 系统级别虚拟机 裸金属服务器虚拟出来的服务器

 
* LXC ：Linux Containers  最早容器实现，基于 namespace + cgroup


* runC OCI 官方标准容器运行时 现在 Docker、containerd 底层都是 runC

*  gVisor (Google)  不是虚拟机，也不是普通容器 自研用户态内核 Sentry
>  关系：runC 的安全替代品，替换容器 runtime

* Kata Containers 理念：把容器跑在轻量虚拟机里 对外依然是容器接口，对内是一台小 VM
>  早期用 QEMU，现在主流底层集成 Firecracker 每个 Kata 容器 = 独立虚拟机 + 独立内核
适配 K8s 生态，无缝替换 runC
关系：
Kata = 容器接口 + Firecracker/QEMU 虚拟机



* Firecracker (AWS) 纯微型虚拟机  不兼容传统容器生态，偏向FaaS、沙箱、AI 环境
E2B、AWS Lambda 核心底层
> 关系：
可被 Kata 当做虚拟机后端
独立自成一派：MicroVM 赛道
和容器体系平级，不是容器


```text
传统容器体系
├─ 底层技术：LXC
├─ 标准运行时：runC（默认）
├─ 安全增强替换：gVisor(runsc)
└─ VM级容器：Kata Containers
   ├─ 虚拟机后端1：QEMU
   └─ 虚拟机后端2：Firecracker

独立赛道
└─ Firecracker 原生MicroVM（Lambda/E2B专用）
```


### 运行时名词解释

````md
# 彻底讲懂：**运行时 Runtime**
先给**通俗大白话定义**
**运行时 = 专门负责「拉起、启动、管理隔离环境」的底层执行引擎**
你写好镜像/程序，**谁来把它跑起来、管生命周期、做资源隔离**，这个执行者就叫 **Runtime**。

---

# 一、先分两大场景：计算机通用 Runtime + 容器虚拟化 Runtime
## 1. 广义编程语言运行时（日常最常见）
- Java 运行时 JRE
- Python 运行时
- Node.js 运行时
含义：**给程序提供执行环境、库、内存管理、系统调用**
程序不能裸跑，必须靠 Runtime 托着跑。

## 2. 容器/虚拟化领域 Runtime（你现在纠结的重点）
**容器运行时 = 负责创建容器、启动容器、销毁容器、限制资源、做隔离的底层程序**
OCI 标准把它分成两层：
1. **高层运行时（Manager）**
2. **低层运行时（Executor）**

---

# 二、Docker / Containerd / runC 三层架构（必懂）
## 层级从上到下
```
用户命令 → Docker CLI
    ↓
Docker Daemon（上层服务）
    ↓
containerd **高层容器运行时**
    ↓
runC **低层容器运行时**
```

### 1. containerd 是什么？
**高层运行时（管理层）**
职责：
- 拉取镜像
- 解压镜像
- 存储管理
- 网络管理
- 批量管理容器生命周期
- 对外提供统一接口

**它不真正执行容器，只做调度管理**

### 2. runC 是什么？
**低层运行时（真正执行者）**
**OCI 标准默认底层执行引擎**
职责：
- 调用 Linux 内核 `Namespace` 做隔离
- 调用 `Cgroup` 限制 CPU/内存
- 创建真正独立的进程空间
- 启动容器内第一个进程

**一句话：containerd 是老板，runC 是干活的工人**

> 所以你听到：
> **Docker 底层运行时用 containerd，最终执行用 runC**

---

# 三、核心概念：容器运行时 可以替换
这是你最疑惑的点：
**高层不变，底层干活的 Runtime 可以随便换**

标准容器栈默认：
`containerd → runC`

## 替换1：把底层 runC 换成 gVisor(runsc)
变成：
`containerd → gVisor`
效果：
不再用原生内核隔离，改用**用户态内核沙箱**，安全性大幅提升。

## 替换2：换成 Kata Containers
`containerd → Kata Runtime`
Kata 内部再去调用 **Firecracker / QEMU**
此时：
容器不再是共享内核，**直接拉起一台轻量虚拟机**

## 替换3：直接用 Firecracker 当独立 Runtime
不走 containerd、不走 runC
**Firecracker 自己就是一套完整 MicroVM 运行时**
- 自己创建微型虚拟机
- 自己管理内核
- 自己做隔离
- 自己管控生命周期

这就是 E2B、AWS Lambda 的做法：
**直接用 Firecracker 作为沙箱运行时**

---

# 四、一句话区分四种运行时定位
1. **runC 运行时**
原生 Linux 容器运行时，共享内核，最快最轻，普通业务首选

2. **gVisor 运行时**
安全增强容器运行时，拦截系统调用，防逃逸，代码沙箱常用

3. **Kata 运行时**
容器接口 + VM 运行时，对外像容器，对内是虚拟机

4. **Firecracker 运行时**
纯微型虚拟机运行时，**不属于容器体系**，极致冷启动、强隔离，Serverless/AI沙箱专用

---

# 五、用最生活化比喻彻底吃透
## 场景：开一间独立房间（隔离环境）
- **宿主机内核 = 整栋大楼**
- **runC**：在大楼里**隔出小单间**，共用大楼水电电梯（共享内核）
  快、便宜、隔离一般

- **gVisor**：单间外面再加一层**隔音防盗门**，进出全部审查
  速度接近单间，安全强很多

- **Kata**：直接在大楼里**搭一个独立小木屋**
  有自己门窗，不共用主体结构（独立内核）

- **Firecracker**：**极简迷你独立小屋**
  砍掉一切多余装饰，只留睡觉基础功能，搭建速度超快，占用极小

## 对应运行时含义
**选哪种运行时 = 决定你用哪种方式搭建隔离环境**

---

# 六、回答你原话里的疑问
### 1. “Docker运行时可以用containerd或者runC”
- containerd：**上层管理运行时**
- runC：**底层执行运行时**
二者是上下级，不是二选一

### 2. “运行时设置为Firecracker”
意思：
**不再走传统容器runC链路，直接把执行引擎换成微型虚拟机Firecracker**
所有隔离环境由 Firecracker 全权创建管理。

### 3. 为什么E2B不用runC/gVisor？
因为它直接把 **Firecracker 当成唯一沙箱运行时**
追求：毫秒启动 + 独立内核最高隔离。

---

# 七、极简总结（背诵版）
1. **运行时 Runtime = 启动并管理隔离环境的底层执行引擎**
2. 容器生态标准分层：高层containerd，低层默认runC
3. 底层运行时可热替换：runC / gVisor / Kata / Firecracker
4. runC=普通容器，gVisor=安全容器，Kata=容器式虚拟机，Firecracker=原生轻量虚拟机运行时
5. 越偏向虚拟机运行时，隔离越强，启动方式越特殊

---

# 八、实战场景对应选什么运行时
- 线上业务容器：**runC**
- 执行用户不安全代码：**gVisor**
- K8s多租户强隔离：**Kata**
- AI Agent沙箱/Serverless：**Firecracker**
````