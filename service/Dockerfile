FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/diary ./cmd/server && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/password-hash ./cmd/password-hash

FROM alpine:3.23
RUN apk add --no-cache ca-certificates && addgroup -g 10001 diary && adduser -D -H -u 10001 -G diary diary
COPY --from=build /out/diary /usr/local/bin/diary
COPY --from=build /out/password-hash /usr/local/bin/password-hash
USER 10001:10001
WORKDIR /app
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/diary"]
