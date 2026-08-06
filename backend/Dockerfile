FROM rust:1.96-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* && useradd --create-home --uid 10001 contraption
COPY --from=builder /app/target/release/contraption-room-server /usr/local/bin/contraption-room-server
USER contraption
ENV BIND_ADDR=0.0.0.0:8787
EXPOSE 8787
ENTRYPOINT ["contraption-room-server"]
