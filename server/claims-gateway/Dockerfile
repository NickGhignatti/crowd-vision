# Build context is the repo root — see server/tenancy-service/Dockerfile for
# why (sibling Go module dependency via a local `replace`, not a registry yet).
FROM golang:1.25-bookworm AS base
WORKDIR /app
COPY server/auth-contracts ./server/auth-contracts
COPY server/auth-middleware ./server/auth-middleware
COPY server/claims-gateway ./server/claims-gateway
WORKDIR /app/server/claims-gateway

FROM base AS dev
RUN go install github.com/air-verse/air@latest
CMD ["air", "-c", ".air.toml"]

FROM base AS builder
RUN CGO_ENABLED=0 go build -o /out/claims-gateway ./cmd/gateway

FROM gcr.io/distroless/static-debian12 AS production
COPY --from=builder /out/claims-gateway /usr/local/bin/claims-gateway

EXPOSE 3000
CMD ["claims-gateway"]
