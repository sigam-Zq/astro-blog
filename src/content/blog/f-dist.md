---
title: '前端静态编译环境变量探究'
description: '前端的env编译dist文本进行全局替换'
pubDate: '2026-04-11'
---

## 背景

前端项目需要跳转到另一个项目,在不同的URL 但是指向的URL 在通过procese.env 中去读取的
经过实验和逐步发现,这里的访问的地址是运行 npm run build 时刻下的当前环境的环境变量
然后查看打包产物发现 dist 文件下js 中请求地址文本写死


## 解决思路

已经发版, 重新打包流程过长,这里打算直接操作修改dist 文件然后 nginx -s reload 进行更新



## 解决方法

```bash
docker exec yzt-f sh -c "grep -rl '192.168.0.45:2000' /var/www/html | xargs sed -i 's/192.168.0.45:2000/192.168.1.101:2000/g'"
```


* docker exec yzt-f sh -c  "xxx" 在容器内执行 xxx命令

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