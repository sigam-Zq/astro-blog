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