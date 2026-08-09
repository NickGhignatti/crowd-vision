use std::fmt;

use socketioxide::SocketIo;
use socketioxide::extract::{Data, Extension, SocketRef};

use crate::auth::{CLAIMS_HEADER, Identity, authenticate_claims_header};
use crate::metrics::{CONNECTED_CLIENTS, CONNECTIONS_REJECTED_TOTAL};
use crate::relay::{Delivery, Target};
use crate::rooms::{room_for_building, room_for_domain};

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

    let Some(identity) = authenticate_claims_header(header) else {
        CONNECTIONS_REJECTED_TOTAL.inc();
        return Err(Unauthorized);
    };

    s.extensions.insert(identity);
    Ok(())
}

pub async fn on_connect(s: SocketRef, Extension(identity): Extension<Identity>) {
    CONNECTED_CLIENTS.inc();

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
    Data(building_id): Data<String>,
) {
    if identity.domains.is_empty() {
        return;
    }
    s.join(room_for_building(&building_id));
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
