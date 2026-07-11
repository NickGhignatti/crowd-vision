# Build context is the repo root (see docker-compose.yml) — tenancy-service
# depends on sibling Go modules (auth-contracts, auth-middleware, auth-policy)
# via a local `replace` directive (no package registry yet; the same
# transitional tradeoff the Node services' Dockerfile docs already describe
# for `file:` deps). COPY paths below are relative to that wider root context.
FROM golang:1.25-bookworm AS base
WORKDIR /app
COPY server/auth-contracts ./server/auth-contracts
COPY server/auth-middleware ./server/auth-middleware
COPY server/auth-policy ./server/auth-policy
COPY server/tenancy-service ./server/tenancy-service
WORKDIR /app/server/tenancy-service

FROM base AS dev
RUN go install github.com/air-verse/air@latest
CMD ["air", "-c", ".air.toml"]

FROM base AS builder
RUN CGO_ENABLED=0 go build -o /out/tenancy-service ./cmd/tenancy

FROM gcr.io/distroless/static-debian12 AS production
WORKDIR /app
COPY --from=builder /out/tenancy-service /usr/local/bin/tenancy-service
COPY server/tenancy-service/migrations ./migrations

EXPOSE 3000
CMD ["tenancy-service"]
