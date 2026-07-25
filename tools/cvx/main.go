// cvx is the dev-CLI absorbing the surviving Node glue scripts (compose orchestration, env
// generation, k8s secrets) behind `bazel run //tools/cvx -- ...`, off `mise exec -- node`.
// The scripts themselves stay on disk — cvx just knows how to invoke them.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

var envScripts = []string{
	"scripts/env/create.js",
	"scripts/env/vapid.js",
	"scripts/env/token.js",
	"scripts/env/config.js",
	"scripts/env/langfuse.js",
	"scripts/env/keycloak.js",
	"scripts/env/controlplane.js",
	"scripts/env/gateway-key.js",
}

// resolveStackArgs maps a cvx stack subcommand to compose-run.mjs's argv. dev-light is a cvx
// convenience alias (just stack.just's dev-light) for compose-run.mjs's own `dev agent` form.
func resolveStackArgs(mode string, rest []string) []string {
	if mode == "dev-light" {
		return []string{"dev", "agent"}
	}
	return append([]string{mode}, rest...)
}

// repoRoot resolves the source tree root so cvx behaves the same whether it's run as a plain
// binary from the repo root or via `bazel run`, which otherwise executes from the runfiles
// tree, not the caller's cwd.
func repoRoot() (string, error) {
	if d := os.Getenv("BUILD_WORKSPACE_DIRECTORY"); d != "" {
		return d, nil
	}
	return os.Getwd()
}

func runNode(root, script string, args ...string) error {
	cmd := exec.Command("node", append([]string{filepath.Join(root, filepath.FromSlash(script))}, args...)...)
	cmd.Dir = root
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

func exitCode(err error) int {
	if err == nil {
		return 0
	}
	if exitErr, ok := err.(*exec.ExitError); ok {
		return exitErr.ExitCode()
	}
	fmt.Fprintln(os.Stderr, "cvx:", err)
	return 1
}

func main() {
	root, err := repoRoot()
	if err != nil {
		fmt.Fprintln(os.Stderr, "cvx: cannot determine repo root:", err)
		os.Exit(1)
	}

	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: cvx <env|stack|k8s> ...")
		os.Exit(2)
	}

	switch os.Args[1] {
	case "env":
		for _, script := range envScripts {
			if err := runNode(root, script); err != nil {
				os.Exit(exitCode(err))
			}
		}
	case "stack":
		rest := os.Args[2:]
		if len(rest) == 0 {
			fmt.Fprintln(os.Stderr, "usage: cvx stack <dev|dev-build|dev-light|start|down|build|integration> [exclude...]")
			os.Exit(2)
		}
		args := resolveStackArgs(rest[0], rest[1:])
		os.Exit(exitCode(runNode(root, "scripts/compose/compose-run.mjs", args...)))
	case "k8s":
		if len(os.Args) < 3 || os.Args[2] != "secrets" {
			fmt.Fprintln(os.Stderr, "usage: cvx k8s secrets")
			os.Exit(2)
		}
		os.Exit(exitCode(runNode(root, "scripts/k8s/k8s-secrets.mjs")))
	default:
		fmt.Fprintln(os.Stderr, "cvx: unknown command", os.Args[1])
		os.Exit(2)
	}
}
