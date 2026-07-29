FROM golang:1.25-bookworm AS base
WORKDIR /app
COPY backend/auth-contracts ./backend/auth-contracts
COPY backend/auth-middleware ./backend/auth-middleware
COPY backend/auth-policy ./backend/auth-policy
COPY backend/tenancy-service ./backend/tenancy-service
WORKDIR /app/backend/tenancy-service

FROM base AS dev
RUN go install github.com/air-verse/air@v1.67.1
CMD ["air", "-c", ".air.toml"]

FROM base AS builder
RUN CGO_ENABLED=0 go build -o /out/tenancy-service ./cmd/tenancy

FROM gcr.io/distroless/static-debian12:nonroot AS production
WORKDIR /app
COPY --from=builder /out/tenancy-service /usr/local/bin/tenancy-service
COPY backend/tenancy-service/migrations ./migrations

EXPOSE 3000
CMD ["tenancy-service"]
