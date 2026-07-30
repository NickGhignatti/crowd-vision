
use std::sync::Arc;
use std::time::Duration;

use crate::service::provisioning::Provisioning;

const LEASE: Duration = Duration::from_secs(30);

const IDLE_POLL: Duration = Duration::from_millis(50);

pub fn spawn(provisioning: Arc<Provisioning>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match provisioning.provision_next(LEASE).await {
                Ok(true) => {}
                Ok(false) => tokio::time::sleep(IDLE_POLL).await,
                Err(e) => {
                    log::error!("provisioning loop stalled: {e:?}");
                    tokio::time::sleep(IDLE_POLL).await;
                }
            }
        }
    })
}
