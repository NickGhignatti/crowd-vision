use mongodb::bson::doc;
use mongodb::options::{ClientOptions, IndexOptions};
use mongodb::{Client, Database, IndexModel};

pub const WEB_PUSH_SUBSCRIPTIONS: &str = "webpushsubscriptions";
pub const NOTIFICATION_SUBSCRIPTIONS: &str = "notificationsubscriptions";

/// Connects and reproduces the indexes mongoose declared on the two collections —
/// notably the unique `endpoint`, which is what makes a re-subscribe an upsert
/// rather than a duplicate row.
pub async fn connect(uri: &str) -> anyhow::Result<Database> {
    let options = ClientOptions::parse(uri).await?;
    let db_name = options
        .default_database
        .clone()
        .unwrap_or_else(|| "notificationdb".to_string());
    let database = Client::with_options(options)?.database(&db_name);

    let subscriptions = database.collection::<mongodb::bson::Document>(WEB_PUSH_SUBSCRIPTIONS);
    subscriptions
        .create_index(unique(doc! { "endpoint": 1 }))
        .await?;
    subscriptions
        .create_index(unique(doc! { "accountName": 1, "endpoint": 1 }))
        .await?;
    subscriptions
        .create_index(
            IndexModel::builder()
                .keys(doc! { "accountName": 1 })
                .build(),
        )
        .await?;

    let preferences = database.collection::<mongodb::bson::Document>(NOTIFICATION_SUBSCRIPTIONS);
    preferences
        .create_index(unique(doc! { "accountName": 1, "domainName": 1 }))
        .await?;
    preferences
        .create_index(IndexModel::builder().keys(doc! { "domainName": 1 }).build())
        .await?;

    Ok(database)
}

fn unique(keys: mongodb::bson::Document) -> IndexModel {
    IndexModel::builder()
        .keys(keys)
        .options(IndexOptions::builder().unique(true).build())
        .build()
}
