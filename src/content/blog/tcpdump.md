---
title: 'tcpdump简单说明'
description: 'tcpdump简单说明'
tags:
  - Liunx
pubDate: '2026-07-16'
---

如果你是 Go 后端开发，建议把 **tcpdump + Wireshark + SSLKEYLOGFILE** 这一套掌握，这是线上排查网络问题最常用的组合。

---

# 一、tcpdump 基本知识

## 1. tcpdump 是什么

tcpdump 是 Linux 下最常见的抓包工具。

它工作在网卡层（libpcap），能够抓取经过网卡的所有数据包。

常见用途：

* 分析 HTTP 请求
* 分析 TCP 建连失败
* 查看 DNS 请求
* 查看 TLS 握手
* 排查网络超时
* 导出 pcap 给 Wireshark

---

# 二、查看网卡

先查看有哪些网卡

```bash
ip addr
```

或者

```bash
ifconfig
```

例如

```
eth0
ens33
lo
docker0
```

---

# 三、最常用命令

## 抓所有包

```bash
sudo tcpdump -i any
```

或者

```bash
sudo tcpdump -i eth0
```

---

## 不解析域名

线上建议都加

```bash
sudo tcpdump -nn -i eth0
```

否则 tcpdump 会一直解析 DNS。

例如

```
192.168.1.10.443 > 192.168.1.2.52134
```

而不是

```
google.com.https
```

---

## 显示详细信息

```bash
sudo tcpdump -nn -vvv -i eth0
```

---

## 查看包内容（ASCII）

```bash
sudo tcpdump -A
```

例如 HTTP

```
GET /api HTTP/1.1
Host: xxx.com
```

---

## 十六进制

```bash
sudo tcpdump -X
```

输出：

```
0000 45 00 ...
```

---

## ASCII+HEX

```bash
sudo tcpdump -XX
```

---

# 四、保存抓包

最重要的是：

```bash
sudo tcpdump -i eth0 -w test.pcap
```

以后可以：

```
Wireshark
```

打开。

---

# 五、读取 pcap

不用重新抓包：

```bash
tcpdump -r test.pcap
```

---

# 六、限制抓包数量

抓100个包：

```bash
tcpdump -c 100
```

---

# 七、限制抓包大小

抓前 100 字节：

```bash
tcpdump -s 100
```

抓完整：

```bash
tcpdump -s 0
```

线上一般：

```bash
-s 0
```

---

# 八、过滤条件（最重要）

## 指定 IP

```bash
host 192.168.1.100
```

---

## 来源 IP

```bash
src host 192.168.1.100
```

---

## 目标 IP

```bash
dst host 192.168.1.100
```

---

## 指定端口

```bash
port 80
```

---

## TCP

```bash
tcp
```

---

## UDP

```bash
udp
```

---

## ICMP

```bash
icmp
```

---

## 多条件

例如：

```bash
tcp port 443
```

或者

```bash
host 10.0.0.1 and port 443
```

例如：

```bash
host 10.0.0.1 and tcp
```

例如：

```bash
(src host 10.0.0.1) and (dst port 443)
```

---

## 排除

```bash
not port 22
```

---

## OR

```bash
port 80 or port 443
```

---

## AND

```bash
host 10.1.1.1 and port 443
```

---

# 九、线上最常见抓法

抓 HTTPS

```bash
tcpdump -i eth0 -nn -s0 port 443 -w https.pcap
```

抓某服务

```bash
tcpdump -i eth0 host 10.1.2.3 -w server.pcap
```

抓 Docker

```bash
tcpdump -i docker0
```

抓 localhost

```bash
tcpdump -i lo
```

抓 Kubernetes Pod（进入 Pod 所在节点）

```bash
tcpdump -i any host <Pod_IP>
```

---

# 十、怎么看 TCP 是否正常

看三次握手：

```
SYN

SYN ACK

ACK
```

例如：

```
S
S.
.
```

tcpdump 会显示 Flags：

```
Flags [S]
```

```
Flags [S.]
```

```
Flags [.]
```

如果一直：

```
S
S
S
S
```

说明：

服务器没回应。

---

# 十一、怎么看 HTTP

HTTP 可以直接：

```bash
tcpdump -A port 80
```

即可看到：

```
GET

POST

HTTP/1.1
```

---

# 十二、HTTPS 为什么看不到内容？

因为 TLS 已经加密。

tcpdump 能看到：

```
TCP Header

TLS Header

Cipher Text
```

例如：

```
Application Data
```

里面全部都是密文。

你只能看到：

```
TLS Handshake

TLS Version

Cipher Suite

Certificate
```

而看不到：

```
HTTP Body

JSON

POST 参数
```

---

# 十三、HTTPS 如何查看解密后的内容？

主要有以下几种方式。

## 方法一：SSLKEYLOGFILE（推荐，最简单）

适用于你**控制客户端**（浏览器、curl、部分程序）的情况。

### 步骤 1：让客户端导出 TLS 会话密钥

例如浏览器：

```bash
export SSLKEYLOGFILE=/tmp/sslkeys.log
google-chrome
```

或（macOS）：

```bash
export SSLKEYLOGFILE=~/sslkeys.log
open -a "Google Chrome"
```

之后浏览器建立的新 TLS 连接会把会话密钥写入该文件（Chrome、Firefox 等都支持）。

---

### 步骤 2：抓包

```bash
tcpdump -i any -s0 -w https.pcap port 443
```

---

### 步骤 3：Wireshark 导入密钥

依次进入：

```
Edit
    Preferences
        Protocols
            TLS
                (Pre)-Master-Secret log filename
```

选择：

```
sslkeys.log
```

随后重新打开 `https.pcap`，Wireshark 就能自动解密对应的 HTTPS 流量，直接查看 HTTP 请求、响应、JSON、Header 等内容。

> 注意：只有使用该密钥建立的连接才能解密，之前已经建立的连接无法事后恢复。

---

## 方法二：服务器私钥（仅适用于旧 RSA 握手）

以前可以：

```
Server Private Key
```

直接解密。

现在基本已经失效。

因为现在几乎都是：

```
TLS1.3

ECDHE
```

采用前向保密（Perfect Forward Secrecy）。

即使拿到服务器私钥：

```
RSA Private Key
```

也无法解密历史数据。

---

## 方法三：MITM 代理（开发调试最常用）

例如：

* mitmproxy
* Fiddler
* Charles
* Burp Suite

流程：

```
浏览器
    ↓
代理（解密）
    ↓
目标服务器
```

代理与客户端、服务器分别建立 TLS，因此能够查看明文 HTTP 内容。

适合：

* APP 调试
* Web 调试
* 接口抓包
* 修改请求

---

## 方法四：在应用层记录

如果你维护的是自己的 Go 服务，很多时候最简单可靠的方法是在应用层记录请求：

```go
body, _ := io.ReadAll(r.Body)
log.Println(string(body))
```

或者使用 Gin 中间件记录请求与响应。

这种方式无需处理 TLS，也能获得完整的业务数据。

---

## 方法五：使用 eBPF / 内核追踪

如果无法修改客户端，又需要观察 TLS 解密后的数据，可使用：

* eBPF（如 bpftrace、BCC 工具集）
* OpenSSL/Go TLS 的动态探针（如 uprobe）

它们可以在应用完成 TLS 解密之后、数据交给应用之前获取明文，适合高级排障和性能分析，但配置和使用难度较高。

---

# 十四、实际排查 HTTPS 的推荐流程

日常开发和线上排障时，一般按以下顺序：

1. 用 `tcpdump` 抓取完整流量：

   ```bash
   tcpdump -i any -nn -s0 -w capture.pcap port 443
   ```
2. 使用 Wireshark 查看 TLS 握手、SNI、证书、TCP 重传、RTT 等网络层问题。
3. 如果需要查看 HTTP 明文：

   * 能控制客户端：使用 **SSLKEYLOGFILE**（最佳方案）。
   * 开发调试：使用 **mitmproxy / Charles / Fiddler** 等代理。
   * 自己维护服务：直接在应用层记录请求或响应。
4. 对生产环境且无法修改客户端的复杂问题，再考虑 eBPF 等高级追踪手段。

对于现代的 **TLS 1.3 + ECDHE**，**SSLKEYLOGFILE 是查看 HTTPS 明文最常用、最实用的方法**；仅凭 `tcpdump` 抓到的 `.pcap` 文件本身，无法直接恢复出加密后的 HTTP 内容。
