/// The probe a container healthcheck runs against this same binary, so the image
/// needs no shell and no HTTP client of its own.
pub const HEALTH_FLAG: &str = "--health";

pub fn wants_health_probe<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().skip(1).any(|a| a.as_ref() == HEALTH_FLAG)
}

pub fn health_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/health")
}

pub fn is_healthy(status: u16) -> bool {
    (200..300).contains(&status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_flag_is_recognised_after_the_program_name() {
        assert!(wants_health_probe(["socket", "--health"]));
    }

    #[test]
    fn a_bare_invocation_is_not_a_probe() {
        assert!(!wants_health_probe(["socket"]));
    }

    #[test]
    fn a_program_named_health_is_not_a_probe() {
        assert!(!wants_health_probe(["--health"]));
    }

    #[test]
    fn an_unrelated_flag_is_not_a_probe() {
        assert!(!wants_health_probe(["socket", "--version"]));
    }

    #[test]
    fn the_probe_targets_loopback_not_the_service_hostname() {
        assert_eq!(health_url(3000), "http://127.0.0.1:3000/health");
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
