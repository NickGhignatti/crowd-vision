use std::time::Duration;

/// The probe a container healthcheck runs against this same binary, so the image
/// needs no shell and no HTTP client of its own.
pub const HEALTH_FLAG: &str = "--health";

const PROBE_TIMEOUT: Duration = Duration::from_secs(3);

pub fn wants_health_probe<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().skip(1).any(|a| a.as_ref() == HEALTH_FLAG)
}

pub fn health_url(port: &str) -> String {
    format!("http://127.0.0.1:{port}/health")
}

pub fn is_healthy(status: u16) -> bool {
    (200..300).contains(&status)
}

/// Returns the exit code when this process was started as a healthcheck probe,
/// `None` when it should go on and serve.
pub async fn probe_exit_code(port: &str) -> Option<i32> {
    if !wants_health_probe(std::env::args()) {
        return None;
    }

    let healthy = match reqwest::Client::builder().timeout(PROBE_TIMEOUT).build() {
        Ok(client) => match client.get(health_url(port)).send().await {
            Ok(response) => is_healthy(response.status().as_u16()),
            Err(_) => false,
        },
        Err(_) => false,
    };

    Some(if healthy { 0 } else { 1 })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_flag_is_recognised_after_the_program_name() {
        assert!(wants_health_probe(["telemetry", "--health"]));
    }

    #[test]
    fn a_bare_invocation_is_not_a_probe() {
        assert!(!wants_health_probe(["telemetry"]));
    }

    #[test]
    fn a_program_named_health_is_not_a_probe() {
        assert!(!wants_health_probe(["--health"]));
    }

    #[test]
    fn an_unrelated_flag_is_not_a_probe() {
        assert!(!wants_health_probe(["telemetry", "--version"]));
    }

    #[test]
    fn the_probe_targets_loopback_on_the_configured_port() {
        assert_eq!(health_url("3000"), "http://127.0.0.1:3000/health");
        assert_eq!(health_url("8080"), "http://127.0.0.1:8080/health");
    }

    #[test]
    fn every_2xx_counts_as_healthy() {
        assert!(is_healthy(200));
        assert!(is_healthy(204));
    }

    #[test]
    fn a_redirect_or_an_error_is_not_healthy() {
        assert!(!is_healthy(301));
        assert!(!is_healthy(500));
        assert!(!is_healthy(503));
    }
}
