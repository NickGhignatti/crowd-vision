use serde_json::{Value, json};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Subscription {
    Joined,
    Forbidden,
    Unavailable,
}

impl Subscription {
    pub fn reason(self) -> Option<&'static str> {
        match self {
            Subscription::Joined => None,
            Subscription::Forbidden => Some("forbidden"),
            Subscription::Unavailable => Some("lookup_failed"),
        }
    }
}

pub fn ack(building_id: &str, outcome: Subscription) -> Value {
    match outcome.reason() {
        None => json!({ "subscribed": true, "buildingId": building_id }),
        Some(reason) => {
            json!({ "subscribed": false, "buildingId": building_id, "reason": reason })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_join_acknowledges_the_building_it_joined() {
        let body = ack("b1", Subscription::Joined);
        assert_eq!(body["subscribed"], true);
        assert_eq!(body["buildingId"], "b1");
    }

    #[test]
    fn a_successful_join_carries_no_reason() {
        assert!(ack("b1", Subscription::Joined).get("reason").is_none());
        assert_eq!(Subscription::Joined.reason(), None);
    }

    #[test]
    fn a_refusal_tells_the_client_it_is_not_subscribed() {
        for outcome in [Subscription::Forbidden, Subscription::Unavailable] {
            let body = ack("b1", outcome);
            assert_eq!(body["subscribed"], false, "{outcome:?}");
            assert_eq!(body["buildingId"], "b1", "{outcome:?}");
        }
    }

    #[test]
    fn a_refusal_distinguishes_denied_from_undetermined() {
        assert_eq!(ack("b1", Subscription::Forbidden)["reason"], "forbidden");
        assert_eq!(
            ack("b1", Subscription::Unavailable)["reason"],
            "lookup_failed"
        );
    }

    #[test]
    fn the_building_id_is_echoed_verbatim() {
        let odd = "site:eu-west:b1";
        assert_eq!(ack(odd, Subscription::Joined)["buildingId"], odd);
    }
}
