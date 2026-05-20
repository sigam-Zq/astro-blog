---
title: 'DNS泄漏防护'
description: 'DNS泄漏防护-使用加密dns'
pubDate: 2026-05-15T10:448:05.000Z
---


## 问题描述

NS 泄漏是指设备在访问网络时，本该通过加密代理 / VPN / 隧道转发的DNS 域名解析请求，绕过加密通道，直接向本地运营商、公共 DNS 服务器明文发送，导致上网域名、访问站点被第三方窃取、窥探的网络安全隐患。
总结 就是 DNS 泄漏就是挂了代理 / VPN 还在用本地运营商明文解析域名，上网记录悄悄被暴露、无法隐身。

检测网站 
* https://ipleak.net/   
* https://ipcheck.ing/#/  
* https://browserleaks.com/dns
* https://dnsleaktest.com/results.html
* https://ippure.com/

## 解决方案

DNS 加密 关于DNS加密有两种方式：


### DoH - DNS over HTTPS

基于 HTTPS 的 DNS 解析协议，将 DNS 解析请求封装在 HTTPS 请求中，避免明文传输，防止被第三方截获。


### DoT - DNS over TLS

基于 TLS 加密的 DNS 解析协议，将 DNS 解析请求封装在 TLS 请求中，避免明文传输，防止被第三方截获。





### DoQ - DNS over QUIC
基于 QUIC 加密的 DNS 解析协议，将 DNS 解析请求封装在 QUIC 请求中，避免明文传输，防止被第三方截获。