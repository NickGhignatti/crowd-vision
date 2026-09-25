/// A kind of physical device and the metrics it reports; a router reports two.
#[derive(Debug, Clone, PartialEq)]
pub struct DeviceKind {
    pub key: &'static str,
    pub label: &'static str,
    pub metrics: &'static [&'static str],
}
