FROM golang:1.25-bookworm AS base
WORKDIR /app
COPY backend/auth-contracts ./backend/auth-contracts
COPY backend/auth-middleware ./backend/auth-middleware
COPY backend/claims-gateway ./backend/claims-gateway
WORKDIR /app/backend/claims-gateway

FROM base AS dev
RUN go install github.com/air-verse/air@v1.67.1
CMD ["air", "-c", ".air.toml"]

FROM base AS builder
RUN CGO_ENABLED=0 go build -o /out/claims-gateway ./cmd/gateway

FROM gcr.io/distroless/static-debian12:nonroot AS production
COPY --from=builder /out/claims-gateway /usr/local/bin/claims-gateway

EXPOSE 3000
CMD ["claims-gateway"]
