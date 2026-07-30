//! The second driving adapter: a loop that runs the provisioning use case over
//! and over. It knows nothing about queues or databases -- only that there may
//! or may not be work.

use std::sync::Arc;
use std::time::Duration;

use crate::service::provisioning::Provisioning;

// Long enough to cover a provisioning run blocked on downstream HTTP, short
// enough that a dead worker's uploads get picked up while the caller still waits.
const LEASE: Duration = Duration::from_secs(30);

// ponytail: polling, not a change stream -- one findAndModify per idle tick per
// worker. Swap for a broker consumer when Kafka lands.
const IDLE_POLL: Duration = Duration::from_millis(50);

pub fn spawn(provisioning: Arc<Provisioning>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match provisioning.provision_next(LEASE).await {
                Ok(true) => {}
                Ok(false) => tokio::time::sleep(IDLE_POLL).await,
                Err(e) => {
                    // Reaching the queue failed; provisioning failures are an
                    // outcome recorded against the upload, not an error here.
                    log::error!("provisioning loop stalled: {e:?}");
                    tokio::time::sleep(IDLE_POLL).await;
                }
            }
        }
    })
}
