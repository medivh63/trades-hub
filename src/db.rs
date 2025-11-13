
use sqlx::{Pool, Sqlite, sqlite::SqlitePoolOptions};

pub type Db = Pool<Sqlite>;

pub async fn init_pool() -> anyhow::Result<Db> {
    let url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:///Users/medivh/local.db".into());
    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect(&url).await?;
    Ok(pool)
}
