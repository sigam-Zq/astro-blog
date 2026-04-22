---
title: '不发版前提下更改dist'
description: 'sed grep xargs 替换dist 中的文本'
pubDate: '2026-04-22'
---

## 背景

前端存在一个排除url的目录更改需要重新发版,嫌麻烦

## 解决思路

直接更改dist文件内的文本



## 解决方法

### 先进行搜索定位
```bash
grep -o '.\{0,100\}原字符串.\{0,100\}'
```


* grep -o 仅输出匹配到的子串，而非整行

* .\{0,100\}

    * . 匹配任意一个字符（除换行符）
    * \{0,100\} 表示前面的 . 重复 0 到 100 次（贪婪匹配，尽可能多取）

这样dist一行很长的情况就可以只看原字符串的附近内容了


> 之前内容复习

* grep -r "xxx" /var/www/html    /var/www/html目录下 -r 递归搜索 xxx的内容返回 文本

* grep -l 作用：只显示匹配到内容的文件名

* |  把左边命令的输出，变成右边命令的输入

* xargs 把一串文件名，变成可以传给 sed 执行的参数。 把前面输出的文件名，接到后面命令的尾巴上，让命令知道要处理哪些文件。
```text

/var/www/html/a.js  
/var/www/html/b.js
/var/www/html/c.js
---->  /var/www/html/a.js /var/www/html/b.js /var/www/html/c.js 

然后给到输入
sed -i 's/旧/新/g' /var/www/html/a.js /var/www/html/b.js /var/www/html/c.js
```

* sed -i 's/旧/新/g'  流编辑器，专门用来批量修改文本。 -i 直接修改文件内容（原地修改，不产生临时文件）



###  进行定位和查看的替换是否成功


```bash
ninuo@ninuodeMacBook-Pro dev % docker exec yzt-f sh -c "grep -rl 'excludeUrls:\[\"/sys/checkCaptcha\",\"/sys/randomImage/\*\*\"\]' /var/www/html | xargs sed 's/excludeUrls:\[\"\\/sys\\/checkCaptcha\",\"\\/sys\\/randomImage\\/\\*\\*\"\]/excludeUrls:[\"\\/sys\\/checkCaptcha\",\"\\/sys\\/randomImage\\/\\*\\*\",\"sys\\/proxy\\/audio\\/speech\"]/' | grep -o '.\{0,100\}sys\\/proxy\\/audio\\/speech.\{0,100\}'"
41c4bdde66dbb553339dafbf82c574eca3544fb405",excludeUrls:["/sys/checkCaptcha","/sys/randomImage/**","sys/proxy/audio/speech"]};var nB={exports:{}};function OWe(e){throw new Error('Could not dynamically require "'+e+'". Plea
ninuo@ninuodeMacBook-Pro dev % 
```

* grep -rl 'excludeUrls:\[\"/sys/checkCaptcha\",\"/sys/randomImage/\*\*\"\]' /var/www/html  得到文件路径

* xargs 把上面的文件 放到 sed 最后面

* sed 's/excludeUrls:\[\"\\/sys\\/checkCaptcha\",\"\\/sys\\/randomImage\\/\\*\\*\"\]/excludeUrls:[\"\\/sys\\/checkCaptcha\",\"\\/sys\\/randomImage\\/\\*\\*\",\"sys\\/proxy\\/audio\\/speech\"]/' xxx.js 
把  'excludeUrls:["/sys/checkCaptcha","/sys/randomImage/**"]' 换成 'excludeUrls:["/sys/checkCaptcha","/sys/randomImage/**","sys/proxy/audio/speech"]'

然后输出替换的文本

*  grep -o '.\{0,100\}sys\\/proxy\\/audio\\/speech.\{0,100\} 这里过滤只关注 sys/proxy/audio/speech 前后100字符的文本

* 转义


```txt
<!-- 原字符串 -->
'excludeUrls:\["/sys/checkCaptcha","/sys/randomImage/\*\*"\]'

<!-- 转义字符串 -->
excludeUrls:\[\"\\/sys\\/checkCaptcha\",\"\\/sys\\/randomImage\\/\\*\\*\"\]
```


````md
# 我用**最通俗、最透彻**的方式给你讲清楚
你现在卡的是：**四层嵌套转义**，我一层一层剥开，你马上彻底懂！

---

# 先记住一句话
## **你看到的每一层引号，都要多一层转义！**

你的命令一共有 **4 层环境**：
1. **Mac 终端 zsh**（最外层）
2. `docker exec ... sh -c "..."`（第二层）
3. 容器内部 **sh**（第三层）
4. **sed/grep 正则**（第四层）

---

# 核心规则（背会这 4 条就够了）
## 1. 双引号 `"`
在字符串里要写成：**`\"`**
因为引号会被 shell 吃掉，必须转义。

## 2. 斜杠 `/`
在 sed 里要写成：**`\/`**
因为 sed 用 `/` 做分隔符，必须转义。

## 3. 星号 `*`
在正则里要写成：**`\*`**
不转义会变成“匹配任意字符”。

## 4. 最关键：**反斜杠 `\` 本身**
每多一层嵌套，**就要多写一个 `\`**
- 1 层：`\`
- 2 层：`\\`
- 3 层：`\\\`
- 4 层：`\\\\`

---

# 我直接对照你这条命令逐段解释
## 你这条命令里的字符串：
```
excludeUrls:\[\"\\/sys\\/checkCaptcha\",\"\\/sys\\/randomImage\\/\\*\\*\"\]
```

## 真实文件里是：
```
excludeUrls:["/sys/checkCaptcha","/sys/randomImage/**"]
```

---

# 逐段翻译（最关键）
## 文件里：`["`
命令里写成：`\[\"`
- `[` → 正则特殊 → `\[`
- `"` → shell 特殊 → `\"`

## 文件里：`/sys`
命令里写成：`\\/sys`
- `/` 在 sed 里是分隔符 → 必须写成 `\/`
- 又经过一层 shell 嵌套 → 变成 `\\/`

## 文件里：`**`
命令里写成：`\\*\\*`
- `*` 正则特殊 → `\*`
- 嵌套一层 → `\\*`

---

# 最容易混淆的两个：`\.` 和 `\\`
## 1. 什么时候用 `\.`？
**表示“匹配一个真实的点”**
比如 grep 截取前后字符：
```
'.\{0,100\}xxx'
```
- `.` 在正则里 = 任意字符
- 要表示“真实的点”必须写 `\.`

## 2. 什么时候用 `\\`？
**要让反斜杠 `\` 真正传递到下一层**
比如：
- 传给 sed 的是 `\/` → 命令里要写 `\\/`
- 传给 sed 的是 `\*` → 命令里要写 `\\*`

---

# 终极总结（最简单记忆法）
## 你在命令里看到：
- `\"` = 最终表示一个双引号 `"`
- `\\/` = 最终表示一个斜杠 `/`
- `\\*` = 最终表示一个星号 `*`
- `\[` = 最终表示一个括号 `[`

## 为什么要这么多？
因为：
**Mac 终端 → docker → sh → sed/grep**
每过一层，**反斜杠就被吃掉一层**，所以必须多写一层！

---

# 你这条命令的最终简化理解
## 你写的：
```
excludeUrls:\[\"\\/sys\\/checkCaptcha\",\"\\/sys\\/randomImage\\/\\*\\*\"\]
```

## 真正到达 sed 的内容：
```
excludeUrls:\["\/sys\/checkCaptcha","\/sys\/randomImage\/*\*"]
```

## 真正匹配文件的内容：
```
excludeUrls:["/sys/checkCaptcha","/sys/randomImage/**"]
```

---

# 你要我帮你总结成一句口诀吗？
## **引号加 \，斜杠变 \\/，星号变 \\/\\*，穿过几层壳，就加几层 \！**

---

## 你现在这条命令是 100% 正确的！
直接执行，**替换一定成功**！

需要我帮你把 **最终替换命令（带 -i）** 再确认一遍吗？
````