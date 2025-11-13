
use axum::Router;
use tower_http::{trace::TraceLayer, services::ServeDir};
use std::net::SocketAddr;
use tokio::net::TcpListener;

mod db;
mod routes;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()))
        .init();

    let pool = db::init_pool().await?;

    if let Err(err) = sqlx::migrate!("./migrations").run(&pool).await {
        tracing::error!(?err, "database migrations failed, continuing without applying them");
    }

    let app = Router::new()
        .nest_service("/static", ServeDir::new("src/static"))
        .merge(routes::public_routes())
        .with_state(pool)
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("listening on {}", listener.local_addr()?);
    axum::serve(listener, app).await?;
    Ok(())
}
