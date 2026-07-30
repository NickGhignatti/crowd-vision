//! Everything outside the hexagon: adapters that call the core (`driving/`),
//! adapters the core calls out to (`driven/`), and the cross-cutting request
//! middleware (`metrics`, `ratelimit`) that wraps every route regardless of
//! which use case it reaches.

pub mod driven;
pub mod driving;
pub mod metrics;
pub mod ratelimit;
