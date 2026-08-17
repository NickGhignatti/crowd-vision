use crate::contracts::plugin::{BoundSpec, MetricDescriptor, SensorPlugin};
use crate::contracts::reading::Reading;
use serde_json::Value;

static FAKE_DESCRIPTOR: MetricDescriptor = MetricDescriptor {
    key: "fake",
    label: "Fake",
    interface_name: "IFake",
    unit: None,
    fields: &[],
};

pub struct FakePlugin {
    pub key: &'static str,
}

impl SensorPlugin for FakePlugin {
    fn key(&self) -> &'static str {
        self.key
    }
    fn descriptor(&self) -> &MetricDescriptor {
        &FAKE_DESCRIPTOR
    }
    fn validate(&self, _payload: &Value) -> Result<Reading, Vec<String>> {
        Err(vec![])
    }
    fn bounds(&self) -> &'static [BoundSpec] {
        &[]
    }
    fn alert_channel(&self) -> &'static str {
        "alerts:fake"
    }
}
