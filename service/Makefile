.PHONY: run build test lint clean tidy

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
