//go:build integration

// Integration tests against a real Postgres via testcontainers-go; the storefake can't verify
// the SQL itself. Run with: go test -tags=integration ./internal/store/...
package store_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/store"
)

func newTestStore(t *testing.T) *store.Postgres {
	t.Helper()
	ctx := context.Background()

	container, err := tcpostgres.Run(ctx, "postgres:17-alpine",
		tcpostgres.WithDatabase("tenancy_test"),
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

func TestPostgres_CreateDomainAndLookup(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	created, err := st.CreateDomain(ctx, store.Domain{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"})
	if err != nil {
		t.Fatalf("create domain: %v", err)
	}
	if created.ID == "" {
		t.Fatal("expected a generated id")
	}

	got, err := st.DomainByName(ctx, "unibo")
	if err != nil {
		t.Fatalf("lookup: %v", err)
	}
	if got.DisplayName != "UniBO" || got.JoinPolicy != "open-via-idp" {
		t.Fatalf("got %+v", got)
	}
}

func TestPostgres_RedeemInviteCode_ExactlyOneWinnerUnderRealConcurrency(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	d, err := st.CreateDomain(ctx, store.Domain{Name: "acme", DisplayName: "Acme", JoinPolicy: "invite-only"})
	if err != nil {
		t.Fatalf("create domain: %v", err)
	}
	ic, err := st.CreateInviteCode(ctx, store.InviteCode{
		DomainID: d.ID, Code: "race-code", Role: "business_staff",
		CreatedBy: "11111111-1111-1111-1111-111111111111", ExpiresAt: time.Now().Add(time.Hour),
	})
	if err != nil {
		t.Fatalf("create invite code: %v", err)
	}

	const attempts = 10
	var wg sync.WaitGroup
	successes := make([]bool, attempts)
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := st.RedeemInviteCode(ctx, ic.Code, uuidFor(i))
			successes[i] = err == nil
		}(i)
	}
	wg.Wait()

	won := 0
	for _, ok := range successes {
		if ok {
			won++
		}
	}
	if won != 1 {
		t.Fatalf("got %d successful redemptions out of %d concurrent attempts, want exactly 1", won, attempts)
	}
}

func uuidFor(i int) string {
	return fmt.Sprintf("aaaaaaaa-aaaa-aaaa-aaaa-%012d", i)
}

func TestPostgres_Subdomains_NestAndCascadeOnParentDelete(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	parent, err := st.CreateDomain(ctx, store.Domain{Name: "acme", DisplayName: "Acme", JoinPolicy: "invite-only"})
	if err != nil {
		t.Fatalf("create parent: %v", err)
	}
	sub, err := st.CreateDomain(ctx, store.Domain{Name: "acme-eng", DisplayName: "Eng", JoinPolicy: "invite-only", ParentID: parent.ID})
	if err != nil {
		t.Fatalf("create subdomain: %v", err)
	}

	subs, err := st.SubdomainsOf(ctx, parent.ID)
	if err != nil {
		t.Fatalf("subdomains of: %v", err)
	}
	if len(subs) != 1 || subs[0].ID != sub.ID {
		t.Fatalf("got %+v, want only the one subdomain", subs)
	}

	// Deleting the parent must cascade to the subdomain — the same
	// ON DELETE CASCADE philosophy as domains -> memberships.
	if _, err := st.Pool().Exec(ctx, `delete from domains where id = $1`, parent.ID); err != nil {
		t.Fatalf("delete parent: %v", err)
	}
	if _, err := st.DomainByName(ctx, "acme-eng"); err != store.ErrNotFound {
		t.Fatalf("got %v, want the subdomain to have cascaded away with its parent", err)
	}
}

func TestPostgres_CreateDomain_UnknownParentIsNotFound(t *testing.T) {
	st := newTestStore(t)
	_, err := st.CreateDomain(context.Background(), store.Domain{
		Name: "orphan", DisplayName: "Orphan", JoinPolicy: "invite-only", ParentID: "00000000-0000-0000-0000-000000000000",
	})
	if err != store.ErrNotFound {
		t.Fatalf("got %v, want ErrNotFound for a parent_id that doesn't exist", err)
	}
}

func TestPostgres_CreateDomain_DuplicateNameMapsToErrAlreadyExists(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	d := store.Domain{Name: "acme", DisplayName: "Acme", JoinPolicy: "invite-only"}
	if _, err := st.CreateDomain(ctx, d); err != nil {
		t.Fatalf("first create: %v", err)
	}

	_, err := st.CreateDomain(ctx, d)
	if err != store.ErrAlreadyExists {
		t.Fatalf("got %v, want ErrAlreadyExists (the real Postgres unique-violation code must map onto this sentinel)", err)
	}
}

func TestPostgres_DomainByName_NotFound(t *testing.T) {
	st := newTestStore(t)
	_, err := st.DomainByName(context.Background(), "ghost")
	if err != store.ErrNotFound {
		t.Fatalf("got %v, want ErrNotFound", err)
	}
}

func TestPostgres_UpsertMembership_IsIdempotent(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	d, _ := st.CreateDomain(ctx, store.Domain{Name: "acme", DisplayName: "Acme", JoinPolicy: "invite-only"})

	m := store.Membership{AccountID: "11111111-1111-1111-1111-111111111111", DomainID: d.ID, Role: "standard_customer", JoinedVia: "invite"}
	if err := st.UpsertMembership(ctx, m); err != nil {
		t.Fatalf("first upsert: %v", err)
	}
	m.Role = "business_admin"
	if err := st.UpsertMembership(ctx, m); err != nil {
		t.Fatalf("second upsert: %v", err)
	}

	rows, err := st.MembershipsFor(ctx, m.AccountID)
	if err != nil {
		t.Fatalf("lookup: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("got %d rows, want exactly 1 (upsert, not insert)", len(rows))
	}
	if rows[0].Role != "business_admin" {
		t.Fatalf("got role %q, want the updated role", rows[0].Role)
	}
}

func TestPostgres_DeleteDomain_CascadesMemberships(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	d, _ := st.CreateDomain(ctx, store.Domain{Name: "acme", DisplayName: "Acme", JoinPolicy: "invite-only"})
	accountID := "22222222-2222-2222-2222-222222222222"
	_ = st.UpsertMembership(ctx, store.Membership{AccountID: accountID, DomainID: d.ID, Role: "standard_customer", JoinedVia: "invite"})

	pool := st.Pool()
	if _, err := pool.Exec(ctx, `delete from domains where id = $1`, d.ID); err != nil {
		t.Fatalf("delete domain: %v", err)
	}

	rows, err := st.MembershipsFor(ctx, accountID)
	if err != nil {
		t.Fatalf("lookup: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("got %d rows, want the FK cascade to have removed them", len(rows))
	}
}

func TestPostgres_PublicDomains_OnlyPublicWithLiveMemberCounts(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	pub, err := st.CreateDomain(ctx, store.Domain{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp", IsPublic: true})
	if err != nil {
		t.Fatalf("create public domain: %v", err)
	}
	if _, err := st.CreateDomain(ctx, store.Domain{Name: "acme", DisplayName: "Acme", JoinPolicy: "invite-only"}); err != nil {
		t.Fatalf("create private domain: %v", err)
	}
	if err := st.UpsertMembership(ctx, store.Membership{AccountID: "11111111-1111-1111-1111-111111111111", DomainID: pub.ID, Role: "standard_customer", JoinedVia: "self-idp"}); err != nil {
		t.Fatalf("upsert membership: %v", err)
	}
	if err := st.UpsertMembership(ctx, store.Membership{AccountID: "22222222-2222-2222-2222-222222222222", DomainID: pub.ID, Role: "standard_customer", JoinedVia: "self-idp"}); err != nil {
		t.Fatalf("upsert membership: %v", err)
	}

	domains, err := st.PublicDomains(ctx)
	if err != nil {
		t.Fatalf("public domains: %v", err)
	}
	if len(domains) != 1 || domains[0].Name != "unibo" {
		t.Fatalf("got %+v, want only the public unibo domain", domains)
	}
	if domains[0].MemberCount != 2 {
		t.Fatalf("got member count %d, want 2", domains[0].MemberCount)
	}
}

func TestPostgres_DeleteMembershipsForAccount_ReapsAcrossDomains(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	d1, _ := st.CreateDomain(ctx, store.Domain{Name: "acme", DisplayName: "Acme", JoinPolicy: "invite-only"})
	d2, _ := st.CreateDomain(ctx, store.Domain{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"})
	accountID := "33333333-3333-3333-3333-333333333333"
	_ = st.UpsertMembership(ctx, store.Membership{AccountID: accountID, DomainID: d1.ID, Role: "business_admin", JoinedVia: "invite"})
	_ = st.UpsertMembership(ctx, store.Membership{AccountID: accountID, DomainID: d2.ID, Role: "standard_customer", JoinedVia: "self-idp"})

	if err := st.DeleteMembershipsForAccount(ctx, accountID); err != nil {
		t.Fatalf("reap: %v", err)
	}

	rows, err := st.MembershipsFor(ctx, accountID)
	if err != nil {
		t.Fatalf("lookup: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("got %d rows, want 0", len(rows))
	}
}
