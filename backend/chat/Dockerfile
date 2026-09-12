FROM rust-base AS chef
WORKDIR /app/backend/chat

# ── capture the dependency graph ────────────────────────────────────────
FROM chef AS planner
COPY schemas/claims-schema /app/schemas/claims-schema
COPY backend/chat .
RUN cargo chef prepare --recipe-path recipe.json

# Debug-profile dependencies, shared by the `test` and `dev` stages below.
FROM chef AS debug-deps
COPY --from=planner /app/backend/chat/recipe.json recipe.json
COPY schemas/claims-schema /app/schemas/claims-schema
RUN cargo chef cook --recipe-path recipe.json

FROM debug-deps AS test
COPY backend/chat .

FROM debug-deps AS dev
COPY backend/chat .
CMD ["cargo", "watch", "-x", "run"]

FROM chef AS builder
COPY --from=planner /app/backend/chat/recipe.json recipe.json
COPY schemas/claims-schema /app/schemas/claims-schema
RUN cargo chef cook --release --recipe-path recipe.json
COPY backend/chat .
RUN cargo build --release

FROM gcr.io/distroless/cc-debian12:nonroot AS production
# Distroless: no shell, no package manager, patched upstream - so the cd-registry Trivy
# scan needs no apt-get upgrade step here. ca-certificates and libssl ship in the base
# image; zlib does not.
COPY --from=builder /app/backend/chat/target/release/chat /usr/local/bin/chat

EXPOSE 3000
CMD ["/usr/local/bin/chat"]
