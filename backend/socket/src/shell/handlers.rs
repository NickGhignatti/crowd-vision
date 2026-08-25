use std::fmt;
use std::sync::Arc;
use std::time::Instant;

use socketioxide::SocketIo;
use socketioxide::extract::{AckSender, Data, Extension, SocketRef, State};

use crate::core::auth::{CLAIMS_HEADER, Identity, authenticate_claims_header, may_read_building};
use crate::core::relay::{Delivery, Target};
use crate::core::rooms::{room_for_building, room_for_domain};
use crate::core::subscription::{Subscription, ack};
use crate::shell::metrics::{
    CONNECTED_CLIENTS, CONNECTIONS_REJECTED_TOTAL, SUBSCRIPTIONS_REJECTED_TOTAL,
};
use crate::shell::twin::BuildingDomains;

#[derive(Debug, Clone)]
pub struct ClaimsHeader(pub String);

#[derive(Debug, Clone, Copy)]
pub struct ConnectedAt(pub Instant);

#[derive(Debug)]
pub struct Unauthorized;

impl fmt::Display for Unauthorized {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unauthorized")
    }
}

pub async fn authenticate(s: SocketRef) -> Result<(), Unauthorized> {
    let header = s
        .req_parts()
        .headers
        .get(CLAIMS_HEADER)
        .and_then(|value| value.to_str().ok());

    let Some((header, identity)) = header.zip(authenticate_claims_header(header)) else {
        CONNECTIONS_REJECTED_TOTAL.inc();
        return Err(Unauthorized);
    };

    s.extensions.insert(ClaimsHeader(header.to_owned()));
    s.extensions.insert(identity);
    Ok(())
}

pub async fn on_connect(s: SocketRef, Extension(identity): Extension<Identity>) {
    CONNECTED_CLIENTS.inc();
    s.extensions.insert(ConnectedAt(Instant::now()));

    for domain in &identity.domains {
        s.join(room_for_domain(domain));
    }

    s.on("subscribe_building", subscribe_building);
    s.on("unsubscribe_building", unsubscribe_building);
    s.on_disconnect(on_disconnect);
}

async fn subscribe_building(
    s: SocketRef,
    Extension(identity): Extension<Identity>,
    Extension(ClaimsHeader(claims)): Extension<ClaimsHeader>,
    State(directory): State<Arc<BuildingDomains>>,
    Data(building_id): Data<String>,
    acknowledge: AckSender,
) {
    let outcome = match directory.of(&building_id, &claims).await {
        None => Subscription::Unavailable,
        Some(domains) if !may_read_building(&identity, &domains) => Subscription::Forbidden,
        Some(_) => {
            s.join(room_for_building(&building_id));
            Subscription::Joined
        }
    };

    if let Some(reason) = outcome.reason() {
        SUBSCRIPTIONS_REJECTED_TOTAL
            .with_label_values(&[reason])
            .inc();
    }

    let _ = acknowledge.send(&ack(&building_id, outcome));
}

async fn unsubscribe_building(s: SocketRef, Data(building_id): Data<String>) {
    s.leave(room_for_building(&building_id));
}

async fn on_disconnect() {
    CONNECTED_CLIENTS.dec();
}

pub async fn deliver(io: &SocketIo, event: &'static str, delivery: Delivery) {
    let outcome = match delivery.target {
        Target::Room(room) => io.to(room).emit(event, &delivery.payload).await,
        Target::Broadcast => io.emit(event, &delivery.payload).await,
    };

    if let Err(error) = outcome {
        log::warn!("failed to emit {event}: {error}");
    }
}
