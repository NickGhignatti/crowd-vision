package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

func (p *Postgres) Pool() *pgxpool.Pool {
	return p.pool
}

func (p *Postgres) Create(ctx context.Context, org Organization) (Organization, error) {
	err := p.pool.QueryRow(ctx, `
		insert into organizations (name, display_name, tier, host, identity_mode, issuer, license_status, status)
		values ($1, $2, $3, nullif($4, ''), $5, nullif($6, ''), $7, $8)
		returning id`,
		org.Name, org.DisplayName, org.Tier, org.Host, org.IdentityMode, org.Issuer, org.LicenseStatus, org.Status,
	).Scan(&org.ID)
	return org, err
}

func (p *Postgres) Get(ctx context.Context, id string) (Organization, error) {
	var org Organization
	err := p.pool.QueryRow(ctx, `
		select id, name, display_name, tier, coalesce(host,''), identity_mode,
		       coalesce(issuer,''), license_status, status, coalesce(status_detail,'')
		from organizations where id = $1`, id,
	).Scan(&org.ID, &org.Name, &org.DisplayName, &org.Tier, &org.Host, &org.IdentityMode,
		&org.Issuer, &org.LicenseStatus, &org.Status, &org.StatusDetail)
	if errors.Is(err, pgx.ErrNoRows) {
		return Organization{}, ErrNotFound
	}
	return org, err
}

func (p *Postgres) Pending(ctx context.Context) ([]Organization, error) {
	rows, err := p.pool.Query(ctx, `
		select id, name, display_name, tier, coalesce(host,''), identity_mode,
		       coalesce(issuer,''), license_status, status, coalesce(status_detail,'')
		from organizations where status = 'provisioning'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Organization
	for rows.Next() {
		var org Organization
		if err := rows.Scan(&org.ID, &org.Name, &org.DisplayName, &org.Tier, &org.Host, &org.IdentityMode,
			&org.Issuer, &org.LicenseStatus, &org.Status, &org.StatusDetail); err != nil {
			return nil, err
		}
		out = append(out, org)
	}
	return out, rows.Err()
}

func (p *Postgres) SetStatus(ctx context.Context, id, status, detail string) error {
	tag, err := p.pool.Exec(ctx,
		`update organizations set status = $2, status_detail = nullif($3, '') where id = $1`,
		id, status, detail)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) SetLicenseStatus(ctx context.Context, id, licenseStatus string) error {
	tag, err := p.pool.Exec(ctx,
		`update organizations set license_status = $2 where id = $1`, id, licenseStatus)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

var _ Store = (*Postgres)(nil)
