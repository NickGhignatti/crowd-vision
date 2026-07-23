# Build context is the repo root — see server/tenancy-service/Dockerfile.
FROM golang:1.25-bookworm AS base
WORKDIR /app
COPY server/provisioner ./server/provisioner
WORKDIR /app/server/provisioner

FROM base AS dev
RUN go install github.com/air-verse/air@v1.67.1
CMD ["air", "-c", ".air.toml"]

FROM base AS builder
RUN CGO_ENABLED=0 go build -o /out/provisioner ./cmd/provisioner

FROM gcr.io/distroless/static-debian12:nonroot AS production
COPY --from=builder /out/provisioner /usr/local/bin/provisioner

EXPOSE 3000
CMD ["provisioner"]
