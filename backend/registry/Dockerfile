FROM golang:1.25-bookworm AS base
WORKDIR /app
COPY backend/libs/auth-contracts ./backend/libs/auth-contracts
COPY backend/registry ./backend/registry
WORKDIR /app/backend/registry

FROM base AS dev
RUN go install github.com/air-verse/air@v1.67.1
CMD ["air", "-c", ".air.toml"]

FROM base AS builder
RUN CGO_ENABLED=0 go build -o /out/registry ./cmd/registry

FROM gcr.io/distroless/static-debian12:nonroot AS production
WORKDIR /app
COPY --from=builder /out/registry /usr/local/bin/registry
COPY backend/registry/migrations ./migrations

EXPOSE 3000
CMD ["registry"]
