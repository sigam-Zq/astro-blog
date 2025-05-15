---
title: zqTest
author: qiang Zheng
pubDate: 2024-05-20T15:33:05.569Z
# slug: how-to-update-dependencies
featured: false
draft: false
heroImage: /blog-placeholder-1.jpg
tags:
  - FAQ
description: How to update project dependencies and AstroPaper template.
---

# K8S

资源管理器--相同的 MESOS-Apache  还有 Docker Swarm
做容器管理的 ，给容器实例提供了，热部署，自动排错等一栏筐的内容和功能
前身 是google 的 Borg

## 基本构成



* Master Node （一个对映多个Worker node）
  * API server -> etcd
    给外部提供功能
  * scheduler->API server
    节点调度，选择node节点应用部署
  * controller-manager ->API server
    处理集群中常规的后台任务，一个资源对应一个控制器
* Worker Node（多个）
  * kubeelet
    master派到node节点代表，管理本机容器（例如生命周期的管理）
    直接跟容器引擎交互，实现容器引擎的生命周期管理
  * kube-proxy
    提供网络代理，负载均衡等操作 -通过操作fire-way
    负责写入规则到 IPTABLES IPVS实现服务映射访问
  * 管理的容器 Docker=>Pod


IPVS-负载均衡


基本概念

* Pod - 进行管理的最小的一个单位
* 控制器的类型
* K8S的网络通讯



资源清单 什么是Pod 掌握资源清单的语法 编写Pod

需要构建一个K8S 集群

服务发现 掌握SVC原理和构建方式
	服务的分类
		无状态服务	DBMS
		有状态服务	LVS APACHE

存储 多种存储类型的特点 -能够在不同环境中选择合适的存储方案

调度器  掌握调度器的原理 能够根据要求把Pod定义到想要的节点运行



HELM  :类似与liunx的yum  原理和自定义模板

高可用集群副本最好是大于3的奇数个

* 一些插件

  coreDNS 为集群中的SVC创建一个域名IP对应关系
  Dashboard 给K8s提供一个B/S 访问的
  Ingress controller 官方只能实现四成代理，这里可以实现七层代理
  Fedetation 提供一个跨集群中心多K8S统一管理的功能
  Prometheus K8S的集群监控
  ELK 日志统一分析接入平台

Pod 

* 自主式的Pod
* 控制器管理的Pod