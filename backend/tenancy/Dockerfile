FROM golang:1.27-bookworm AS tools
ARG TARGETARCH
ARG AIR_VERSION=1.67.1
# Prebuilt, checksum-pinned: `go install` compiled air in all four Go images. This stage is
# byte-identical in each, so BuildKit builds it once and every dev stage copies the binary.
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) air_sha=b9c1856a3fb3a7eedb8f632508957ee0800e16040f7829e0f610d4adba59a4d8;; \
      arm64) air_sha=6d1b6eeb024b02f5d28efe56af2f82a01bc89c3c06abf090b34b85b45394e698;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1;; \
    esac; \
    curl -fsSL -o /tmp/air.tar.gz \
      "https://github.com/air-verse/air/releases/download/v${AIR_VERSION}/air_${AIR_VERSION}_linux_${TARGETARCH}.tar.gz"; \
    echo "${air_sha}  /tmp/air.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/air.tar.gz -C /usr/local/bin air; \
    rm -f /tmp/air.tar.gz; \
    air -v

FROM golang:1.27-bookworm AS base
WORKDIR /app
COPY backend/libs/auth-contracts ./backend/libs/auth-contracts
COPY backend/libs/auth-middleware ./backend/libs/auth-middleware
COPY backend/libs/auth-policy ./backend/libs/auth-policy
COPY backend/tenancy ./backend/tenancy
WORKDIR /app/backend/tenancy

FROM base AS dev
COPY --from=tools /usr/local/bin/air /usr/local/bin/air
CMD ["air", "-c", ".air.toml"]

FROM base AS builder
RUN CGO_ENABLED=0 go build -o /out/tenancy ./cmd/tenancy

FROM gcr.io/distroless/static-debian12:nonroot AS production
WORKDIR /app
COPY --from=builder /out/tenancy /usr/local/bin/tenancy
COPY backend/tenancy/migrations ./migrations

EXPOSE 3000
CMD ["tenancy"]
