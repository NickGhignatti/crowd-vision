pub fn discover_services() -> Vec<String> {
    let mut services = vec![];
    for (key, value) in std::env::vars() {
        if !key.ends_with("_METRICS_URL") {
            continue;
        }
        services.push(value);
    }
    services
}

#[cfg(test)]
mod tests {
    use super::discover_services;
    use std::env;

    // Each test uses globally unique env-var names and values so that parallel
    // test runs don't interfere with each other.  Values are unique UUIDs
    // embedded as string literals, so a simple `.contains()` check is
    // sufficient without asserting on exact vec length.

    #[test]
    fn returns_value_of_key_ending_with_metrics_url() {
        let key = "TEST_DISC_SVC_A_METRICS_URL";
        let url = "http://disc-test-unique-aaa.internal";
        // SAFETY: single-threaded test binary; no other thread reads this var.
        unsafe { env::set_var(key, url) };

        let result = discover_services();
        assert!(result.contains(&url.to_string()));

        unsafe { env::remove_var(key) };
    }

    #[test]
    fn returns_all_values_when_multiple_matching_keys_exist() {
        let key_a = "TEST_DISC_SVC_B_METRICS_URL";
        let key_b = "TEST_DISC_SVC_C_METRICS_URL";
        let url_a = "http://disc-test-unique-bbb.internal";
        let url_b = "http://disc-test-unique-ccc.internal";
        // SAFETY: single-threaded test binary; no other thread reads these vars.
        unsafe {
            env::set_var(key_a, url_a);
            env::set_var(key_b, url_b);
        }

        let result = discover_services();
        assert!(result.contains(&url_a.to_string()));
        assert!(result.contains(&url_b.to_string()));

        unsafe {
            env::remove_var(key_a);
            env::remove_var(key_b);
        }
    }

    #[test]
    fn excludes_values_of_keys_not_ending_with_metrics_url() {
        // The value is a unique string that no real env var would produce.
        let key = "TEST_DISC_OTHER_VAR";
        let unique_value = "http://disc-test-excluded-ddd.internal";
        // SAFETY: single-threaded test binary; no other thread reads this var.
        unsafe { env::set_var(key, unique_value) };

        let result = discover_services();
        assert!(!result.contains(&unique_value.to_string()));

        unsafe { env::remove_var(key) };
    }
}
