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