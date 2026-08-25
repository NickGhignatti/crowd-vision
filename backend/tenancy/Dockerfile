FROM golang:1.25-bookworm AS base
WORKDIR /app
COPY backend/libs/auth-contracts ./backend/libs/auth-contracts
COPY backend/libs/auth-middleware ./backend/libs/auth-middleware
COPY backend/libs/auth-policy ./backend/libs/auth-policy
COPY backend/tenancy ./backend/tenancy
WORKDIR /app/backend/tenancy

FROM base AS dev
RUN go install github.com/air-verse/air@v1.67.1
CMD ["air", "-c", ".air.toml"]

FROM base AS builder
RUN CGO_ENABLED=0 go build -o /out/tenancy ./cmd/tenancy

FROM gcr.io/distroless/static-debian12:nonroot AS production
WORKDIR /app
COPY --from=builder /out/tenancy /usr/local/bin/tenancy
COPY backend/tenancy/migrations ./migrations

EXPOSE 3000
CMD ["tenancy"]
