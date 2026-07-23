---
title: 'linux 一些知识点'
description: 'linux 一些知识点'
pubDate: 2026-07-22T11:44:05.569Z
---


````md
`tar` 是 Linux 中非常核心的归档工具，尤其在部署、Docker、Linux 运维中非常常见。

你刚才遇到的问题：

```
gzip -> tar -> jar
```

就是典型的多层打包。

---

# 1. tar 是什么？

`tar` 全称：

> Tape Archive（磁带归档）

最开始用于磁带备份，现在主要用于：

* 打包多个文件
* 保留目录结构
* 保留权限
* 配合 gzip 压缩

注意：

**tar 本身只负责打包，不负责压缩。**

例如：

```
a.txt
b.txt
c.txt
```

执行：

```bash
tar -cf test.tar a.txt b.txt c.txt
```

得到：

```
test.tar
```

里面包含：

```
a.txt
b.txt
c.txt
```

但是大小基本没有减少。

---

# 2. tar 参数解释

最常见：

```bash
tar -参数 文件
```

例如：

```bash
tar -xf xxx.tar
```

拆开：

```
tar
 |
 +-- -x
 |
 +-- -f
```

---

## -x

### extract

意思：

> 解包 / 提取

记忆：

```
x = eXtract
```

例如：

```bash
tar -xf app.tar
```

表示：

```
app.tar
        |
        v
解压出来
```

---

## -f

### file

意思：

> 指定操作的文件

记忆：

```
f = File
```

例如：

```bash
tar -xf app.tar
```

这里：

```
-f app.tar
```

表示：

"我要操作 app.tar"

---

## -c

### create

创建 tar 包

记忆：

```
c = Create
```

例如：

```bash
tar -cf backup.tar /etc/nginx
```

意思：

创建：

```
backup.tar
```

里面包含：

```
/etc/nginx
```

---

## -t

### table

查看内容列表

记忆：

```
t = Table
```

例如：

```bash
tar -tf app.tar
```

查看：

```
app.tar
```

里面有什么。

你刚才用：

```bash
tar -tf bin/QYPark-server.jar
```

就是：

```
t = 查看目录
f = 指定文件
```

输出：

```
QYPark-server.jar
```

说明里面还有一层。

---

## -v

### verbose

显示详细过程

记忆：

```
v = verbose
```

例如：

```bash
tar -xvf app.tar
```

显示：

```
x app/
x app/config.yml
x app/bin/start.sh
```

没有 `v`：

```bash
tar -xf app.tar
```

可能没有输出。

---

## -z

gzip

记忆：

```
z = gzip
```

例如：

```bash
tar -zcf app.tar.gz app/
```

表示：

```
app目录
   |
   v
tar打包
   |
   v
gzip压缩
```

生成：

```
app.tar.gz
```

---

# 3. 最常用组合（重点记）

## ① 解压 tar

90% 场景：

```bash
tar -xf xxx.tar
```

例如：

```bash
tar -xf release.tar
```

含义：

```
x = 解包
f = 文件
```

---

## ② 解压 tar.gz

Linux 最常见：

```bash
tar -zxf xxx.tar.gz
```

含义：

```
z = gzip
x = extract
f = file
```

口诀：

> gz 包，先 z；解包 x；文件 f

---

## ③ 打包 tar

```bash
tar -cf xxx.tar directory/
```

例如：

```bash
tar -cf backup.tar /data
```

口诀：

```
c = create
f = file
```

---

## ④ 打包并 gzip

最常见备份：

```bash
tar -zcf backup.tar.gz /data
```

口诀：

```
zcf

z 压缩
c 创建
f 文件
```

---

## ⑤ 查看 tar 内容

非常重要：

```bash
tar -tf xxx.tar
```

口诀：

```
t = 看目录 table
f = 文件
```

例如：

不知道包里面有什么：

```bash
tar -tf xxx.tar
```

先看。

---

## ⑥ 指定解压目录

生产环境非常常用：

```bash
tar -xf app.tar -C /opt/app
```

解释：

```
-C
=
Change directory
```

意思：

解到：

```
/opt/app
```

---

# 4. 一个完整生命周期

比如发布：

```
项目目录

app/
├── bin/
├── conf/
└── logs/
```

---

## 打包

```bash
tar -zcf app.tar.gz app/
```

得到：

```
app.tar.gz
```

---

## 上传服务器

---

## 查看

```bash
tar -tf app.tar.gz
```

看到：

```
app/
app/bin/
app/conf/
```

---

## 解压

```bash
tar -zxf app.tar.gz
```

恢复：

```
app/
├── bin
├── conf
└── logs
```

---

# 5. 和 gzip 的区别（容易混）

很多新人这里容易混。

## gzip

只能压一个文件：

```bash
gzip app.jar
```

结果：

```
app.jar.gz
```

不能：

```
目录/
 ├──a
 ├──b
 └──c
```

---

## tar

可以打包目录：

```
目录
 |
 v
一个文件
```

但是不压缩。

所以组合：

```
tar
负责整理
+
gzip
负责压缩
```

形成：

```
.tar.gz
```

---

# 6. 给你一个运维记忆口诀

我建议记这个：

```
tar 四兄弟：

c  create 创建包
x  extract 解包
t  table 查看包
f  file 指定文件

z  gzip 压缩
v  verbose 看过程
C  change 目标目录
```

组合：

| 需求       | 命令                            |
| -------- | ----------------------------- |
| 查看包      | `tar -tf xxx.tar`             |
| 解 tar    | `tar -xf xxx.tar`             |
| 解 tar.gz | `tar -zxf xxx.tar.gz`         |
| 打 tar    | `tar -cf xxx.tar dir`         |
| 打 tar.gz | `tar -zcf xxx.tar.gz dir`     |
| 解到指定目录   | `tar -zxf xxx.tar.gz -C /opt` |

---

结合你这次云效问题：

实际链路就是：

```
QYPark-server.jar
        ↓
tar -cf
        ↓
QYPark-server.jar.tar
        ↓
gzip
        ↓
QYPark-server.jar.tar.gz
        ↓
下载时错误改名
        ↓
QYPark-server.jar
```

所以你用：

```bash
file
```

逐层判断：

```
gzip compressed data
        ↓ gzip -d
POSIX tar archive
        ↓ tar -xf
Zip archive data
        ↓
java -jar
```

这套排查思路在 Linux 部署里非常常用。你这次实际上踩到了一个很典型的 **制品多层封装问题**。

````