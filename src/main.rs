
use axum::Router;
use tower_http::{trace::TraceLayer, services::ServeDir};
use std::net::SocketAddr;
use tokio::net::TcpListener;

mod db;
mod routes;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 加载环境变量
    dotenvy::dotenv().ok();
    
    // 初始化日志
    let log_level = std::env::var("RUST_LOG")
        .unwrap_or_else(|_| "info".into());
    tracing_subscriber::fmt()
        .with_env_filter(log_level)
        .init();

    // 初始化数据库连接池
    let pool = db::init_pool().await?;

    // 运行数据库迁移
    if let Err(err) = sqlx::migrate!("./migrations").run(&pool).await {
        tracing::error!(?err, "database migrations failed, continuing without applying them");
    } else {
        tracing::info!("database migrations completed successfully");
    }

    // 构建应用路由
    let app = Router::new()
        .nest_service("/static", ServeDir::new("src/static"))
        .merge(routes::public_routes())
        .with_state(pool)
        .layer(TraceLayer::new_for_http());

    // 启动服务器
    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("listening on {}", listener.local_addr()?);
    
    axum::serve(listener, app).await?;
    Ok(())
}
