FROM rust-base AS chef
WORKDIR /app/backend/dashboard

# ── capture the dependency graph ────────────────────────────────────────
FROM chef AS planner
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/claims-schema /app/schemas/claims-schema
COPY backend/dashboard .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS dev
COPY --from=planner /app/backend/dashboard/recipe.json recipe.json
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/claims-schema /app/schemas/claims-schema
RUN cargo chef cook --recipe-path recipe.json
COPY backend/dashboard .
CMD ["cargo", "watch", "-x", "run"]

FROM chef AS builder
COPY --from=planner /app/backend/dashboard/recipe.json recipe.json
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/claims-schema /app/schemas/claims-schema
RUN cargo chef cook --release --recipe-path recipe.json
COPY backend/dashboard .
RUN cargo build --release

FROM gcr.io/distroless/cc-debian12:nonroot AS production
# Distroless: no shell, no package manager, patched upstream - so the cd-registry Trivy
# scan needs no apt-get upgrade step here. ca-certificates and libssl ship in the base
# image; zlib does not.
COPY --from=builder /app/backend/dashboard/target/release/dashboard /usr/local/bin/dashboard

EXPOSE 3000
CMD ["/usr/local/bin/dashboard"]
