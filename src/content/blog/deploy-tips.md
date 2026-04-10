---
title: '部署小知识点'
description: 'docker安装和docker compose 安装'
pubDate: '2026-04-10'
heroImage: '/blog-placehoder-7.jpg'
---





## docker 本地安装
[内网环境部署]

所需
 * docker 安装包
    [选择对应的安装包](https://download.docker.com/linux/static/stable)

 * docker compose 二进制
 (选择对应的安装包)[https://github.com/docker/compose/releases]



### 安装脚本

```bash
#!/bin/sh
echo '解压tar包......'
tar -xvf docker.tar.gz --overwrite
echo '将docker目录移到/usr/bin目录下.....'
cp docker/* /usr/bin/
echo '将docker.service 移到/etc/systemd/system/ 目录.....'
cat << EOF > /etc/systemd/system/docker.service
[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
After=network-online.target firewalld.service
Wants=network-online.target

[Service]
Type=notify
# the default is not to use systemd for cgroups because the delegate issues still
# exists and systemd currently does not support the cgroup feature set required
# for containers run by docker
ExecStart=/usr/bin/dockerd
ExecReload=/bin/kill -s HUP 
# Having non-zero Limit*s causes performance problems due to accounting overhead
# in the kernel. We recommend using cgroups to do container-local accounting.
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
# Uncomment TasksMax if your systemd version supports it.
# Only systemd 226 and above support this version.
#TasksMax=infinity
TimeoutStartSec=0
# set delegate yes so that systemd does not reset the cgroups of docker containers
Delegate=yes
# kill only the docker process, not all processes in the cgroup
KillMode=process
# restart the docker process if it exits prematurely
Restart=on-failure
StartLimitBurst=3
StartLimitInterval=60s

[Install]
WantedBy=multi-user.target
EOF
echo '添加文件权限.....'
chmod +x /etc/systemd/system/docker.service
echo '重新加载配置文件.....'
systemctl daemon-reload
echo '启动docker.....'
systemctl start docker
echo '设置开机自启.....'
systemctl enable docker.service
echo 'docker安装成功.....'
docker -v


```

### 卸载脚本
```bash
#!/bin/sh
echo '删除docker.service......'
rm -f /etc/systemd/system/docker.service
echo '删除docker文件......'
# 删除 docker
sudo rm -rf /usr/bin/docker*
# 删除 containerd
sudo rm -rf /usr/bin/containerd*
# 删除 docker 运行时 ID
sudo rm -rf /var/run/docker*
# 卸载 docker-compose
sudo rm -rf /usr/local/bin/docker-compose
sudo rm -rf /var/lib/docker*
sudo rm -rf /var/lib/containerd*
echo '重新加载配置文件'
systemctl daemon-reload
echo '卸载成功...'

```


### docker-compose 安装

```bash
# 创建插件目录
sudo mkdir -p /usr/local/lib/docker/cli-plugins

# 下载 Docker Compose v2
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/lib/docker-compose

# 或使用国内镜像加速
sudo curl -L "https://ghproxy.com/https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/lib/docker-compose

# 添加执行权限
sudo chmod +x /usr/local/lib/docker-compose

# 验证安装
docker compose version
```





## 系统验证码错误 


业务后台报错
```bash

```


redis报错
```bash
yzt_redis | 1:M 10 Apr 2026 05:02:12.184 # Failed opening the temp RDB file temp-1.rdb (in server root dir unknown) for saving: No such file or directory yzt_redis | 1:M 10 Apr 2026 05:02:12.184 # Error trying to save the DB, can't exit. yzt_redis | 1:M 10 Apr 2026 05:02:12.184 # Errors trying to shut down the server. Check the logs for more information. yzt_redis | 1:M 10 Apr 2026 05:02:13.090 * 1 changes in 3600 seconds. Saving... yzt_redis | 1:M 10 Apr 2026 05:02:13.091 * Background saving started by pid 996 yzt_redis | 996:C 10 Apr 2026 05:02:13.092 # Failed opening the temp RDB file temp-996.rdb (in server root dir unknown) for saving: No such file or directory yzt_redis | 1:M 10 Apr 2026 05:02:13.192 # Background saving error yzt_redis | 1:M 10 Apr 2026 05:02:19.033 * 1 changes in 3600 seconds. Saving... yzt_redis | 1:M 10 Apr 2026 05:02:19.034 * Background saving started by pid 997 yzt_redis | 997:C 10 Apr 2026 05:02:19.035 # Failed opening the temp RDB file temp-997.rdb (in server root dir unknown) for saving: No such file or directory yzt_redis | 1:M 10 Apr 2026 05:02:19.135 # Background saving error
```

> 定位到redis 本地持久化失败导致的
> Failed opening the temp RDB file temp-xxx.rdb (in server root dir unknown) for saving: No such file or directory
Redis 想生成 RDB 快照文件，但找不到可写的目录（甚至连目录在哪都不知道）


### 尝试 exec 进入容器查看 

存在报错
 ```bash
 docker exec -it bd566c85df9c /bin/bash OCI runtime exec failed: exec failed: unable to start container process: current working directory is outside of container mount namespace root -- possible container breakout detected: unknown exit status 128
 ```

 本质含义是：
    👉 你当前所在的宿主机目录，在容器的挂载命名空间里不存在 / 不可见
    👉 Docker 出于安全原因，直接拒绝执行（防止“逃逸”）


### 坚持docker-compose 文件发现问题

```yaml
  redis:
    image: redis:8.0
    container_name: yzt_redis
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - ./redis/data:/data
      - ./redis/redis.conf:/usr/local/etc/redis/redis.conf
    command: redis-server /usr/local/etc/redis/redis.conf
    networks:
      yzt-network:
        aliases:
          - redis
```

其中 ./redis/redis.conf:/usr/local/etc/redis/redis.conf

这里直接挂载的文件

**docker-compose 这里有些版本不支持挂在 文件,需要这里更改为挂目录**

修改为       - ./redis:/usr/local/etc/redis 才可以成功运行