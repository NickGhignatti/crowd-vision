FROM rust-base AS chef
WORKDIR /app/backend/notification

# ── capture the dependency graph ────────────────────────────────────────
FROM chef AS planner
COPY schemas/claims-schema /app/schemas/claims-schema
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/notification-schema /app/schemas/notification-schema
COPY backend/notification .
RUN cargo chef prepare --recipe-path recipe.json

# Debug-profile dependencies, shared by the `test` and `dev` stages below.
FROM chef AS debug-deps
COPY --from=planner /app/backend/notification/recipe.json recipe.json
COPY schemas/claims-schema /app/schemas/claims-schema
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/notification-schema /app/schemas/notification-schema
RUN --mount=type=cache,target=/sccache,sharing=shared \
    RUSTC_WRAPPER=sccache SCCACHE_DIR=/sccache CARGO_INCREMENTAL=0 \
    cargo chef cook --recipe-path recipe.json

# Integration-test stage: deliberately does NOT install cargo-watch. It runs
# tests/*.rs once and exits, so compiling cargo-watch from source here is
# ~2 minutes of pure waste on every cold build.
FROM debug-deps AS test
COPY backend/notification .

FROM debug-deps AS dev
COPY backend/notification .
CMD ["cargo", "watch", "-x", "run"]

FROM chef AS builder
COPY --from=planner /app/backend/notification/recipe.json recipe.json
COPY schemas/claims-schema /app/schemas/claims-schema
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/notification-schema /app/schemas/notification-schema
RUN cargo chef cook --release --recipe-path recipe.json
COPY backend/notification .
RUN cargo build --release

FROM gcr.io/distroless/cc-debian12:nonroot AS production
# Distroless: no shell, no package manager, patched upstream - so the cd-registry Trivy
# scan needs no apt-get upgrade step here. ca-certificates and libssl ship in the base
# image; zlib does not.
COPY --from=builder /usr/lib/x86_64-linux-gnu/libz.so.1 /usr/lib/x86_64-linux-gnu/libz.so.1
COPY --from=builder /app/backend/notification/target/release/notification /usr/local/bin/notification

EXPOSE 3000
CMD ["/usr/local/bin/notification"]
