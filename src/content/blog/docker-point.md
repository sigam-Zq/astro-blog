---
title: 'docker 一些知识点'
description: 'docker 一些知识点'
pubDate: 2026-07-23T19:54:05.569Z
heroImage: '/blog-placehoder-7.jpg'
---



###   关于一次生产事故引起的 docker 相关知识点


* 接口把主机打趴下了, 但是没有相关日志呢

1. liunx 重启时间
```bash
[root@hlw-app ~]# last reboot
reboot   system boot  4.19.90-25.41.v2 Thu Jul 23 18:12   still runningreboot   system boot  4.19.90-25.41.v2 Thu Apr  3 10:24 - 18:11 (476+07:47)
reboot   system boot  4.19.90-25.41.v2 Tue Jul 30 14:25 - 18:11 (723+03:46)reboot   system boot  4.19.90-25.41.v2 Tue Jul 30 13:55 - 18:11 (723+04:16)
reboot   system boot  4.19.90-25.41.v2 Tue Jul 30 13:50 - 18:11 (723+04:21)reboot   system boot  4.19.90-25.41.v2 Tue Jul 30 11:27 - 18:11 (723+06:44)
reboot   system boot  4.19.90-25.41.v2 Tue Jul 30 10:09 - 18:11 (723+08:02)reboot   system boot  4.19.90-25.41.v2 Mon Jul 29 14:20 - 18:11 (724+03:51)
reboot   system boot  4.19.90-25.41.v2 Mon Jul 29 12:37 - 12:41  (00:04)reboot   system boot  4.19.90-24.4.v21 Mon Jul 29 12:09 - 12:37  (00:27)
wtmp begins Mon Jul 29 12:09:26 2024
[root@hlw-app ~]#
```
查看内核日志
```bash

[root@hlw-app shunhuaRoad]# dmesg -T | grep -i err
[Thu Jul 23 18:12:27 2026] ACPI: IRQ0 used by override.
[Thu Jul 23 18:12:27 2026] ACPI: IRQ5 used by override.
[Thu Jul 23 18:12:27 2026] ACPI: IRQ9 used by override.[Thu Jul 23 18:12:27 2026] ACPI: IRQ10 used by override.
[Thu Jul 23 18:12:27 2026] ACPI: IRQ11 used by override.
[Thu Jul 23 18:12:27 2026] ACPI: Using IOAPIC for interrupt routing
[Thu Jul 23 18:12:27 2026] ACPI: PCI Interrupt Link [LNKA] (IRQs 5 *10 11)
[Thu Jul 23 18:12:27 2026] ACPI: PCI Interrupt Link [LNKB] (IRQs 5 *10 11)
[Thu Jul 23 18:12:27 2026] ACPI: PCI Interrupt Link [LNKC] (IRQs 5 10 *11)
[Thu Jul 23 18:12:27 2026] ACPI: PCI Interrupt Link [LNKD] (IRQs 5 10 *11)
[Thu Jul 23 18:12:27 2026] ACPI: PCI Interrupt Link [LNKS] (IRQs *9)
[Thu Jul 23 18:12:27 2026] PCI Interrupt Link [LNKD] enabled at IRQ 11
[Thu Jul 23 18:12:28 2026] PCI Interrupt Link [LNKC] enabled at IRQ 10
[Thu Jul 23 18:12:28 2026] PCI Interrupt Link [LNKA] enabled at IRQ 10
[Thu Jul 23 18:12:29 2026] PCI Interrupt Link [LNKB] enabled at IRQ 11
[Thu Jul 23 18:12:29 2026] RAS: Correctable Errors collector initialized.
[Thu Jul 23 18:30:11 2026] dbMonitor[40738]: segfault at b63000 ip 000000000055f66e sp 00007fadfffee638 error 4 in dbMonitor[401000+1d9000]
[Thu Jul 23 18:37:44 2026] MonitorCTRL[54957]: segfault at 2326000 ip 000000000055f66e sp 00007fcdcd112c68 error 4 in dbMonitor[401000+1d9000]
[Thu Jul 23 18:38:51 2026] dbMonitor[56366]: segfault at ebc000 ip 000000000055f66e sp 00007f35b10545c8 error 4 in dbMonitor[401000+1d9000]
[Thu Jul 23 18:43:27 2026] dbMonitor[62662]: segfault at 19db000 ip 000000000055f66e sp 00007fe08d6535c8 error 4 in dbMonitor[401000+1d9000]
[Thu Jul 23 19:00:26 2026] dbMonitor[84081]: segfault at 1b51000 ip 000000000055f66e sp 00007f5a4f7f8638 error 4 in dbMonitor[401000+1d9000]
[Thu Jul 23 19:28:39 2026] dbMonitor[136874]: segfault at b5b000 ip 000000000055f66e sp 00007f2ded60f5c8 error 4 in dbMonitor[401000+1d9000]
[Thu Jul 23 19:57:03 2026] dbMonitor[172430]: segfault at 1732000 ip 000000000055f66e sp 00007f5e291ee638 error 4 in dbMonitor[401000+1d9000]
[Thu Jul 23 19:57:19 2026] dbMonitor[172635]: segfault at 10df000 ip 000000000055f66e sp 00007ff63565f5c8 error 4 in dbMonitor[401000+1d9000]
[Thu Jul 23 19:57:36 2026] dbMonitor[172977]: segfault at 25b3000 ip 000000000055f66e sp 00007f8f491725c8 error 4 in dbMonitor[401000+1d9000]
[Thu Jul 23 19:57:59 2026] dbMonitor[173477]: segfault at aa3000 ip 000000000055f66e sp 00007f4aa78f75c8 error 4 in dbMonitor[401000+1d9000]
[root@hlw-app shunhuaRoad]# dmesg -T | grep -i oom
[root@hlw-app shunhuaRoad]# dmesg -T | grep -i panic
[root@hlw-app shunhuaRoad]#
```


> 带时间查看内核异常
dmesg -T | grep -E "soft lockup|hard lockup|throttled|temperature|OOM|rcu"

````md

### 命令
```bash
dmesg -T | grep -E "soft lockup|hard lockup|throttled|temperature|OOM|rcu"
```
逐个解释匹配的关键字，以及对应故障现象：

## 1. soft lockup
**软死锁**
内核检测到：某个CPU核心上的内核代码长时间（默认20s）不主动让出CPU、不调度其他任务。
- 进程卡死、系统响应缓慢、ssh延迟大，但机器不一定彻底死机；
- 根源：内核驱动bug、自旋锁长期持有、内核任务阻塞；
> 日志样例：`watchdog: BUG: soft lockup - CPU#0 stuck for 22s!`

## 2. hard lockup
**硬死锁**
比soft lockup更严重。
CPU在**禁止中断**的上下文卡住，连内核看门狗中断都无法响应。
出现后通常直接系统卡死、重启，基本只能重启恢复。

## 3. throttled
CPU **降频限流**
一般和温度绑定：CPU过热，主板/内核强制降低主频保护硬件。
- 现象：CPU占用看着不高，但整机性能暴跌、程序卡顿、延迟飙升；
多见于物理服务器、工控机、笔记本散热不良。

## 4. temperature
CPU/硬件温度告警
常常和 `throttled` 成对出现：温度达到警戒阈值，紧接着触发降频。

## 5. OOM
OOM Killer，内存耗尽
系统物理内存+swap用尽，内核启动OOM杀手，挑选进程杀掉释放内存。
- 现象：业务进程莫名消失、系统瞬间卡顿、大量IO颠簸；
注意：OOM本身**不直接代表CPU高**，但内存紧张经常伴随CPU、IO压力，是常见关联故障。

> 典型日志：`Out of memory: Killed process xxx`

## 6. rcu
RCU（Read-Copy Update），内核经典同步机制
检索这个关键词主要抓：**RCU Stall（RCU阻塞）**
日志：`rcu_sched detected stalls on CPUs/tasks`
含义：RCU等待回收旧数据超时，属于内核调度异常，会造成系统卡顿、调度延迟，常和soft lockup伴随出现。

---

# 快速总结区分
| 关键字 | 问题大类 | 直观表现 |
|--------|--------|--------|
| soft lockup / hard lockup / rcu stall | 内核调度/驱动死锁 | 整机卡顿、ssh很慢甚至失联 |
| temperature + throttled | CPU过热降频 | 性能持续拉胯，负载高但CPU跑不满 |
| OOM | 内存耗尽 | 进程被杀死，系统剧烈抖动 |

# 补充小提示
这条检索只是**初筛**：
- 有输出 → 内核层面存在异常，卡顿根源大概率在内核/硬件；
- 完全无输出 → 绝大多数情况是**应用进程正常抢占CPU**，需要用 `top / pidstat / sar` 去业务层排查。

如果你想要，我可以把这条命令优化成更贴合线上服务器的增强版本。
````

docker 查看某个时间段日志
```bash

[root@hlw-app ~]# docker logs --since "2026-07-23T17:22:00" --until "2026-07-23T17:23:00" shunhuaRoad_service
[root@hlw-app ~]#
```
但是不生效呢


docker 查看资源状态

```bash

docker stats 

CONTAINER ID        NAME                  CPU %               MEM USAGE / LIMIT   MEM %               NET I/O             BLOCK I/O           PIDS
2291ce2de7fd        shunhuaRoad_service   17.53%              375.3MiB / 12GiB    3.05%               153MB / 80MB        0B / 0B             14



[root@hlw-app ~]# docker top shunhuaRoad_serviceUID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                126959              126943              18                  19:20               ?                   00:03:31            ./backend_prod start -c prod
```


#### docker compose 限制容器资源


查看主机cpu资源
```bash
[root@hlw-app ~]# nproc
8
# 这里说明是8核

# 更详细的 

[root@hlw-app ~]# lscpu
Architecture:                    x86_64CPU op-mode(s):                  32-bit, 64-bitByte Order:                      Little EndianAddress sizes:                   40 bits physical, 48 bits virtualCPU(s):                          8
On-line CPU(s) list:             0-7
Thread(s) per core:              2
Core(s) per socket:              4
Socket(s):                       1
NUMA node(s):                    1Vendor ID:                       HygonGenuineCPU family:                      24Model:                           0Model name:                      Hygon Dhyana Processor
Stepping:                        1
CPU MHz:                         2199.996
BogoMIPS:                        4399.99
Hypervisor vendor:               KVM
Virtualization type:             full
L1d cache:                       128 KiB
L1i cache:                       256 KiB
L2 cache:                        2 MiB
L3 cache:                        8 MiB
NUMA node0 CPU(s):               0-7
Vulnerability Itlb multihit:     Not affected
Vulnerability L1tf:              Not affected
Vulnerability Mds:               Not affected
Vulnerability Meltdown:          Not affected
Vulnerability Mmio stale data:   Not affected
Vulnerability Retbleed:          Vulnerable
Vulnerability Spec store bypass: Mitigation; Speculative Store Bypass disabled via prctl and seccomp
Vulnerability Spectre v1:        Mitigation; usercopy/swapgs barriers and __user pointer sanitization
Vulnerability Spectre v2:        Mitigation; Retpolines, IBPB conditional, STIBP disabled, RSB filling, PBRSB-eIBRS Not affected
Vulnerability Srbds:             Not affected
Vulnerability Tsx async abort:   Not affected
Flags:                           fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush mmx fxsr sse sse2 ht syscall nx mmxext fxsr_opt pdpe1gb rdtscp lm rep_good nopl xtopology c
                                 puid extd_apicid tsc_known_freq pni pclmulqdq ssse3 fma cx16 sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c hypervisor lahf_lm cmp_legacy cr8_lega
                                 cy abm sse4a misalignsse 3dnowprefetch osvw topoext perfctr_core cpb ssbd ibpb vmmcall fsgsbase tsc_adjust bmi1 avx2 smep bmi2 adx smap clflushopt sha_ni xsaveopt xsavec x
                                 getbv1 virt_ssbd arat

```


解释
Socket(s):           1      # 1颗物理CPU
Core(s) per socket:  4      # 每颗CPU 4个物理核心
Thread(s) per core:  2      # 开启超线程，每个物理核2个逻辑核
CPU(s):              8      # 总\*\*逻辑CPU：8核\*\*



限制百分之70 就是 5.6核

然后查看主机内存

```
[root@hlw-app ~]# free -h
              total        used        free      shared  buff/cache   available
Mem:           15Gi       1.5Gi        12Gi       145Mi       1.7Gi        13Gi
Swap:            0B          0B          0B
```

这里是15G 限制百分之80 就是 12Gi

docker compose 限制容器资源
```yaml
  service:
    container_name: ${NAME}_service
    image: docker.1ms.run/alpine
    restart: unless-stopped
    volumes:
      - "./service:/service"
      - "/etc/localtime:/etc/localtime:ro"
    command: |
      sh -c "
      cd /service/backend;./backend_prod start -c prod"
    networks:
      - net
    ports:
      - "22001:8041"
    cpus: "5.6"
    mem_limit: 12g

```
之后需要重启docker compose
docker-compose up -d --force-recreate shunhuaRoad_service
```bash

[root@hlw-app shunhuaRoad]# docker-compose up -d --force-recreate service
[+] Running 1/1
 ✔ Container shunhuaRoad_service  Started                       
```

验证生效
```bash
[root@hlw-app shunhuaRoad]# docker inspect shunhuaRoad\_service | grep NanoCpus            
"NanoCpus": 5600000000,
[root@hlw-app shunhuaRoad]# docker stats
71b3fe25f32d        shunhuaRoad_service                 16.01%              369.6MiB / 11GiB      3.28%               37.6MB / 19.5MB     0B / 0B             13
#  这里显示了  369.6MiB / 11GiB 

# 或者

[root@hlw-app shunhuaRoad]# docker inspect shunhuaRoad\_service | grep Memory
            "Memory": 11811160064,
            "KernelMemory": 0,
            "MemoryReservation": 0,
            "MemorySwap": 23622320128,
            "MemorySwappiness": null,
[root@hlw-app shunhuaRoad]#
```
其中
"Memory": 11811160064,          // mem\_limit = 11G
"KernelMemory": 0,              // 未限制内核内存
"MemoryReservation": 0,         // 没有设置内存软限制(mem\_reservation)
"MemorySwap": 23622320128,      // Memory + Swap上限 = 22G
"MemorySwappiness": null,       // 未设置容器swappiness，继承宿主机

1 GB = 1024 * 1024 * 1024 = 1073741824 bytes


- `11811160064 ÷ 1073741824 ≈ 11.00 GB`
- `23622320128 ÷ 1073741824 ≈ 22.00 GB`


docker 中使用
```bash
# 最大内存 512MB，允许 swap 512MB（总可用内存1G）
docker run -d \\
  --memory="512m" \\
  --memory-swap="1g" \\
  nginx
```
> 参数说明：

- `--memory / -m`：**硬性最大内存限制（必须设置）**
单位：`b,k,m,g`
- `--memory-swap`：内存 + 交换分区总上限
  - 不设置：默认 = `2 * --memory`
  - 设置和 `--memory` 相同：**禁用 swap**
  - 设置 `-1`：swap 无限制（不推荐生产）
- `--memory-reservation`：**软限制**，达到后内核尝试回收内存，不强制杀死容器

> 
> ⚠️ 重要：**只有设置 `--memory`，内核才会启用 cgroup 内存限制**

- 最多使用 1.5 个CPU核心算力
docker run -d --cpus="1.5" nginx
- --cpus=1.5 == --cpu-period=100000 --cpu-quota=150000
docker run -d --cpu-period=100000 --cpu-quota=150000 nginx

- `--cpu-period`：调度周期，默认 `100000` 微秒
- `--cpu-quota`：每个周期允许占用的 CPU 时间

- 默认权重1024，多容器竞争CPU时分配比例
docker run -d --cpu-shares=512 nginx