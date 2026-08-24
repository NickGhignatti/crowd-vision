FROM golang:1.25-bookworm AS base
WORKDIR /app
COPY backend/auth-contracts ./backend/auth-contracts
COPY backend/registry-service ./backend/registry-service
WORKDIR /app/backend/registry-service

FROM base AS dev
RUN go install github.com/air-verse/air@v1.67.1
CMD ["air", "-c", ".air.toml"]

FROM base AS builder
RUN CGO_ENABLED=0 go build -o /out/registry-service ./cmd/registry

FROM gcr.io/distroless/static-debian12:nonroot AS production
WORKDIR /app
COPY --from=builder /out/registry-service /usr/local/bin/registry-service
COPY backend/registry-service/migrations ./migrations

EXPOSE 3000
CMD ["registry-service"]
