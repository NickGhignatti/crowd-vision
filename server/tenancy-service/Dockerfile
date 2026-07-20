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
