---
title: 'IPFS概念学习探究'
description: '尝试将博客放入ipfs中前的概念学习'
pubDate: 2026-03-31T13:44:05.569Z
heroImage: '/blog-placehoder-7.jpg'
---




## 引入

使用破解jb家族的编译器时涉及到了部分ipfs网管到概念
如下  [这里](https://zhile.io/2023/09/04/copy-jetbra-in.html#more-410)
结合之前自己想要搭建自己的dns服务器的想法,进行了进一步的研究


## 学习内容

先引入一些新概念

### TXT 记录
    TXT 记录是一种 DNS 记录类型，用于存储文本数据。

    设置后可以通过下面的方式查看
    ```bash
    dig txt example.com
    ## 获取简洁的txt记录
    dig txt +short example.com

    ## 或者
    nslookup -type=txt 你的域名
    ```


### IPFS DNSLink Gateway
    IPFS DNSLink Gateway 是一种 DNS 服务器，用于将 IPFS 节点的哈希值转换为 DNS 名称。
   
### IPFS (InterPlanetary File System)

   ◦   一个点对点的分布式文件系统，通过内容寻址来定位文件。

    ◦   文件在IPFS中有一个唯一的、基于其内容计算出来的CID（内容标识符），长得像这样：QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco。

    ◦   要访问一个IPFS文件，你需要通过一个IPFS客户端（如IPFS Desktop）或者一个公共IPFS网关（如 ipfs.io）来获取，网址会是：

        https://ipfs.io/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco
        
    ◦   问题是：这个CID很难记，而且当文件更新后，CID会完全改变，之前的链接就失效了。


### DNSLink


    ◦   一种将域名与动态的IPFS CID进行绑定的技术。

    ◦   其原理非常简单：在您域名的DNS解析记录中，添加一条特殊的 TXT 记录。

    ◦   这条 TXT 记录的值是一个指向当前最新IPFS内容CID的指针。

        ▪   记录名：_dnslink.yourdomain.com 或 yourdomain.com （通常用前者，可以避免与其他TXT记录冲突）

        ▪   记录值：dnslink=/ipfs/<最新的CID> 或 dnslink=/ipns/<你的IPNS地址> （IPNS是IPFS的可变指针系统，可绑定到固定CID）


### IPFS Gateway
    ◦   一个理解IPFS协议并能为普通浏览器提供HTTP访问入口的服务器。

    ◦   支持DNSLink的网关（如 ipfs.io, cloudflare-ipfs.com, 或您自己部署的网关）有一个“超能力”：当它收到对某个域名的请求时，会先去查询这个域名的 DNSLink TXT记录，获取到最新的CID，然后自动从IPFS网络中获取并返回对应的内容。

完整工作流程（以访问 blog.yourdomain.com 为例）

[gateway](https://specs.ipfs.tech/http-gateways/)

假设您已经在IPFS上部署了一个博客网站，其最新内容的CID是 QmNewBlog...。

1.  您（网站主）的配置：
    ◦   您在域名的DNS提供商（如阿里云）那里，为子域名 blog 添加一条解析记录。

    ◦   A记录：blog -> 指向某个公共IPFS网关的IP地址（例如，使用 Cloudflare的IPFS网关 cloudflare-ipfs.com 的IP，或者您自己搭建的网关IP）。

    ◦   关键TXT记录：_dnslink.blog -> 值为 dnslink=/ipfs/QmNewBlog...。

2.  用户访问流程：
    1.  用户在浏览器输入 https://blog.yourdomain.com。
    2.  DNS解析将 blog.yourdomain.com 指向您设置的IPFS网关服务器IP。
    3.  IPFS网关收到请求，它发现这是一个域名请求，于是去查询这个域名下 _dnslink.blog 的TXT记录。
    4.  网关从TXT记录中读取出值 dnslink=/ipfs/QmNewBlog...。
    5.  网关根据这个CID，去整个IPFS分布式网络中寻找并获取该博客网站的文件。
    6.  网关将文件以标准HTTP网页的形式返回给用户的浏览器。



## 个人博客改造IPFS方案


4. 我怎么把我的博客上传到 IPFS 中？

以下是几种主流方法，从易到难：

方法一：使用图形化工具（最简单）

1. 下载 IPFS Desktop（桌面应用）
2. 将您的博客文件夹拖入“Files”区域
3. 右键文件夹 → “Share” → 复制 CID
4. 在“Files”中右键文件夹 → “Pin” 固定文件

方法二：使用命令行

 1. 安装 IPFS
  从 https://dist.ipfs.tech/#kubo 下载

2. 初始化节点
ipfs init

3. 启动守护进程
ipfs daemon  # 保持此窗口运行

4. 上传博客（在另一个终端）
ipfs add -r /path/to/your/blog/
记住最后一行输出的 CID，那是整个文件夹的根 CID

5. 固定文件（防止被垃圾回收）
ipfs pin add /ipfs/<您的CID>


方法三：使用第三方服务（推荐，有免费方案）

• Pinata (pinata.cloud)：

  1. 注册账户
  2. 拖拽上传文件夹
  3. 自动获得 CID 和专属网关链接
  
• Fleek (fleek.co)：

  1. 连接 GitHub/GitLab
  2. 选择包含博客代码的仓库
  3. 自动构建并部署到 IPFS
  4. 获得固定域名和 CID

• 4EVERLAND (4everland.org)：

  1. 类似 Vercel 的体验
  2. 支持自动从 Git 部署
  3. 免费额度足够个人博客

上传前的检查清单

1. ✅ 确保 index.html 在根目录
2. ✅ 使用相对路径链接资源（./css/style.css 而非 /css/style.css）
3. ✅ 测试所有链接在离线状态下工作
4. ✅ 文件总大小注意：免费服务通常有单文件/总大小限制

5. 上传后我要怎么访问我的博客？

有 5 种主要访问方式：

方式 1：通过公共网关 + CID（最直接）


https://ipfs.io/ipfs/<您的CID>/
https://cloudflare-ipfs.com/ipfs/<您的CID>/
https://<您的CID>.ipfs.dweb.link/

缺点：CID 难记，更新后 CID 会变

方式 2：通过公共网关 + IPNS


https://ipfs.io/ipns/<您的IPNS地址>/

优点：IPNS 地址固定，更新网站后只需重新发布，此链接永远有效

方式 3：通过域名 + DNSLink（推荐的生产方案）

1. 在 DNS 服务商添加记录：
   • A记录：blog.yourdomain.com → 指向 cloudflare-ipfs.com 的 IP

     ◦ 或 CNAME：blog.yourdomain.com → cloudflare-ipfs.com

   • TXT记录：_dnslink.blog → dnslink=/ipfs/<您的CID> 或 dnslink=/ipns/<您的IPNS>

2. 访问：

   https://blog.yourdomain.com
   

方式 4：通过 ENS + IPFS

如果使用以太坊域名（如 myname.eth）：
1. 在 ENS 管理界面设置
2. 设置“Content”字段为：ipfs://<CID>
3. 通过支持 ENS 的浏览器或网关访问

方式 5：本地访问

1. 运行自己的 IPFS 节点
2. 访问：http://localhost:8080/ipfs/<CID>/

完整工作流程示例

假设您有一个 Hugo 静态博客：
1. 生成博客
hugo  # 生成 public/ 文件夹

2. 上传到 IPFS（通过 Pinata）
在 pinata.cloud 上传 public/ 文件夹
获得 CID: QmBlog123...

3. 设置 DNS
在阿里云添加：
CNAME: blog → cloudflare-ipfs.com
TXT: _dnslink.blog → dnslink=/ipfs/QmBlog123...

4. 访问
浏览器打开：https://blog.yourdomain.com
实际上访问的是：https://cloudflare-ipfs.com/ipfs/QmBlog123.../

5. 更新时
重新 hugo 生成
上传新的 public/ 获得新 CID: QmBlog456...
更新 TXT 记录为：dnslink=/ipfs/QmBlog456...
等待 DNS 生效（几分钟）


最佳实践建议

1. 对于个人博客：使用 Fleek/4EVERLAND + 自定义域名 最省心
2. 需要频繁更新：使用 IPNS 或 自动化 CI/CD（Git 推送自动部署）
3. 追求完全去中心化：使用 ENS + IPFS 方案
4. 只是想试试：先用 Pinata + 公共网关链接 体验

这样您的博客就永久存储在分布式网络中了，只要 IPFS 网络存在，即使您的电脑关机、服务器宕机，网站依然可以通过公共网关访问。