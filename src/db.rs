
use sqlx::{Pool, Sqlite, sqlite::SqlitePoolOptions};

pub type Db = Pool<Sqlite>;

/// 初始化数据库连接池
/// 
/// 从环境变量 `DATABASE_URL` 读取数据库 URL，如果未设置则使用默认值
pub async fn init_pool() -> anyhow::Result<Db> {
    let url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite://tradehub.db".into());
    
    tracing::info!(url = %url, "connecting to database");
    
    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .min_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&url)
        .await?;
    
    tracing::info!("database connection pool initialized");
    Ok(pool)
}
