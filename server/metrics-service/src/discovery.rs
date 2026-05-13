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
