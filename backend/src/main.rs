use contraption_room_server::{AppState, app};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "contraption_room_server=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
    let address = std::env::var("BIND_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8787".into())
        .parse::<SocketAddr>()
        .expect("valid BIND_ADDR");
    let listener = TcpListener::bind(address)
        .await
        .expect("bind multiplayer server");
    tracing::info!(%address,"multiplayer server listening");
    axum::serve(listener, app(AppState::default()))
        .with_graceful_shutdown(shutdown())
        .await
        .expect("server failed");
}

async fn shutdown() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install ctrl-c handler");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install signal handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _=ctrl_c=>{}, _=terminate=>{} }
}
