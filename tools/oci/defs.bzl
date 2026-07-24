"""Packages a Go binary onto the distroless static base, replacing the old
"inject a prebuilt binary into a Dockerfile" build (BAZEL_MIGRATION.md §3).
"""

load("@rules_oci//oci:defs.bzl", "oci_image")
load("@rules_pkg//pkg:tar.bzl", "pkg_tar")

def go_service_image(name, binary, migrations = None, port = 3000):
    """Builds an oci_image running `binary` from /app on the distroless nonroot base.

    Args:
        name: target name for the resulting oci_image.
        binary: label of the go_binary to run as the entrypoint.
        migrations: optional label of a filegroup of SQL migrations, laid out
            at /app/migrations (read via a `file://migrations` relative path
            by services that run their own migrations at startup).
        port: TCP port the service listens on.
    """
    # Linux/CI-only: rules_oci's oci_image (and rules_pkg's pkg_tar) don't build on native
    # Windows today (BAZEL_MIGRATION.md §7 — open upstream bugs, not a config issue here).
    # `manual` keeps these out of `bazel build/test //...` wildcard expansion so a Windows
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
        base = "@distroless_static_nonroot",
        tars = [":" + t for t in tars],
        entrypoint = ["/usr/local/bin/" + binary.split(":")[-1]],
        exposed_ports = ["{}/tcp".format(port)],
        workdir = "/app",
        tags = ["manual"],
    )
