# syntax=docker/dockerfile:1
ARG RUST_VERSION
FROM rust:${RUST_VERSION}-bookworm

ARG TARGETARCH
ARG CARGO_CHEF_VERSION=0.1.78
ARG CARGO_WATCH_VERSION=8.5.3

# build-essential is not optional: rdkafka-sys vendors librdkafka and compiles C,
# so a toolchain without a C compiler fails partway through the dependency build.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends mold build-essential \
    && rm -rf /var/lib/apt/lists/*

# Prebuilt, checksum-pinned binaries. Compiling cargo-watch from source cost 3202s
# across the six images in a cold build, for a byte-identical result.
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) arch=x86_64; \
             chef_sha=70ef940ef90d04d122f0176fdb8d6c39069191b484a1eaa29b327370c2e1c3c0; \
             watch_sha=b4366577bd16763c86820a750ead8a7bc5b838914b75ace05dc9896552e04e57;; \
      arm64) arch=aarch64; \
             chef_sha=a47e13fba89c2895f5a5c3d0844acd2a5fd416eceb3a6f9dfb26e28155099f4e; \
             watch_sha=a0dadc7b83e37e320a61d27d2a2c4c693f1ec737795805ed9d2960bc9462d7e7;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1;; \
    esac; \
    curl -fsSL -o /tmp/chef.tar.xz \
      "https://github.com/LukeMathWalker/cargo-chef/releases/download/v${CARGO_CHEF_VERSION}/cargo-chef-${arch}-unknown-linux-gnu.tar.xz"; \
    echo "${chef_sha}  /tmp/chef.tar.xz" | sha256sum -c -; \
    tar -xJf /tmp/chef.tar.xz -C "${CARGO_HOME}/bin" --strip-components=1 --wildcards '*/cargo-chef'; \
    curl -fsSL -o /tmp/watch.tar.xz \
      "https://github.com/watchexec/cargo-watch/releases/download/v${CARGO_WATCH_VERSION}/cargo-watch-v${CARGO_WATCH_VERSION}-${arch}-unknown-linux-gnu.tar.xz"; \
    echo "${watch_sha}  /tmp/watch.tar.xz" | sha256sum -c -; \
    tar -xJf /tmp/watch.tar.xz -C "${CARGO_HOME}/bin" --strip-components=1 --wildcards '*/cargo-watch'; \
    rm -f /tmp/chef.tar.xz /tmp/watch.tar.xz; \
    cargo-chef --version; \
    cargo watch --version

# mold links faster than GNU ld, and every stage that inherits this image gets it.
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"
