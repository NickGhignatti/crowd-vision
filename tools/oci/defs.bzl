load("@rules_oci//oci:defs.bzl", "oci_image")
load("@rules_pkg//pkg:tar.bzl", "pkg_tar")

def service_image(name, binary, base = "@distroless_static_nonroot", migrations = None, port = 3000):
    """Builds an oci_image running `binary` from /app on the given distroless base.

    Args:
        name: target name for the resulting oci_image.
        binary: label of the go_binary/rust_binary to run as the entrypoint.
        base: label of the pulled base image. Statically-linked Go binaries use
            the minimal "static" distroless variant (the default); binaries
            linking a system TLS backend (e.g. Rust services using reqwest's
            default TLS) need the "cc" variant instead, which bundles glibc +
            ca-certificates.
        migrations: optional label of a filegroup of SQL migrations, laid out
            at /app/migrations (read via a `file://migrations` relative path
            by services that run their own migrations at startup).
        port: TCP port the service listens on.
    """
    # Linux/CI-only: rules_oci's oci_image (and rules_pkg's pkg_tar) don't build on native
    # Windows today. `manual` keeps these out of `bazel build/test //...` wildcard expansion so a Windows
    # dev's normal build isn't broken by them; `bazel build //path/to:image` still works
    # explicitly, e.g. on Linux or CI.
    tars = [name + "_bin_tar"]
    pkg_tar(
        name = name + "_bin_tar",
        srcs = [binary],
        package_dir = "/usr/local/bin",
        tags = ["manual"],
    )

    if migrations:
        tars.append(name + "_migrations_tar")
        pkg_tar(
            name = name + "_migrations_tar",
            srcs = [migrations],
            package_dir = "/app/migrations",
            tags = ["manual"],
        )

    oci_image(
        name = name,
        base = base,
        tars = [":" + t for t in tars],
        entrypoint = ["/usr/local/bin/" + binary.split(":")[-1]],
        exposed_ports = ["{}/tcp".format(port)],
        workdir = "/app",
        tags = ["manual"],
    )
