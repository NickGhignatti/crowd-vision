use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use serde_json::Value;
use tower::ServiceExt;

pub struct ApiResponse {
    pub status: StatusCode,
    pub body: Value,
}

pub async fn send(
    router: Router,
    method: &str,
    path: &str,
    auth: Option<&str>,
    body: Option<Value>,
) -> ApiResponse {
    let mut builder = Request::builder().method(method).uri(path);
    if let Some(token) = auth {
        builder = builder.header("x-gateway-claims", token);
    }
    let request = if let Some(b) = body {
        builder
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(b.to_string()))
            .unwrap()
    } else {
        builder.body(Body::empty()).unwrap()
    };

    let response = router.oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    ApiResponse { status, body }
}
