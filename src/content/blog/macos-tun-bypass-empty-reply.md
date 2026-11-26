---
title: 'TCP 通了 HTTP 却 Empty reply：macOS 上 Clash 系 TUN 怎么把请求吃掉，以及怎么绕过去'
description: '评测一台公网 HTTP 推理服务时，端口能连、curl 却 Empty reply。根因是本机 TUN 把公网网段劫持进 Fake-IP。记录判断链、route/curl/openssl 命令，以及 --interface 直连绕过的做法。'
pubDate: '2026-11-24'
tags:
  - macOS
  - TUN
  - Debug
---

排查远程 HTTP 服务时，有一类现象特别容易误判：**TCP 端口是开的，curl 却报 Empty reply from server；改 HTTPS 又变成 SSL syscall / unexpected EOF。** 第一反应往往是「对端服务挂了」或「nginx 没配好」。

这次实际根因在本机：Clash 系客户端开了 **TUN 模式**，把目标公网地址劫持进虚拟网卡。应用看见的「连接成功」，只是代理在本机 accept，并没有把 HTTP 完整转到真实机器。

下面用一套脱敏后的现场，把判断链和常用命令拆开。具体 IP、产品名、密钥和业务路径都换成占位符。

## 1. 现场长什么样

假设要访问一台公网 OpenAI 兼容接口，明文 HTTP，端口 `8080`：

```text
http://203.0.113.10:8080/v1/...
```

`203.0.113.10` 是 RFC 5737 文档地址，用来代替真实公网 IP。

当时看到的组合是：

| 探测 | 结果 | 容易得出的错误结论 |
| --- | --- | --- |
| `nc -vz host 8080` | Connection succeeded | 端口开着，服务还在 |
| `curl http://host:8080/...` | Empty reply from server（curl 52） | HTTP 进程崩了 / 对端直接掐连接 |
| `curl https://host:8080/...` | SSL_ERROR_SYSCALL，对端没有证书 | TLS 配错了 |
| `ssh host` | 超时 | 机器也不让进 |
| 环境变量 `HTTP_PROXY` | 空 | 「我没用代理」 |

对应打印（IP、本机地址、进程名已替换）：

```text
$ nc -vz -w 3 203.0.113.10 8080
Connection to 203.0.113.10 port 8080 [tcp/http-alt] succeeded!

$ nc -vz -w 3 203.0.113.10 22
Connection to 203.0.113.10 port 22 [tcp/ssh] succeeded!
# 注意：TUN 劫持时 22 也可能显示 succeeded，ssh 随后仍会卡住或被空关
```

```text
$ curl -sv --max-time 8 -o /dev/null \
    -w '\nhttp_code=%{http_code} err=%{errormsg} size=%{size_download} time=%{time_total}\n' \
    http://203.0.113.10:8080/v1/models
*   Trying 203.0.113.10:8080...
* Connected to 203.0.113.10 (203.0.113.10) port 8080
> GET /v1/models HTTP/1.1
> Host: 203.0.113.10:8080
> User-Agent: curl/8.7.1
> Accept: */*
>
* Request completely sent off
* Empty reply from server
* Closing connection

http_code=000 err=Empty reply from server size=0 time=3.315593
# curl 退出码 52
```

```text
$ curl -svk --max-time 8 -o /dev/null \
    -w '\nhttp_code=%{http_code} err=%{errormsg} size=%{size_download}\n' \
    https://203.0.113.10:8080/v1/models
*   Trying 203.0.113.10:8080...
* Connected to 203.0.113.10 (203.0.113.10) port 8080
* ALPN: curl offers h2,http/1.1
* (304) (OUT), TLS handshake, Client hello (1):
} [296 bytes data]
* LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to 203.0.113.10:8080
* Closing connection

http_code=000 err=LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to 203.0.113.10:8080  size=0
# curl 退出码 35
```

```text
$ env | rg -i 'proxy'
# 无输出
```

三条都成立时，更该先怀疑 **本机透明代理**，而不是远端。

## 2. TUN 和 HTTP 代理不是一回事

常见代理有两层，很多人只记得第一层。

**应用层代理**靠环境变量或软件自己的配置：

```bash
env | rg -i 'proxy'
```

`HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` 为空，只能说明 curl、Go 默认 `ProxyFromEnvironment` 不会走 HTTP 代理。**说明不了流量是直连。**

**TUN 模式**在更下面：客户端创建一张虚拟网卡（macOS 上常见 `utunN`），再改路由表，把整段公网 CIDR 指向这张网卡。之后：

1. 浏览器、curl、评测脚本都以为自己在连 `203.0.113.10`
2. 内核按路由把包送进 `utun`
3. 代理进程在本机把 TCP accept 掉
4. 再按规则决定 DIRECT、代理节点、还是丢弃

所以 `nc` 会显示成功：它连上的是 **本机 TUN 守护进程**，不是远端 nginx。

Clash / Surge / sing-box 一类客户端的 Fake-IP 网段几乎是固定招牌：

```text
198.18.0.0/16
网关常见 198.18.0.1
```

看到路由下一跳是这个地址，就可以把「远端挂了」降级成假说。

## 3. 先看路由，不要先重启远端

macOS：

```bash
route -n get 203.0.113.10
ifconfig utun4
scutil --nwi
```

`scutil --nwi` 只说明 Wi-Fi 是通的，看不出 TUN：

```text
$ scutil --nwi
Network information

IPv4 network interface information
     en0 : flags      : 0x5 (IPv4,DNS)
           address    : 192.0.2.80
           reach      : 0x00000002 (Reachable)

   REACH : flags 0x00000002 (Reachable)

Network interfaces: en0 utun5
```

这里的 `192.0.2.80` 是文档用私网/测试地址，代替真实局域网 IP。注意它列出了 `en0`，**没有把 `utun4` 写成默认 IPv4 出口**，所以不能靠这一条排除劫持。

`route -n get` 才会露馅：

```text
$ route -n get 203.0.113.10
   route to: 203.0.113.10
destination: 32.0.0.0
       mask: 224.0.0.0
    gateway: 198.18.0.1
  interface: utun4
      flags: <UP,GATEWAY,DONE,STATIC,PRCLONING>
 recvpipe  sendpipe  ssthresh  rtt,msec    rttvar  hopcount      mtu     expire
       0         0         0         0         0         0      9000         0
```

要点：

- `interface: utun4`：流量没走 `en0` / `en1` 这类物理网卡
- `gateway: 198.18.0.1`：Fake-IP 网关
- `destination: 32.0.0.0` + `mask: 224.0.0.0` 是 `32.0.0.0/3`，覆盖很大一块公网地址。不少云厂商的弹性 IP 正好落在这段里

再确认谁占着这张网卡：

```bash
ifconfig utun4
ps aux | rg -i 'clash|surge|sing-box|tun'
```

`utun4` 和进程：

```text
$ ifconfig utun4
utun4: flags=8051<UP,POINTOPOINT,RUNNING,MULTICAST> mtu 9000
	inet 198.18.0.1 --> 198.18.0.1 netmask 0xfffffffc

$ ps aux | rg -i 'clash|surge|sing-box|tun'
root   754  ... /Applications/ExampleClash.app/Contents/MacOS/ExampleClashCore /tmp/ExampleClashSocket_xxxx.sock
user   726  ... /Applications/ExampleClash.app/Contents/MacOS/ExampleClash
```

`ps` 能对上某个 Clash 系 GUI 时，故事就闭环了：不是脚本写错 URL 这么简单，是 **整机默认路由被改写了**。

`traceroute` 在这条路径上经常全程无下一跳，不要拿它当「公网黑洞」的证据：

```text
$ traceroute -n -m 8 -w 2 203.0.113.10
traceroute to 203.0.113.10 (203.0.113.10), 8 hops max, 40 byte packets
 1  * * *
 2  * * *
 3  * * *
 4  * * *
 5  * * *
 6  * * *
 7  * * *
 8  * * *
```

## 4. 用 curl 分清「协议错了」和「隧道空关了」

verbose 一定要开，看的是握手有没有字节，不是看 http_code 是不是 200。

```bash
# 明文 HTTP（这类推理网关常见）
curl -sv --max-time 8 http://203.0.113.10:8080/v1/models

# 误用 HTTPS 打明文端口
curl -svk --max-time 8 https://203.0.113.10:8080/v1/models

# TLS 探针
echo | openssl s_client -connect 203.0.113.10:8080 -servername 203.0.113.10
```

走默认路由（即 TUN）时，openssl 读不到对端证书，握手读写不对称：

```text
$ echo | openssl s_client -connect 203.0.113.10:8080 -servername 203.0.113.10
Connecting to 203.0.113.10
C060B20A02000000:error:0A000126:SSL routines::unexpected eof while reading:ssl/record/rec_layer_s3.c:702:
CONNECTED(00000005)
---
no peer certificate available
---
No client certificate CA names sent
Negotiated TLS1.3 group NID: 0
---
SSL handshake has read 0 bytes and written 1582 bytes
Verification: OK
---
New, (NONE), Cipher is (NONE)
Protocol: TLSv1.3
This TLS version forbids renegotiation.
Compression: NONE
Expansion: NONE
No ALPN negotiated
Early data was not sent
Verify return code: 0 (ok)
---
```

`CONNECTED` 加上 `read 0 bytes and written 1582 bytes`：本机把 ClientHello 写出去了，对端（其实是 TUN）没有返回任何 TLS 记录。

对照：

| 现象 | 含义 |
| --- | --- |
| `Connected to ... port 8080` 然后立刻 `Empty reply` | TCP 被某端 accept 后空关，常见于 TUN/代理没把请求转到真实 HTTP |
| `http_code=000`、`size_download=0` | 应用层没有响应体，不是 4xx/5xx |
| HTTPS：`SSL handshake has read 0 bytes` | 对端根本不是 TLS |
| HTTPS 直连物理网卡后：`tlsv1 alert protocol version` | 8080 上是 HTTP 服务器，它拒绝了 ClientHello |

第三、第四条经常叠在一起。TUN 路径上你会同时看到 empty reply 和 TLS syscall；绕开 TUN 之后，HTTP 可能立刻通，HTTPS 仍然失败。**后者是协议选错，前者才是代理问题。**

`nc` 只能证明「有人在听 8080」，证明不了那个人是 nginx。

```bash
nc -vz -w 3 203.0.113.10 8080
```

## 5. 怎么绕过去

目标只有一句：让探测包走物理网卡，或者让代理把这个 IP 标成直连。

### 5.1 单次命令绕过（最快验证）

```bash
curl -sv --interface en0 --max-time 10 http://203.0.113.10:8080/v1/models
```

`--interface en0` 把 socket bind 到 Wi-Fi/有线网卡。同一条 URL，大约 0.1s 就能打到真实 nginx：

```text
$ curl -sv --interface en0 --max-time 10 -o /dev/null \
    -w '\nhttp_code=%{http_code} err=%{errormsg} time=%{time_total}\n' \
    http://203.0.113.10:8080/v1/models
*   Trying 203.0.113.10:8080...
* socket successfully bound to interface 'en0'
* Connected to 203.0.113.10 (203.0.113.10) port 8080
> GET /v1/models HTTP/1.1
> Host: 203.0.113.10:8080
> User-Agent: curl/8.7.1
> Accept: */*
>
* Request completely sent off
< HTTP/1.1 404 Not Found
< Server: nginx/1.18.0 (Ubuntu)
< Date: Tue, 24 Nov 2026 11:11:19 GMT
< Content-Type: text/html
< Content-Length: 162
< Connection: keep-alive
<
{ [162 bytes data]
* Connection #0 to host 203.0.113.10 left intact

http_code=404 err= time=0.109465
# curl 退出码 0
```

同一端口强制 HTTPS，绕过 TUN 之后错误会从 syscall 变成「对端用 TLS 告警拒绝」——说明对面是 HTTP 服务器，不是隧道空关：

```text
$ curl -svk --interface en0 --max-time 10 -o /dev/null \
    -w '\nhttp_code=%{http_code} err=%{errormsg}\n' \
    https://203.0.113.10:8080/v1/models
*   Trying 203.0.113.10:8080...
* socket successfully bound to interface 'en0'
* Connected to 203.0.113.10 (203.0.113.10) port 8080
* ALPN: curl offers h2,http/1.1
* (304) (OUT), TLS handshake, Client hello (1):
} [296 bytes data]
* LibreSSL/3.3.6: error:1404B42E:SSL routines:ST_CONNECT:tlsv1 alert protocol version
* Closing connection

http_code=000 err=LibreSSL/3.3.6: error:1404B42E:SSL routines:ST_CONNECT:tlsv1 alert protocol version
# curl 退出码 35
```

这里 **404 反而是好消息**：请求已经打到真实 nginx，只是路径没配 `/v1/models`。网络层已经通了。把路径改成该机真实的 OpenAI 兼容前缀（多半是 `http://host:8080/v1`）再测业务。

有线网卡可能是 `en1`，先看：

```bash
scutil --nwi
```

`IPv4 network interface information` 里带地址的那块，才是当前出口。

### 5.2 让代理永久放过这个地址

在 Clash 系规则里给主机加 **DIRECT**，或评测时关掉 TUN，只保留系统代理。规则形状类似：

```yaml
rules:
  - IP-CIDR,203.0.113.10/32,DIRECT
  - DOMAIN,inference.example.test,DIRECT
```

改完再看路由：`route -n get` 的 `interface` 应该变回 `en0`，网关变成家里或公司的下一跳，而不是 `198.18.0.1`。

### 5.3 程序里绑定网卡

Go 评测脚本如果必须在开着 TUN 的电脑上跑，可以给 `http.Transport` 指定 `LocalAddr` / 自定义 `Dialer`，效果等同 `--interface`。这是权宜之计。长期还是应让「内网/指定公网 IP」走 DIRECT，避免每个工具都特殊绑定。

## 6. 一张最短检查清单

按这个顺序，五分钟内能分开三类故障：代理、协议、路径。

```bash
# 1. 是不是被 TUN 劫持
route -n get 203.0.113.10

# 2. 有没有 Clash / Surge / sing-box
ps aux | rg -i 'clash|surge|sing-box'

# 3. 默认路径：可能打到代理
curl -sv --max-time 8 http://203.0.113.10:8080/v1/models

# 4. 绕过 TUN
curl -sv --interface en0 --max-time 8 http://203.0.113.10:8080/v1/models

# 5. 不要用 https 打明文 8080
curl -svk --interface en0 --max-time 8 https://203.0.113.10:8080/v1/models
```

判定：

1. 步骤 1 出现 `198.18.0.1` / `utun*` → 先处理本机代理
2. 步骤 3 empty reply、步骤 4 出现 `Server: nginx` → 服务是活的，之前是隧道空关
3. 步骤 4 是 404/401、步骤 5 TLS 报错 → 用 `http://`，再核对路径和 API Key
4. 步骤 4 仍然超时 / RST → 这时才去查安全组、对端进程、本机防火墙

## 7. 为什么「TCP 通」会骗人

TCP 三次握手只保证：**当前这条五元组上，有进程完成了 accept。** 它不保证：

- accept 的进程是你以为的 nginx
- accept 之后会读 HTTP 请求
- 读完会转发到真实 origin
- origin 说的是 HTTP 还是 TLS

TUN 把「本机代理的 listen」伪装成「远端 8080 的 listen」。`nc` 和 curl 的 `Connected to` 都发生在伪装之后，所以日志看起来一切正常，直到等响应体时连接被空着关掉。

Empty reply 的精确含义是：对端在 HTTP 响应到来之前关闭了套接字。代理规则 miss、节点失败、把 HTTP 当 TLS 拆、或者 Fake-IP 映射丢失，都会变成这一种。它不是 nginx 的 502。

## 8. 流程上值得留下的习惯

这次如果只记录「TCP 开着、HTTP 空响应，远端不可达」，后续评测会换一条完全不同的链路，对比实验也废了。更稳的记录方式是：

- 贴 `route -n get` 的 interface / gateway，不贴真实 IP 也可以先定性
- 同时保留「默认 curl」和「`--interface en0` curl」两份 verbose
- 写清用的是 `http` 还是 `https`，以及实际 path
- 404/401 当作「已经打到 HTTP 服务器」，不要和 empty reply 混写成同一种失败

一句话：**环境变量里没有代理，不代表没有代理。先看 `utun` 和 `198.18.0.1`，再用 `--interface` 证明远端还活着。**
