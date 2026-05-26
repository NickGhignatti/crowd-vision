FROM rust:1.88-bookworm AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim AS production
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates=20230311+deb12u1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/contracts-service /usr/local/bin/contracts-service

EXPOSE 3000
CMD ["contracts-service"]
