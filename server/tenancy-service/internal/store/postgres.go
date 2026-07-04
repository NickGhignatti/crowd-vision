package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	pgUniqueViolation     = "23505"
	pgForeignKeyViolation = "23503"
)

type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

// Pool exposes the underlying pool for callers that manage their own
// lifecycle (main.go's shutdown) or tests exercising DB-level guarantees
// (e.g. the ON DELETE CASCADE from domains to memberships) that the Store
// interface deliberately doesn't surface as an application operation.
func (p *Postgres) Pool() *pgxpool.Pool {
	return p.pool
}

func (p *Postgres) DomainByName(ctx context.Context, name string) (Domain, error) {
	var d Domain
	var parentID *string
	err := p.pool.QueryRow(ctx,
		`select id, name, display_name, join_policy, parent_id, is_public from domains where name = $1`, name,
	).Scan(&d.ID, &d.Name, &d.DisplayName, &d.JoinPolicy, &parentID, &d.IsPublic)
	if errors.Is(err, pgx.ErrNoRows) {
		return Domain{}, ErrNotFound
	}
	if parentID != nil {
		d.ParentID = *parentID
	}
	return d, err
}

func (p *Postgres) CreateDomain(ctx context.Context, d Domain) (Domain, error) {
	var parentID *string
	if d.ParentID != "" {
		parentID = &d.ParentID
	}
	err := p.pool.QueryRow(ctx, `
		insert into domains (name, display_name, join_policy, parent_id, is_public)
		values ($1, $2, $3, $4, $5)
		returning id`,
		d.Name, d.DisplayName, d.JoinPolicy, parentID, d.IsPublic,
	).Scan(&d.ID)
	if isUniqueViolation(err) {
		return Domain{}, ErrAlreadyExists
	}
	if isForeignKeyViolation(err) {
		return Domain{}, ErrNotFound
	}
	return d, err
}

func (p *Postgres) SubdomainsOf(ctx context.Context, parentID string) ([]Domain, error) {
	rows, err := p.pool.Query(ctx,
		`select id, name, display_name, join_policy, parent_id, is_public from domains where parent_id = $1`, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Domain
	for rows.Next() {
		var d Domain
		var pid *string
		if err := rows.Scan(&d.ID, &d.Name, &d.DisplayName, &d.JoinPolicy, &pid, &d.IsPublic); err != nil {
			return nil, err
		}
		if pid != nil {
			d.ParentID = *pid
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// PublicDomains lists every is_public domain with its live member count in
// one query — the client's "browse domains" directory used to need a second
// round-trip (auth-service's /domains/member-counts); this folds it in.
func (p *Postgres) PublicDomains(ctx context.Context) ([]Domain, error) {
	rows, err := p.pool.Query(ctx, `
		select d.id, d.name, d.display_name, d.join_policy, d.parent_id, d.is_public,
			count(m.account_id)
		from domains d
		left join memberships m on m.domain_id = d.id
		where d.is_public
		group by d.id
		order by d.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Domain
	for rows.Next() {
		var d Domain
		var pid *string
		if err := rows.Scan(&d.ID, &d.Name, &d.DisplayName, &d.JoinPolicy, &pid, &d.IsPublic, &d.MemberCount); err != nil {
			return nil, err
		}
		if pid != nil {
			d.ParentID = *pid
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation
}

func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == pgForeignKeyViolation
}

func (p *Postgres) CreateInviteCode(ctx context.Context, ic InviteCode) (InviteCode, error) {
	err := p.pool.QueryRow(ctx, `
		insert into invite_codes (domain_id, code, role, created_by, expires_at)
		values ($1, $2, $3, $4, $5)
		returning id`,
		ic.DomainID, ic.Code, ic.Role, ic.CreatedBy, ic.ExpiresAt,
	).Scan(&ic.ID)
	return ic, err
}

// RedeemInviteCode is the one atomic write in this service: the WHERE
// clause (unredeemed, unexpired) and the UPDATE happen as a single
// statement, so two concurrent redemption attempts can't both succeed —
// exactly one gets the row back, the other gets 0 rows affected.
func (p *Postgres) RedeemInviteCode(ctx context.Context, code, accountID string) (InviteCode, error) {
	var ic InviteCode
	err := p.pool.QueryRow(ctx, `
		with redeemed as (
			update invite_codes
			set redeemed_by = $2, redeemed_at = now()
			where code = $1 and redeemed_by is null and expires_at > now()
			returning id, domain_id, role, created_by, expires_at
		)
		select redeemed.id, redeemed.domain_id, d.name, redeemed.role, redeemed.created_by, redeemed.expires_at
		from redeemed join domains d on d.id = redeemed.domain_id`,
		code, accountID,
	).Scan(&ic.ID, &ic.DomainID, &ic.DomainName, &ic.Role, &ic.CreatedBy, &ic.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return InviteCode{}, ErrInviteCodeInvalid
	}
	ic.Code, ic.RedeemedBy = code, accountID
	return ic, err
}

func (p *Postgres) UpsertMembership(ctx context.Context, m Membership) error {
	_, err := p.pool.Exec(ctx, `
		insert into memberships (account_id, domain_id, role, external_id, joined_via)
		values ($1, $2, $3, nullif($4, ''), $5)
		on conflict (account_id, domain_id)
		do update set role = excluded.role, external_id = excluded.external_id, joined_via = excluded.joined_via`,
		m.AccountID, m.DomainID, m.Role, m.ExternalID, m.JoinedVia,
	)
	return err
}

func (p *Postgres) DeleteMembership(ctx context.Context, accountID, domainID string) error {
	_, err := p.pool.Exec(ctx,
		`delete from memberships where account_id = $1 and domain_id = $2`, accountID, domainID)
	return err
}

func (p *Postgres) DeleteMembershipsForAccount(ctx context.Context, accountID string) error {
	_, err := p.pool.Exec(ctx, `delete from memberships where account_id = $1`, accountID)
	return err
}

func (p *Postgres) MembershipsFor(ctx context.Context, accountID string) ([]Membership, error) {
	rows, err := p.pool.Query(ctx, `
		select m.account_id, m.domain_id, d.name, m.role, coalesce(m.external_id, ''), m.joined_via
		from memberships m
		join domains d on d.id = m.domain_id
		where m.account_id = $1`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Membership
	for rows.Next() {
		var m Membership
		if err := rows.Scan(&m.AccountID, &m.DomainID, &m.DomainName, &m.Role, &m.ExternalID, &m.JoinedVia); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

var _ Store = (*Postgres)(nil)
