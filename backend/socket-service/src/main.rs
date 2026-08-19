use std::time::Duration;

use socket_service::shell::server::{PORT, max_socket_lifetime, redis_url, serve, twin_url};
use tokio::signal::unix::{SignalKind, signal};

const SHUTDOWN_GRACE: Duration = Duration::from_secs(10);

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", PORT)).await?;
    serve(
        listener,
        redis_url(),
        twin_url(),
        max_socket_lifetime(),
        shutdown_signal(),
    )
    .await?;

    Ok(())
}

async fn shutdown_signal() {
    let mut terminate = signal(SignalKind::terminate()).expect("SIGTERM handler is installable");

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = terminate.recv() => {}
    }

    tokio::spawn(async {
        tokio::time::sleep(SHUTDOWN_GRACE).await;
        std::process::exit(1);
    });
}
