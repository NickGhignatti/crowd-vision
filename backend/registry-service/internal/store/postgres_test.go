//go:build integration

// Integration tests against a real Postgres via testcontainers-go, mirroring tenancy-service's
// suite. Run with: go test -tags=integration ./internal/store/...
package store_test

import (
	"context"
	"testing"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/NickGhignatti/crowd-vision/server/registry-service/internal/store"
)

func newTestStore(t *testing.T) *store.Postgres {
	t.Helper()
	ctx := context.Background()

	container, err := tcpostgres.Run(ctx, "postgres:17-alpine",
		tcpostgres.WithDatabase("registry_test"),
		tcpostgres.WithUsername("test"),
		tcpostgres.WithPassword("test"),
		tcpostgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatalf("starting postgres container: %v", err)
	}
	t.Cleanup(func() { _ = container.Terminate(ctx) })

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}

	m, err := migrate.New("file://../../migrations", dsn)
	if err != nil {
		t.Fatalf("loading migrations: %v", err)
	}
	if err := m.Up(); err != nil {
		t.Fatalf("running migrations: %v", err)
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connecting pool: %v", err)
	}
	t.Cleanup(pool.Close)

	return store.NewPostgres(pool)
}

func TestPostgres_CreateAndGet(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	created, err := st.Create(ctx, store.Organization{
		Name: "unibo", DisplayName: "UniBO", Tier: "pooled",
		IdentityMode: "byo-idp", LicenseStatus: "active", Status: "provisioning",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.ID == "" {
		t.Fatal("expected a generated id")
	}

	got, err := st.Get(ctx, created.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Name != "unibo" || got.IdentityMode != "byo-idp" {
		t.Fatalf("got %+v", got)
	}
}

func TestPostgres_Get_NotFound(t *testing.T) {
	st := newTestStore(t)
	_, err := st.Get(context.Background(), "00000000-0000-0000-0000-000000000000")
	if err != store.ErrNotFound {
		t.Fatalf("got %v, want ErrNotFound", err)
	}
}

func TestPostgres_UniqueNameConstraint(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	org := store.Organization{Name: "acme", DisplayName: "Acme", Tier: "pooled", IdentityMode: "platform", LicenseStatus: "active", Status: "provisioning"}
	if _, err := st.Create(ctx, org); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := st.Create(ctx, org); err == nil {
		t.Fatal("expected a unique constraint violation on duplicate name")
	}
}

func TestPostgres_Pending_OnlyReturnsProvisioningOrgs(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	pending, _ := st.Create(ctx, store.Organization{Name: "pending-org", DisplayName: "P", Tier: "pooled", IdentityMode: "platform", LicenseStatus: "active", Status: "provisioning"})
	ready, _ := st.Create(ctx, store.Organization{Name: "ready-org", DisplayName: "R", Tier: "pooled", IdentityMode: "platform", LicenseStatus: "active", Status: "provisioning"})
	if err := st.SetStatus(ctx, ready.ID, "ready", ""); err != nil {
		t.Fatalf("set status: %v", err)
	}

	orgs, err := st.Pending(ctx)
	if err != nil {
		t.Fatalf("pending: %v", err)
	}
	if len(orgs) != 1 || orgs[0].ID != pending.ID {
		t.Fatalf("got %+v, want only the pending org", orgs)
	}
}

func TestPostgres_SetStatus_NotFound(t *testing.T) {
	st := newTestStore(t)
	err := st.SetStatus(context.Background(), "00000000-0000-0000-0000-000000000000", "ready", "")
	if err != store.ErrNotFound {
		t.Fatalf("got %v, want ErrNotFound", err)
	}
}
