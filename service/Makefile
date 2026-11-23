# 镜像仓库配置
REGISTRY    ?= registry.cn-zhangjiakou.aliyuncs.com
NAMESPACE   ?= pub_zq
REPOSITORY  ?= private_service
IMAGE       := $(REGISTRY)/$(NAMESPACE)/$(REPOSITORY)
TAG         ?= latest
IMAGE_ID    := $(IMAGE):$(TAG)
# 本机无 docker，使用 podman（兼容 docker build/tag/push）
DOCKER      ?= podman

.PHONY: run build test tidy clean publish build-image

# 运行服务（需要 config.yaml 存在）
run:
	go run ./cmd/server -config config.yaml

# 构建二进制
build:
	go build -o bin/server ./cmd/server
	go build -o bin/password-hash ./cmd/password-hash

# 运行测试
test:
	go test ./...

# 整理依赖
tidy:
	go mod tidy

# 清理构建产物
clean:
	rm -rf bin

# 打包镜像并推送（make publish TAG=1.0.0）
publish: build-image
	$(DOCKER) tag $(IMAGE_ID) $(IMAGE):latest
	$(DOCKER) push $(IMAGE):$(TAG)
	$(DOCKER) push $(IMAGE):latest
	@echo "已推送 $(IMAGE):$(TAG)"

# 构建镜像（服务器为 amd64，跨架构构建）
build-image:
	$(DOCKER) build --platform linux/amd64 -t $(IMAGE_ID) .
