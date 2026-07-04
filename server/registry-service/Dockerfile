# Build context is the repo root — see server/tenancy-service/Dockerfile for
# why (sibling Go module dependencies via a local `replace`, not a registry yet).
FROM golang:1.25-bookworm AS base
WORKDIR /app
COPY server/registry-service ./server/registry-service
WORKDIR /app/server/registry-service

FROM base AS dev
RUN go install github.com/air-verse/air@latest
CMD ["air", "-c", ".air.toml"]

FROM base AS builder
RUN CGO_ENABLED=0 go build -o /out/registry-service ./cmd/registry

FROM gcr.io/distroless/static-debian12 AS production
WORKDIR /app
COPY --from=builder /out/registry-service /usr/local/bin/registry-service
COPY server/registry-service/migrations ./migrations

EXPOSE 3000
CMD ["registry-service"]
