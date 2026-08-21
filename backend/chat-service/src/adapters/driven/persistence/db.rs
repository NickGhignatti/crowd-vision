use mongodb::bson::doc;
use mongodb::options::ClientOptions;
use mongodb::{Client, Database, IndexModel};

pub const CONVERSATIONS: &str = "conversations";

pub async fn connect(uri: &str) -> anyhow::Result<Database> {
    let options = ClientOptions::parse(uri).await?;
    let db_name = options
        .default_database
        .clone()
        .unwrap_or_else(|| "chatdb".to_string());
    let database = Client::with_options(options)?.database(&db_name);

    let conversations = database.collection::<mongodb::bson::Document>(CONVERSATIONS);
    conversations
        .create_index(IndexModel::builder().keys(doc! { "userId": 1 }).build())
        .await?;
    conversations
        .create_index(
            IndexModel::builder()
                .keys(doc! { "userId": 1, "updatedAt": -1 })
                .build(),
        )
        .await?;

    Ok(database)
}
