---
title: '自建邮箱服务器调研实践'
description: '自建邮箱服务器调研实践'
pubDate: '2026-06-10'
hidden: true
tags:
  - Code
---




## 前置概念


### 涉及协议

1. SMTP（Simple Mail Transfer Protocol）TCP 25 核心投递协议
    * Submission 提交协议（SMTP 加密变体）TCP 587
    *  SMTPS 加密直连 TCP 465

2. IMAP（Internet Message Access Protocol）TCP 143 / 993 (加密) 收信拉取协议（用户下载邮件）

### 需要添加域名记录

* A记录

* MX 记录（Mail Exchange 邮件交换）

* SPF 记录（Sender Policy Framework 发件人策略） TXT 记录

* DKIM（DomainKeys Identified Mail 域名密钥识别邮件） TXT (_domainkey 前缀)

* DMARC（Domain-based Message Authentication Reporting and Conformance） TXT (_dmarc 前缀)







### 步骤暂存修改


* 服务已经启动. 目录从根 移到了 /root/mail
* 解析 还差一个 配置 DKIM

* docker compose -p mailu exec admin flask mailu admin admin zqsrh.com PASSWORD


````md
Mailu 确实是你当前 **2C2G 阿里云 ECS** 最合适的方案。

不过在开始部署之前，我建议先确认 **3 个关键条件**，否则即使安装成功也可能无法正常收发邮件：

## 第一步：确认服务器条件

### 1. 操作系统

推荐：

```bash
Ubuntu 22.04 LTS
```

查看：

```bash
cat /etc/os-release
```

---

### 2. ECS 公网 IP

查看：

```bash
curl ifconfig.me
```

记录下来，例如：

```text
47.xx.xx.xx
```

---

### 3. 出站 25 端口是否可用（最重要）

测试：

```bash
nc -zv gmail-smtp-in.l.google.com 25
```

或者：

```bash
telnet gmail-smtp-in.l.google.com 25
```

正常应看到类似：

```text
Connection succeeded
```

如果超时或拒绝连接：

```text
自建邮件服务器无法向外发送邮件
```

这一步必须先确认。

---

## 第二步：规划域名

假设你的域名：

```text
example.com
```

邮件服务器主机名：

```text
mail.example.com
```

邮箱：

```text
admin@example.com
```

请不要直接把根域名当邮件服务器。

推荐：

```text
mail.example.com
```

作为 SMTP / IMAP 服务器。

---

## 第三步：配置 DNS

在阿里云 DNS 中配置。

### A 记录

```dns
mail.example.com
A
47.xx.xx.xx
```

---

### MX 记录

```dns
@
MX 10
mail.example.com
```

---

### SPF

```dns
@
TXT
v=spf1 mx ip4:47.xx.xx.xx -all
```

---

### DMARC

```dns
_dmarc
TXT
v=DMARC1; p=quarantine; rua=mailto:admin@example.com
```

---

先不要配置 DKIM。

Mailu 启动后会生成 DKIM 公钥。

---

## 第四步：开放端口

阿里云安全组放行：

```text
25
465
587
80
443
110
995
143
993
4190
```

同时检查 Ubuntu 防火墙：

```bash
ufw status
```

如果开启：

```bash
ufw allow 25/tcp
ufw allow 465/tcp
ufw allow 587/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 143/tcp
ufw allow 993/tcp
ufw allow 110/tcp
ufw allow 995/tcp
```

---

# 第五步：安装 Docker

更新系统：

```bash
apt update
apt upgrade -y
```

安装 Docker：

```bash
apt install -y docker.io docker-compose-plugin
```

启动：

```bash
systemctl enable docker
systemctl start docker
```

检查：

```bash
docker version
```

---

# 第六步：生成 Mailu 配置

Mailu 官方提供配置生成器：

[Mailu Setup Generator](https://setup.mailu.io?utm_source=chatgpt.com)

推荐填写：

### Mailu version

```text
2.0
```

---

### Main mail domain

```text
example.com
```

---

### Hostnames

```text
mail.example.com
```

---

### TLS

```text
Let's Encrypt
```

---

### Webmail

勾选：

```text
Roundcube
```

资源占用较低。

---

### Antivirus

不勾选：

```text
ClamAV
```

2G 内存机器先不要启用。

---

### WebDAV

不勾选。

---

### Fetchmail

不勾选。

---

### Admin

勾选。

---

生成后下载：

```text
mailu.zip
```

上传到服务器：

```bash
scp mailu.zip root@服务器IP:/root
```

---

# 第七步：解压

```bash
apt install unzip -y

unzip mailu.zip

cd mailu
```

目录大概：

```text
mailu/
├── docker-compose.yml
├── mailu.env
```

---

# 第八步：启动

```bash
docker compose up -d
```

查看：

```bash
docker ps
```

应看到：

```text
mailu-front
mailu-admin
mailu-imap
mailu-smtp
mailu-webmail
mailu-redis
```

---

# 第九步：初始化管理员

进入：

```text
https://mail.example.com/admin
```

首次登录账号密码在 `mailu.env` 中配置或按生成器说明创建。

如果没有管理员用户，可以进入 admin 容器创建：

```bash
docker compose exec admin flask mailu admin admin example.com 'StrongPassword'
```

创建后登录：

```text
admin@example.com
```

---

# 第十步：创建邮箱

后台：

```text
Domains
```

创建：

```text
example.com
```

然后：

```text
Users
```

创建：

```text
admin@example.com
```

---

# 第十一步：配置 DKIM

启动后查看：

```bash
docker compose exec admin flask mailu config-export
```

或者在后台：

```text
Domain -> DKIM Keys
```

会看到类似：

```dns
mail._domainkey
TXT
v=DKIM1; k=rsa; p=......
```

复制到阿里云 DNS。

等待解析生效。

---

# 第十二步：验证

检查 MX：

```bash
dig MX example.com
```

检查 SPF：

```bash
dig TXT example.com
```

检查 DKIM：

```bash
dig TXT mail._domainkey.example.com
```

---

# 第十三步：送达率测试

注册一个 Gmail。

给自己发送：

```text
admin@example.com
→
你的 Gmail
```

然后查看邮件头：

```text
SPF PASS
DKIM PASS
DMARC PASS
```

---

## 我建议你先执行

```bash
cat /etc/os-release
free -h
curl ifconfig.me
nc -zv gmail-smtp-in.l.google.com 25
```

把结果发给我。

我可以根据你的 ECS 实际情况（Ubuntu 版本、内存、25 端口状态）帮你调整 Mailu 配置，避免部署到一半发现发信受限。

````