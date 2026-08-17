use crate::contracts::reading::Reading;
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldKind {
    NonEmptyString,
    Finite,
    NonNegativeInt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FieldSpec {
    pub name: &'static str,
    pub kind: FieldKind,
    pub required: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoundDirection {
    Above,
    Below,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BoundSpec {
    pub key: &'static str,
    pub direction: BoundDirection,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MetricDescriptor {
    pub key: &'static str,
    pub label: &'static str,
    pub interface_name: &'static str,
    pub unit: Option<&'static str>,
    pub fields: &'static [FieldSpec],
}

pub trait SensorPlugin: Send + Sync {
    fn key(&self) -> &'static str;
    fn descriptor(&self) -> &MetricDescriptor;
    fn validate(&self, payload: &Value) -> Result<Reading, Vec<String>>;
    fn bounds(&self) -> &'static [BoundSpec];
    fn alert_channel(&self) -> Option<&'static str>;
}
