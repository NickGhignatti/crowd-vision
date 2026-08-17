#![allow(dead_code)]

pub mod fakes;
pub mod test_app;

use sqlx::{Connection, Executor, PgConnection, PgPool};
use std::env;

pub fn admin_url() -> String {
    env::var("DATABASE_URL").expect("DATABASE_URL is set by docker-compose.test.yml")
}

pub async fn fresh_db(label: &str) -> PgPool {
    let name = format!("telemetry_{label}_{}", uuid::Uuid::new_v4().simple());
    let admin = admin_url();

    let mut connection = PgConnection::connect(&admin)
        .await
        .expect("connect as admin");
    connection
        .execute(sqlx::AssertSqlSafe(format!(r#"create database "{name}""#)))
        .await
        .expect("create database");

    let url = match admin.rsplit_once('/') {
        Some((prefix, _)) => format!("{prefix}/{name}"),
        None => panic!("DATABASE_URL has no database segment"),
    };

    let pool = PgPool::connect(&url)
        .await
        .expect("connect to fresh database");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrations apply");
    pool
}

pub async fn seed_building(pool: &PgPool, building_id: &str, rooms: &[&str]) {
    sqlx::query("insert into buildings (id, name) values ($1, $1)")
        .bind(building_id)
        .execute(pool)
        .await
        .expect("seed building");
    for room in rooms {
        sqlx::query("insert into building_rooms (building_id, room_id, name) values ($1, $2, $2)")
            .bind(building_id)
            .bind(room)
            .execute(pool)
            .await
            .expect("seed room");
    }
}
