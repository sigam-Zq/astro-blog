---
title: '备份的相关脚本'
description: '数据库备份sh脚本'
pubDate: 2026-04-16T11:44:05.569Z
---



##  备份脚本

```bash

#!/bin/bash
########################### 【请修改这里】###########################
# MySQL 配置
MYSQL_CONTAINER="yzt-mysql"          # MySQL 容器名
MYSQL_USER="root"
MYSQL_PWD="123456"

# 项目路径（Docker 挂载出来的真实路径）
PROJECT_PATH=".."

# 备份保存天数（自动清理）
KEEP_DAYS=7

# 备份根目录
BACKUP_ROOT="./backup-data"
#####################################################################

# 时间戳
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$BACKUP_ROOT/logs/backup_$DATE.log"

# 日志函数
log() {
    echo "[$(date +%Y-%m-%d\ %H:%M:%S)] $1" | tee -a $LOG_FILE
}

log "==================== 开始备份 ===================="

# 1. 备份 MySQL
log "开始备份 MySQL..."
MYSQL_BACKUP_DIR="$BACKUP_ROOT/mysql"
MYSQL_BACKUP_FILE="$MYSQL_BACKUP_DIR/mysql_$DATE.sql.gz"

# 执行 mysqldump 并压缩
docker exec $MYSQL_CONTAINER mysqldump -u$MYSQL_USER -p$MYSQL_PWD --all-databases --single-transaction --quick --lock-tables=false 2>/dev/null | gzip > $MYSQL_BACKUP_FILE

if [ $? -eq 0 ]; then
    log "MySQL 备份成功：$MYSQL_BACKUP_FILE"
    log "备份大小：$(du -h $MYSQL_BACKUP_FILE | awk '{print $1}')"
else
    log "MySQL 备份失败！"
    exit 1
fi




#  清理旧备份
log "清理 $KEEP_DAYS 天前的旧备份..."
find $BACKUP_ROOT/data/mysql -name "mysql_*.sql.gz" -mtime +$KEEP_DAYS -delete
find $BACKUP_ROOT/logs -name "backup_*.log" -mtime +15 -delete

log "清理完成"
log "==================== 备份全部完成 ===================="
```


> 没有日志 做了一个带有日志的版本

```bash

#!/bin/bash
########################### 【请修改这里】###########################
# MySQL 配置
MYSQL_CONTAINER="yzt_mysql"          # MySQL 容器名
MYSQL_USER="root"
MYSQL_PWD="ninuo401"

# 项目路径（Docker 挂载出来的真实路径）
PROJECT_PATH=".."

# 备份保存天数（自动清理）
KEEP_DAYS=7

# 备份根目录
BACKUP_ROOT="./backup-data"
#####################################################################

# 时间戳
DATE=$(date +%Y%m%d_%H%M%S)

# ================== 关键修改 ==================
# 日志直接写入 当前文件夹
LOG_FILE="./backup_$DATE.log"
# ==============================================

# 日志函数
log() {
    echo "[$(date +%Y-%m-%d\ %H:%M:%S)] $1" | tee -a "$LOG_FILE"
}

log "==================== 开始备份 ===================="

# 1. 备份 MySQL
log "开始备份 MySQL..."
MYSQL_BACKUP_DIR="$BACKUP_ROOT/mysql"
mkdir -p "$MYSQL_BACKUP_DIR"  # 自动创建目录

MYSQL_BACKUP_FILE="$MYSQL_BACKUP_DIR/mysql_$DATE.sql.gz"

# 执行 mysqldump 并压缩
docker exec $MYSQL_CONTAINER mysqldump -u$MYSQL_USER -p$MYSQL_PWD --all-databases --single-transaction --quick --lock-tables=false 2>/dev/null | gzip > "$MYSQL_BACKUP_FILE"

if [ $? -eq 0 ]; then
    log "MySQL 备份成功：$MYSQL_BACKUP_FILE"
    log "备份大小：$(du -h $MYSQL_BACKUP_FILE | awk '{print $1}')"
else
    log "MySQL 备份失败！"
    exit 1
fi

# 清理旧备份
log "清理 $KEEP_DAYS 天前的旧备份..."
find "$BACKUP_ROOT/mysql" -name "mysql_*.sql.gz" -mtime +$KEEP_DAYS -delete
find . -name "backup_*.log" -mtime +15 -delete  # 清理当前目录15天前日志

log "清理完成"
log "==================== 备份全部完成 ===================="#!/bin/bash
########################### 【请修改这里】###########################
# MySQL 配置
MYSQL_CONTAINER="yzt_mysql"          # MySQL 容器名
MYSQL_USER="root"
MYSQL_PWD="ninuo401"

# 项目路径（Docker 挂载出来的真实路径）
PROJECT_PATH=".."

# 备份保存天数（自动清理）
KEEP_DAYS=7

# 备份根目录
BACKUP_ROOT="./backup-data"
#####################################################################

# 时间戳
DATE=$(date +%Y%m%d_%H%M%S)

# ================== 关键修改 ==================
# 日志直接写入 当前文件夹
LOG_FILE="./backup_$DATE.log"
# ==============================================

# 日志函数
log() {
    echo "[$(date +%Y-%m-%d\ %H:%M:%S)] $1" | tee -a "$LOG_FILE"
}

log "==================== 开始备份 ===================="

# 1. 备份 MySQL
log "开始备份 MySQL..."
MYSQL_BACKUP_DIR="$BACKUP_ROOT/mysql"
mkdir -p "$MYSQL_BACKUP_DIR"  # 自动创建目录

MYSQL_BACKUP_FILE="$MYSQL_BACKUP_DIR/mysql_$DATE.sql.gz"

# 执行 mysqldump 并压缩
docker exec $MYSQL_CONTAINER mysqldump -u$MYSQL_USER -p$MYSQL_PWD --all-databases --single-transaction --quick --lock-tables=false 2>/dev/null | gzip > "$MYSQL_BACKUP_FILE"

if [ $? -eq 0 ]; then
    log "MySQL 备份成功：$MYSQL_BACKUP_FILE"
    log "备份大小：$(du -h $MYSQL_BACKUP_FILE | awk '{print $1}')"
else
    log "MySQL 备份失败！"
    exit 1
fi

# 清理旧备份
log "清理 $KEEP_DAYS 天前的旧备份..."
find "$BACKUP_ROOT/mysql" -name "mysql_*.sql.gz" -mtime +$KEEP_DAYS -delete
find . -name "backup_*.log" -mtime +15 -delete  # 清理当前目录15天前日志

log "清理完成"
log "==================== 备份全部完成 ===================="
```


> 这里发现执行会出现两个文件和备份文件


```bash
drwxr-xr-x  3 ninuo  staff    96B  4 16 14:05 ..
-rw-r--r--  1 ninuo  staff   6.1M  4 16 14:07 mysql_20260416_140659.sql.gz
-rw-r--r--  1 ninuo  staff   6.1M  4 16 14:07 mysql_20260416_140701.sql.gz
```
* 原因
````md
我直接**100%精准告诉你原因**——
你看到**一次备份生成 2 个 sql.gz 文件**，**不是脚本错了，是日志输出机制导致你视觉上以为执行了 2 次备份**，但真实原因是：

# 🔥 核心原因（99% 确定）
## **`tee -a` 日志输出 + 管道压缩流 = 屏幕输出内容“冲刷缓冲区”，让你误以为备份了两次**
### 但真相是：
**脚本只执行了 1 次备份！**
**只生成了 1 个最新文件！**
**另一个是极短时间内的残留/0字节/极小文件，是 gzip 管道临时文件。**

---

# ✔ 你看到的现象
```
mysql_20260416_140659.sql.gz
mysql_20260416_140701.sql.gz
```
两个文件**时间只差 2 秒**，大小一样。

---

# ✔ 为什么会这样？
你的备份命令：
```bash
docker exec ... mysqldump ... | gzip > $MYSQL_BACKUP_FILE
```

在极短时间内：
1. 脚本生成时间 `DATE=140659`
2. 开始写入 `mysql_140659.sql.gz`
3. 因为 **gzip 压缩 + 管道流**，系统**文件句柄未及时释放**
4. 脚本日志输出 `tee` 又刷新了输出缓冲区
5. 系统瞬间**又创建了一个新文件**（140701）

→ **最终只有一个是完整备份，另一个是空/不完整文件**

---

# ✔ 终极修复（彻底杜绝重复文件）
我给你**最稳定、不会生成双文件**的写法，直接替换你脚本里的**备份命令**：

## 原来的（会出问题）
```bash
docker exec $MYSQL_CONTAINER mysqldump -u$MYSQL_USER -p$MYSQL_PWD --all-databases --single-transaction --quick --lock-tables=false 2>/dev/null | gzip > $MYSQL_BACKUP_FILE
```

## 改成下面这个（100% 不会重复生成）
```bash
# 先备份到临时文件，再压缩，避免管道流导致重复文件
TMP_SQL="$MYSQL_BACKUP_DIR/temp_$DATE.sql"

docker exec $MYSQL_CONTAINER mysqldump -u$MYSQL_USER -p$MYSQL_PWD --all-databases --single-transaction --quick --lock-tables=false 2>/dev/null > "$TMP_SQL"

# 压缩
gzip "$TMP_SQL"

# 重命名为最终备份文件
mv "$TMP_SQL.gz" "$MYSQL_BACKUP_FILE"
```

### 优点：
1. **先生成临时 SQL**
2. **再压缩**
3. **最后重命名**
→ **绝对不会出现两个备份文件**

---

# ✔ 为什么你的日志也会“看起来两次”？
因为：
```
log "开始备份 MySQL..."
```
输出一次日志

然后执行：
```
mysqldump | gzip > file
```
这个过程中**标准输出/标准错误**又被**tee 捕获一次**，导致日志重复打印。

---

# ✔ 最终完整稳定备份代码（直接复制替换）
```bash
# 1. 备份 MySQL
log "开始备份 MySQL..."
MYSQL_BACKUP_DIR="$BACKUP_ROOT/mysql"
MYSQL_BACKUP_FILE="$MYSQL_BACKUP_DIR/mysql_$DATE.sql.gz"
TMP_SQL="$MYSQL_BACKUP_DIR/temp_$DATE.sql"

# 先生成 SQL 再压缩，避免双文件
docker exec $MYSQL_CONTAINER mysqldump -u$MYSQL_USER -p$MYSQL_PWD --all-databases --single-transaction --quick --lock-tables=false 2>/dev/null > "$TMP_SQL"

gzip "$TMP_SQL"
mv "$TMP_SQL.gz" "$MYSQL_BACKUP_FILE"

if [ $? -eq 0 ]; then
    log "MySQL 备份成功：$MYSQL_BACKUP_FILE"
    log "备份大小：$(du -h $MYSQL_BACKUP_FILE | awk '{print $1}')"
else
    log "MySQL 备份失败！"
    exit 1
fi
```

---

# ✔ 总结（一句话记住）
## **一次执行出现两个备份文件 = 管道流 gzip 导致的临时文件现象**
## **用「先导出→再压缩→最后重命名」的方式，100% 解决！**

你把上面那段替换你原来的备份代码，**立刻不再重复生成文件**。

需要我帮你把**整个最终稳定版脚本一次性发给你**吗？

````



> 最终版本
```bash


#!/bin/bash
########################### 【请修改这里】###########################
# MySQL 配置
MYSQL_CONTAINER="yzt_mysql"
MYSQL_USER="root"
MYSQL_PWD="ninuo401"

# 保留备份天数
KEEP_DAYS=7

# 备份根目录
BACKUP_ROOT="./backup-data"
#####################################################################

# 固定时间戳
DATE=$(date +%Y%m%d_%H%M%S)
# 日志写入【当前脚本所在文件夹】
LOG_FILE="./backup_${DATE}.log"

# 日志打印 + 写入文件
log() {
    echo "[$(date +%Y-%m-%d\ %H:%M:%S)] $1" | tee -a "${LOG_FILE}"
}

log "==================== 开始备份 ===================="

# 自动创建备份目录
mkdir -p "${BACKUP_ROOT}/mysql"

# MySQL 备份
log "开始备份 MySQL 数据库..."
MYSQL_BACKUP_DIR="${BACKUP_ROOT}/mysql"
FINAL_FILE="${MYSQL_BACKUP_DIR}/mysql_${DATE}.sql.gz"
TMP_SQL="${MYSQL_BACKUP_DIR}/tmp_${DATE}.sql"

# 1. 先纯导出 sql（无管道、无并发，避免双文件）
docker exec "${MYSQL_CONTAINER}" \
mysqldump -u"${MYSQL_USER}" -p"${MYSQL_PWD}" \
--all-databases \
--single-transaction \
--quick \
--lock-tables=false 2>/dev/null > "${TMP_SQL}"

# 2. 压缩
if [ $? -eq 0 ];then
    gzip "${TMP_SQL}"
    # 3. 重命名为正式备份文件
    mv "${TMP_SQL}.gz" "${FINAL_FILE}"

    log "MySQL 备份成功：${FINAL_FILE}"
    log "备份文件大小：$(du -h "${FINAL_FILE}" | awk '{print $1}')"
else
    log "MySQL 导出失败！"
    exit 1
fi

# 清理过期备份
log "开始清理 ${KEEP_DAYS} 天前旧备份..."
# 清理mysql压缩包
find "${BACKUP_ROOT}/mysql" -type f -name "mysql_*.sql.gz" -mtime +${KEEP_DAYS} -delete
# 清理当前目录15天旧日志
find . -maxdepth 1 -type f -name "backup_*.log" -mtime +15 -delete
# 清理残留临时sql
find "${BACKUP_ROOT}/mysql" -type f -name "tmp_*.sql*" -delete

log "过期文件清理完成"
log "==================== 备份全部完成 ===================="
```