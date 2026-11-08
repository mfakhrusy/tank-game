mod rate_limits;
use axum::{
    Json, Router,
    extract::{
        Path, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use rate_limits::{HttpLimits, SocketLimits};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::sync::{Mutex, RwLock, mpsc};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use uuid::Uuid;

pub const MAX_ROOMS: usize = 10;
pub const MAX_PLAYERS: usize = 8;
pub const MAX_ATTACHMENTS: usize = 16;
const ROOM_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_WORLD_POSITION: f32 = 100_000.0;
const ENEMY_TARGET: usize = 28;
const ENEMY_ACTIVE_RADIUS: f32 = 2_600.0;
const TICK_MS: u64 = 33;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub uid: String,
    pub part_id: String,
    pub mount: u8,
    pub layer: u8,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TankBuild {
    pub version: u8,
    pub name: String,
    pub color: String,
    pub attachments: Vec<Attachment>,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct Upgrades {
    damage: u8,
    reload: u8,
    speed: u8,
    health: u8,
    ram: u8,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct Progression {
    xp: u64,
    upgrades: Upgrades,
}
impl Progression {
    fn level(&self) -> u8 {
        let (mut level, mut remaining) = (1, self.xp);
        while level < 26 && remaining >= 30 + 15 * (level as u64 - 1) {
            remaining -= 30 + 15 * (level as u64 - 1);
            level += 1;
        }
        level
    }
    fn spend(&mut self, stat: &str) -> bool {
        let u = &self.upgrades;
        let spent = u.damage + u.reload + u.speed + u.health + u.ram;
        if spent >= self.level() - 1 {
            return false;
        }
        let rank = match stat {
            "damage" => &mut self.upgrades.damage,
            "reload" => &mut self.upgrades.reload,
            "speed" => &mut self.upgrades.speed,
            "health" => &mut self.upgrades.health,
            "ram" => &mut self.upgrades.ram,
            _ => return false,
        };
        if *rank >= 5 {
            return false;
        }
        *rank += 1;
        true
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    pub id: String,
    pub build: TankBuild,
    pub x: f32,
    pub y: f32,
    pub rotation: f32,
    pub health: f32,
    pub max_health: f32,
    #[serde(default)]
    pub progression: Progression,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnemyState {
    pub id: String,
    pub variant: String,
    pub level: u8,
    pub x: f32,
    pub y: f32,
    pub health: f32,
    pub max_health: f32,
    pub charging: bool,
    pub burning: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectileState {
    pub id: String,
    pub owner_id: String,
    pub behavior: String,
    pub x: f32,
    pub y: f32,
    pub rotation: f32,
    pub size: f32,
    pub color: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub length: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub age_ms: Option<u64>,
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomStats {
    pub blocks: u64,
    pub shots: u64,
    pub hits: u64,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Upgrade {
        stat: String,
    },
    Join {
        build: TankBuild,
    },
    State {
        x: f32,
        y: f32,
        rotation: f32,
        firing: bool,
    },
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage {
    Welcome {
        player_id: String,
        room: String,
        players: Vec<PlayerState>,
    },
    PlayerJoined {
        player: PlayerState,
    },
    PlayerLeft {
        player_id: String,
    },
    PlayerState {
        player: PlayerState,
    },
    WorldSnapshot {
        revision: u64,
        players: Vec<PlayerState>,
        enemies: Vec<EnemyState>,
        projectiles: Vec<ProjectileState>,
        stats: RoomStats,
    },
    Error {
        code: &'static str,
        message: &'static str,
    },
}

#[derive(Clone)]
struct ConnectedPlayer {
    state: PlayerState,
    sender: mpsc::Sender<Message>,
    firing: bool,
    last_fire: HashMap<String, u64>,
    last_damage: u64,
    impact_speed: f32,
    last_state_received: std::time::Instant,
}
struct Enemy {
    id: String,
    variant: String,
    level: u8,
    x: f32,
    y: f32,
    home_x: f32,
    home_y: f32,
    health: f32,
    max_health: f32,
    size: f32,
    speed: f32,
    roam: f32,
    phase: f32,
    contact_damage: f32,
    knock_x: f32,
    knock_y: f32,
}
struct Projectile {
    id: String,
    owner_id: String,
    behavior: String,
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    rotation: f32,
    size: f32,
    color: u32,
    damage: f32,
    age: u64,
    lifetime: u64,
    base_angle: f32,
    base_speed: f32,
    phase: f32,
    split: bool,
    pierce: i8,
    hit: HashSet<String>,
}
#[derive(Clone)]
struct Burn {
    until: u64,
    next_tick: u64,
    damage: f32,
}
fn ignite_burn(current: Option<&Burn>, now: u64, damage: f32) -> Burn {
    let active = current.filter(|b| b.until >= now);
    Burn {
        until: now + 3000,
        next_tick: active.map_or(now + 250, |b| b.next_tick),
        damage: damage.max(active.map_or(0.0, |b| b.damage)),
    }
}
fn update_burns(world: &mut World) {
    for enemy in &mut world.enemies {
        if enemy.health <= 0.0 {
            continue;
        }
        if let Some(burn) = world.burns.get_mut(&enemy.id) {
            while burn.next_tick <= world.elapsed.min(burn.until) {
                enemy.health -= burn.damage;
                burn.next_tick += 250;
            }
        }
    }
    world.burns.retain(|id, burn| {
        burn.until > world.elapsed && world.enemies.iter().any(|e| e.id == *id && e.health > 0.0)
    });
}
#[derive(Default)]
struct World {
    burns: HashMap<String, Burn>,
    enemy_attacks: HashMap<String, (u64, u64)>,
    enemies: Vec<Enemy>,
    projectiles: Vec<Projectile>,
    stats: RoomStats,
    revision: u64,
    elapsed: u64,
    next_id: u64,
    contacts: HashMap<String, u64>,
}
struct Room {
    players: Mutex<HashMap<String, ConnectedPlayer>>,
    world: Mutex<World>,
    closed: AtomicBool,
}
impl Room {
    fn new() -> Self {
        Self {
            players: Mutex::new(HashMap::new()),
            world: Mutex::new(World::default()),
            closed: AtomicBool::new(false),
        }
    }
}
#[derive(Clone, Default)]
pub struct AppState {
    rooms: Arc<RwLock<HashMap<String, Arc<Room>>>>,
    limits: Arc<Mutex<HttpLimits>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RoomCreated {
    room_id: String,
}

pub fn app(state: AppState) -> Router {
    Router::new()
        .route(
            "/api/health",
            get(|| async { Json(serde_json::json!({"status":"ok"})) }),
        )
        .route("/api/rooms", post(create_room))
        .route("/multiplayer/{room}", get(websocket_handler))
        .layer(middleware::from_fn_with_state(state.clone(), limit_http))
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}
async fn limit_http(
    State(state): State<AppState>,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    use axum::extract::ConnectInfo;
    let peer = request
        .extensions()
        .get::<ConnectInfo<std::net::SocketAddr>>()
        .map(|info| info.0.ip());
    // Only the local reverse proxy may supply a forwarded address. Take its
    // rightmost value, so a client-supplied X-Forwarded-For cannot bypass limits.
    let ip = peer
        .filter(|ip| ip.is_loopback())
        .and_then(|_| request.headers().get("x-forwarded-for"))
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit(',').next())
        .and_then(|v| v.trim().parse::<std::net::IpAddr>().ok())
        .or(peer)
        .map_or_else(|| "unknown".to_owned(), |ip| ip.to_string());
    let now = std::time::Instant::now();
    let path = request.uri().path();
    let mut limits = state.limits.lock().await;
    let allowed = limits.allow("all".into(), 600, now)
        && limits.allow(format!("ip:{ip}"), 120, now)
        && (path != "/api/rooms"
            || request.method() != axum::http::Method::POST
            || (limits.allow("rooms".into(), 30, now)
                && limits.allow(format!("rooms:{ip}"), 10, now)))
        && (!path.starts_with("/multiplayer/") || limits.allow(format!("join:{ip}"), 20, now));
    drop(limits);
    if !allowed {
        return (StatusCode::TOO_MANY_REQUESTS,[("retry-after","60")],Json(serde_json::json!({"code":"rate_limited","message":"Too many requests. Please wait a minute and try again."}))).into_response();
    }
    next.run(request).await
}

async fn create_room(State(state): State<AppState>) -> Response {
    // Keep the capacity check and insertion atomic across concurrent requests.
    let mut rooms = state.rooms.write().await;
    if rooms.len() >= MAX_ROOMS {
        return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({
            "code": "room_limit_reached",
            "message": "The server is full (10 rooms maximum). Join an existing room or try again later."
        }))).into_response();
    }
    loop {
        let room_id = generate_room_id();
        if !rooms.contains_key(&room_id) {
            let room = Arc::new(Room::new());
            rooms.insert(room_id.clone(), room.clone());
            tokio::spawn(simulation_loop(room));
            return Json(RoomCreated { room_id }).into_response();
        }
    }
}
async fn websocket_handler(
    Path(room): Path<String>,
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> Response {
    let room_id = normalize_room_id(&room);
    if !state.rooms.read().await.contains_key(&room_id) {
        return (StatusCode::NOT_FOUND, "Room not found").into_response();
    }
    ws.max_message_size(32 * 1024)
        .max_frame_size(32 * 1024)
        .on_upgrade(move |socket| handle_socket(socket, state, room_id))
}

async fn handle_socket(socket: WebSocket, app_state: AppState, room_id: String) {
    let Some(room) = app_state.rooms.read().await.get(&room_id).cloned() else {
        return;
    };
    let (mut socket_sender, mut socket_receiver) = socket.split();
    let first = tokio::time::timeout(Duration::from_secs(5), socket_receiver.next()).await;
    let Ok(Some(Ok(Message::Text(text)))) = first else {
        let _ = socket_sender.send(Message::Close(None)).await;
        return;
    };
    let Ok(ClientMessage::Join { build }) = serde_json::from_str::<ClientMessage>(&text) else {
        send_direct(
            &mut socket_sender,
            &ServerMessage::Error {
                code: "join_required",
                message: "The first message must join the room.",
            },
        )
        .await;
        return;
    };
    if !valid_build(&build) {
        send_direct(
            &mut socket_sender,
            &ServerMessage::Error {
                code: "invalid_build",
                message: "That contraption is not valid.",
            },
        )
        .await;
        return;
    }
    let player_id = Uuid::new_v4().simple().to_string();
    let max_health = build_armor(&build);
    let player = PlayerState {
        id: player_id.clone(),
        build,
        x: 0.0,
        y: 0.0,
        rotation: 0.0,
        health: max_health,
        max_health,
        progression: Progression::default(),
    };
    let (outbound, mut outbound_rx) = mpsc::channel::<Message>(20);
    let existing = {
        let mut players = room.players.lock().await;
        if players.len() >= MAX_PLAYERS {
            send_direct(
                &mut socket_sender,
                &ServerMessage::Error {
                    code: "room_full",
                    message: "This room already has eight players.",
                },
            )
            .await;
            return;
        }
        let existing = players.values().map(|p| p.state.clone()).collect();
        players.insert(
            player_id.clone(),
            ConnectedPlayer {
                state: player.clone(),
                sender: outbound.clone(),
                firing: false,
                last_fire: HashMap::new(),
                last_damage: 0,
                impact_speed: 0.0,
                last_state_received: std::time::Instant::now(),
            },
        );
        existing
    };
    queue_message(
        &outbound,
        &ServerMessage::Welcome {
            player_id: player_id.clone(),
            room: room_id.clone(),
            players: existing,
        },
    );
    broadcast(
        &room,
        &ServerMessage::PlayerJoined {
            player: player.clone(),
        },
        Some(&player_id),
    )
    .await;
    let writer = tokio::spawn(async move {
        while let Some(message) = outbound_rx.recv().await {
            if socket_sender.send(message).await.is_err() {
                break;
            }
        }
    });
    let mut socket_limits = SocketLimits::new(std::time::Instant::now());
    while let Some(Ok(message)) = socket_receiver.next().await {
        let bytes = match &message {
            Message::Text(text) => text.len(),
            Message::Binary(data) | Message::Ping(data) | Message::Pong(data) => data.len(),
            Message::Close(_) => 0,
        };
        if !socket_limits.message(bytes, std::time::Instant::now()) {
            break;
        }
        match message {
            Message::Text(text) => {
                let parsed = serde_json::from_str::<ClientMessage>(&text);
                if let Ok(ClientMessage::Upgrade { stat }) = &parsed {
                    if !socket_limits.upgrade(std::time::Instant::now()) {
                        break;
                    }
                    let mut players = room.players.lock().await;
                    if let Some(entry) = players.get_mut(&player_id) {
                        let previous_max = entry.state.max_health;
                        if entry.state.progression.spend(stat) {
                            entry.state.max_health = (build_armor(&entry.state.build)
                                * (1.0 + 0.15 * entry.state.progression.upgrades.health as f32))
                                .round();
                            entry.state.health = (entry.state.health + entry.state.max_health
                                - previous_max)
                                .min(entry.state.max_health);
                        }
                    }
                    continue;
                }
                let Ok(ClientMessage::State {
                    x,
                    y,
                    rotation,
                    firing,
                }) = parsed
                else {
                    continue;
                };
                if !x.is_finite() || !y.is_finite() || !rotation.is_finite() {
                    continue;
                }
                let updated = {
                    let mut players = room.players.lock().await;
                    let Some(entry) = players.get_mut(&player_id) else {
                        break;
                    };
                    entry.impact_speed = (distance(entry.state.x, entry.state.y, x, y)
                        / entry.last_state_received.elapsed().as_secs_f32().max(0.016))
                    .min(1000.0);
                    entry.last_state_received = std::time::Instant::now();
                    entry.state.x = x.clamp(-MAX_WORLD_POSITION, MAX_WORLD_POSITION);
                    entry.state.y = y.clamp(-MAX_WORLD_POSITION, MAX_WORLD_POSITION);
                    entry.state.rotation = normalize_angle(rotation);
                    entry.firing = firing;
                    entry.state.clone()
                };
                broadcast(
                    &room,
                    &ServerMessage::PlayerState { player: updated },
                    Some(&player_id),
                )
                .await;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    writer.abort();
    room.players.lock().await.remove(&player_id);
    broadcast(
        &room,
        &ServerMessage::PlayerLeft {
            player_id: player_id.clone(),
        },
        None,
    )
    .await;
    if room.players.lock().await.is_empty() {
        let mut rooms = app_state.rooms.write().await;
        if rooms
            .get(&room_id)
            .is_some_and(|candidate| Arc::ptr_eq(candidate, &room))
        {
            room.closed.store(true, Ordering::Relaxed);
            rooms.remove(&room_id);
        }
    }
}

async fn simulation_loop(room: Arc<Room>) {
    let mut ticker = tokio::time::interval(Duration::from_millis(TICK_MS));
    let mut frame = 0u8;
    loop {
        ticker.tick().await;
        if room.closed.load(Ordering::Relaxed) {
            break;
        }
        let has_players = !room.players.lock().await.is_empty();
        if !has_players {
            continue;
        }
        tick_world(&room).await;
        frame = frame.wrapping_add(1);
        if frame.is_multiple_of(2) {
            let snapshot = world_snapshot(&room).await;
            broadcast(&room, &snapshot, None).await;
        }
    }
}

async fn tick_world(room: &Room) {
    let mut players = room.players.lock().await;
    let mut world = room.world.lock().await;
    world.elapsed += TICK_MS;
    world.revision += 1;
    let now = world.elapsed;
    let (center_x, center_y) = if players.is_empty() {
        (0.0, 0.0)
    } else {
        let n = players.len() as f32;
        (
            players.values().map(|p| p.state.x).sum::<f32>() / n,
            players.values().map(|p| p.state.y).sum::<f32>() / n,
        )
    };
    // Retire objects the party has left far behind. Replacements are spawned around
    // the current group, which keeps long co-op trips populated without growing the
    // room forever.
    world
        .enemies
        .retain(|enemy| distance(enemy.x, enemy.y, center_x, center_y) < ENEMY_ACTIVE_RADIUS);
    let party_level = if players.is_empty() {
        1
    } else {
        (players
            .values()
            .map(|p| p.state.progression.level() as u32)
            .sum::<u32>()
            / players.len() as u32) as u8
    };
    while world.enemies.len() < ENEMY_TARGET {
        spawn_enemy(&mut world, center_x, center_y, party_level);
    }
    let previous_positions: HashMap<String, (f32, f32)> = world
        .enemies
        .iter()
        .map(|e| (e.id.clone(), (e.x, e.y)))
        .collect();
    let charging: HashSet<String> = world
        .enemy_attacks
        .iter()
        .filter(|(_, (_, charge))| *charge > 0)
        .map(|(id, _)| id.clone())
        .collect();
    for enemy in &mut world.enemies {
        let decay = (-5.0 * TICK_MS as f32 / 1000.0).exp();
        let push_x = enemy.knock_x * (1.0 - decay) / 5.0;
        let push_y = enemy.knock_y * (1.0 - decay) / 5.0;
        enemy.x += push_x;
        enemy.y += push_y;
        enemy.home_x += push_x;
        enemy.home_y += push_y;
        enemy.knock_x *= decay;
        enemy.knock_y *= decay;
        if enemy.speed <= 0.0 || charging.contains(&enemy.id) {
            continue;
        }
        let dx = enemy.home_x - enemy.x;
        let dy = enemy.home_y - enemy.y;
        let distance = (dx * dx + dy * dy).sqrt();
        let seed = enemy.phase + 1.0;
        let pace = if enemy.speed > 110.0 {
            0.85
        } else if enemy.speed > 80.0 {
            1.4
        } else {
            2.3
        };
        let clock = now as f32 / 1000.0 / (pace * (0.85 + 0.3 * ((seed * 9.0).sin() * 0.5 + 0.5)))
            + seed * 3.0;
        let wander = enemy.phase
            + wander_noise(clock, seed) * std::f32::consts::PI * 1.7
            + wander_noise(clock * 0.37, seed + 8.0) * std::f32::consts::PI;
        let pulse = (wander_noise(clock * 0.8, seed + 17.0) + 1.0) / 2.0;
        let speed_scale = if enemy.speed > 110.0 {
            0.12 + 1.5 * pulse.powi(3)
        } else if enemy.speed > 80.0 {
            0.55 + 0.65 * pulse
        } else {
            0.18 + 0.82 * pulse
        };
        let wx = wander.cos();
        let wy = wander.sin();
        let weight =
            ((distance - enemy.roam * 0.55) / (enemy.roam * 0.45).max(1.0)).clamp(0.0, 1.0);
        let (hx, hy) = if distance > 0.001 {
            (dx / distance, dy / distance)
        } else {
            (wx, wy)
        };
        let bx = wx + (hx - wx) * weight;
        let by = wy + (hy - wy) * weight;
        let len = (bx * bx + by * by).sqrt().max(0.001);
        let speed = enemy.speed * (speed_scale + (1.0 - speed_scale) * weight);
        enemy.x += bx / len * speed * TICK_MS as f32 / 1000.0;
        enemy.y += by / len * speed * TICK_MS as f32 / 1000.0;
    }
    // Sum each player's attraction before moving an enemy, independent of map order.
    for enemy in &mut world.enemies {
        if enemy.knock_x.hypot(enemy.knock_y) > 8.0 {
            continue;
        }
        let (mut pull_x, mut pull_y) = (0.0, 0.0);
        for player in players.values() {
            let power = player
                .state
                .build
                .attachments
                .iter()
                .filter(|a| a.part_id == "magnet")
                .count() as f32
                * 60.0;
            let dx = player.state.x - enemy.x;
            let dy = player.state.y - enemy.y;
            let distance = dx.hypot(dy);
            let step = magnet_pull_distance(
                power,
                distance,
                42.0 + enemy.size * 0.5 + 24.0,
                TICK_MS as f32,
            );
            if step > 0.0 {
                pull_x += dx / distance * step;
                pull_y += dy / distance * step;
            }
        }
        enemy.x += pull_x;
        enemy.y += pull_y;
        enemy.home_x += pull_x;
        enemy.home_y += pull_y;
    }
    for player in players.values_mut() {
        if now.saturating_sub(player.last_damage) > 5000
            && player.state.health < player.state.max_health
        {
            player.state.health = (player.state.health + player.state.max_health * 0.001)
                .min(player.state.max_health);
        }
        if player.firing {
            for attachment in player.state.build.attachments.clone() {
                let Some(mut spec) = weapon_spec(&attachment.part_id) else {
                    continue;
                };
                spec.damage *= 1.0 + 0.12 * player.state.progression.upgrades.damage as f32;
                spec.fire_rate *= 1.0 + 0.08 * player.state.progression.upgrades.reload as f32;
                let cooldown = (1000.0 / spec.fire_rate) as u64;
                if now.saturating_sub(*player.last_fire.get(&attachment.uid).unwrap_or(&0))
                    < cooldown
                {
                    continue;
                }
                player.last_fire.insert(attachment.uid.clone(), now);
                world.stats.shots += spec.burst as u64;
                for shot in 0..spec.burst {
                    let offset = (shot as f32 - (spec.burst - 1) as f32 / 2.0) * spec.spread;
                    spawn_projectile(&mut world, &player.state, &attachment, &spec, offset);
                }
            }
        }
    }
    collide_enemies(&mut world, &previous_positions);
    update_projectiles(&mut world, &mut players);
    update_burns(&mut world);
    update_enemy_attacks(&mut world, &players);
    let mut destroyed = 0u64;
    let mut earned_xp = 0u64;
    world.enemies.retain(|enemy| {
        if enemy.health <= 0.0 {
            destroyed += 1;
            earned_xp += [12, 24, 40][enemy.level.min(2) as usize];
            false
        } else {
            true
        }
    });
    world.stats.blocks += destroyed;
    for player in players.values_mut() {
        player.state.progression.xp = player.state.progression.xp.saturating_add(earned_xp);
    }
    let World {
        enemies, contacts, ..
    } = &mut *world;
    for player in players.values_mut() {
        let outline = tank_outline(
            &player.state.build,
            player.state.x,
            player.state.y,
            player.state.rotation,
        );
        for enemy in &mut *enemies {
            if enemy.health <= 0.0
                || distance(player.state.x, player.state.y, enemy.x, enemy.y)
                    > 180.0 + enemy.size * 0.71
                || !tank_enemy_contact(&outline, enemy)
            {
                continue;
            }
            let key = format!("{}:{}", player.state.id, enemy.id);
            if contacts
                .get(&key)
                .is_some_and(|last| now.saturating_sub(*last) < 520)
            {
                continue;
            }
            contacts.insert(key, now);
            player.state.health = (player.state.health - enemy.contact_damage).max(0.0);
            player.last_damage = now;
            let ram = build_ram_damage(&player.state.build)
                * (1.0 + 0.12 * player.state.progression.upgrades.ram as f32);
            enemy.health -= if ram > 8.0 {
                ram.min(
                    (enemy.max_health
                        * 0.3
                        * (1.0 + 0.12 * player.state.progression.upgrades.ram as f32))
                        .ceil()
                        .max(1.0),
                )
            } else {
                ram
            };
            if enemy.health > 0.0 {
                let strength = smasher_knockback(ram, player.impact_speed);
                let dx = enemy.x - player.state.x;
                let dy = enemy.y - player.state.y;
                let distance = dx.hypot(dy);
                if strength > 0.0 && distance > 0.0 {
                    enemy.knock_x = dx / distance * strength;
                    enemy.knock_y = dy / distance * strength;
                }
            }
            if player.state.health <= 0.0 {
                player.state.x = 0.0;
                player.state.y = 0.0;
                player.state.progression = Progression::default();
                player.state.max_health = build_armor(&player.state.build);
                player.state.health = player.state.max_health;
            }
        }
    }
}

fn update_projectiles(world: &mut World, players: &mut HashMap<String, ConnectedPlayer>) {
    let now = world.elapsed;
    let mut children = Vec::new();
    for projectile in &mut world.projectiles {
        if projectile.behavior == "hostile" {
            projectile.age += TICK_MS;
            projectile.x += projectile.vx * TICK_MS as f32 / 1000.0;
            projectile.y += projectile.vy * TICK_MS as f32 / 1000.0;
            let outline = ellipse_outline(projectile.x, projectile.y, 5.0, 5.0);
            for player in players.values_mut() {
                if distance(projectile.x, projectile.y, player.state.x, player.state.y) > 220.0 {
                    continue;
                }
                let tank = tank_outline(
                    &player.state.build,
                    player.state.x,
                    player.state.y,
                    player.state.rotation,
                );
                if !tank
                    .iter()
                    .any(|shape| polygon_separation(shape, &outline).is_some())
                {
                    continue;
                }
                projectile.age = projectile.lifetime;
                if now.saturating_sub(player.last_damage) >= 200 {
                    player.state.health = (player.state.health - projectile.damage).max(0.0);
                    player.last_damage = now;
                    if player.state.health <= 0.0 {
                        player.state.progression = Progression::default();
                        player.state.max_health = build_armor(&player.state.build);
                        player.state.health = player.state.max_health;
                        player.state.x = 0.0;
                        player.state.y = 0.0;
                    }
                }
                break;
            }
            continue;
        }
        if projectile.behavior == "railgun" {
            if projectile.age == 0 {
                for enemy in &mut world.enemies {
                    if enemy.health > 0.0
                        && beam_hits_enemy(
                            projectile.x,
                            projectile.y,
                            projectile.rotation,
                            projectile.base_speed,
                            enemy,
                        )
                    {
                        enemy.health -= projectile.damage;
                        world.stats.hits += 1;
                    }
                }
            }
            projectile.age += TICK_MS;
            continue;
        }
        projectile.age += TICK_MS;
        if projectile.behavior == "boomerang" && projectile.age >= 480 {
            if let Some(owner) = players.get(&projectile.owner_id) {
                let angle = (owner.state.y - projectile.y).atan2(owner.state.x - projectile.x);
                projectile.vx = angle.cos() * projectile.base_speed * 1.15;
                projectile.vy = angle.sin() * projectile.base_speed * 1.15;
                projectile.rotation = angle;
            }
        } else if projectile.behavior == "wiggler" {
            let angle = projectile.base_angle
                + (projectile.age as f32 / 105.0 + projectile.phase).sin() * 0.58;
            projectile.vx = angle.cos() * projectile.base_speed;
            projectile.vy = angle.sin() * projectile.base_speed;
            projectile.rotation = angle;
        } else if projectile.behavior == "splitter" && projectile.age >= 430 && !projectile.split {
            projectile.split = true;
            for offset in [-0.34, 0.0, 0.34] {
                children.push(child_projectile(world.next_id, projectile, offset));
                world.next_id += 1;
            }
            projectile.age = projectile.lifetime;
        }
        if projectile.behavior == "flamethrower" {
            if projectile.age >= 800 {
                continue;
            }
            let progress = projectile.age as f32 / 800.0;
            let speed = projectile.base_speed * (1.0 - 0.5 * progress);
            projectile.vx = projectile.base_angle.cos() * speed;
            projectile.vy = projectile.base_angle.sin() * speed;
            projectile.size = 7.0 + progress * 14.0;
        }
        projectile.x += projectile.vx * TICK_MS as f32 / 1000.0;
        projectile.y += projectile.vy * TICK_MS as f32 / 1000.0;
        for enemy in &mut world.enemies {
            if projectile.hit.contains(&enemy.id)
                || distance(projectile.x, projectile.y, enemy.x, enemy.y)
                    > projectile.size + enemy.size * 0.5
            {
                continue;
            }
            if projectile.behavior == "flamethrower" {
                let outline =
                    ellipse_outline(projectile.x, projectile.y, projectile.size, projectile.size);
                if !tank_enemy_contact(&[outline], enemy) {
                    continue;
                }
                let burn = ignite_burn(
                    world.burns.get(&enemy.id),
                    world.elapsed,
                    1.5 * projectile.damage / 1.25,
                );
                world.burns.insert(enemy.id.clone(), burn);
            }
            projectile.hit.insert(enemy.id.clone());
            enemy.health -= projectile.damage;
            world.stats.hits += 1;
            if projectile.behavior == "ricochet" {
                let normal_x = projectile.x - enemy.x;
                let normal_y = projectile.y - enemy.y;
                let normal_length = (normal_x * normal_x + normal_y * normal_y)
                    .sqrt()
                    .max(0.001);
                let nx = normal_x / normal_length;
                let ny = normal_y / normal_length;
                let dot = projectile.vx * nx + projectile.vy * ny;
                projectile.vx -= 2.0 * dot * nx;
                projectile.vy -= 2.0 * dot * ny;
                projectile.rotation = projectile.vy.atan2(projectile.vx);
                projectile.x += nx * (projectile.size + 3.0);
                projectile.y += ny * (projectile.size + 3.0);
            } else if projectile.behavior != "boomerang" {
                projectile.pierce -= 1;
                if projectile.pierce <= 0 {
                    projectile.age = projectile.lifetime;
                    break;
                }
            }
        }
        if projectile.behavior == "boomerang"
            && projectile.age > 500
            && let Some(owner) = players.get(&projectile.owner_id)
            && distance(projectile.x, projectile.y, owner.state.x, owner.state.y) < 38.0
        {
            projectile.age = projectile.lifetime;
        }
    }
    world.projectiles.extend(children);
    world.projectiles.retain(|p| {
        p.age < p.lifetime && p.x.abs() < MAX_WORLD_POSITION && p.y.abs() < MAX_WORLD_POSITION
    });
    let _ = now;
}

#[derive(Clone)]
struct WeaponSpec {
    behavior: &'static str,
    damage: f32,
    fire_rate: f32,
    speed: f32,
    size: f32,
    spread: f32,
    burst: u8,
    color: u32,
    lifetime: u64,
}
fn weapon_spec(id: &str) -> Option<WeaponSpec> {
    Some(match id {
        "flamethrower" => WeaponSpec {
            behavior: "flamethrower",
            damage: 1.25,
            fire_rate: 16.0,
            speed: 500.0,
            size: 7.0,
            spread: 0.0,
            burst: 1,
            color: 0xff982f,
            lifetime: 800,
        },
        "railgun" => WeaponSpec {
            behavior: "railgun",
            damage: 42.0,
            fire_rate: 0.75,
            speed: 1100.0,
            size: 6.0,
            spread: 0.0,
            burst: 1,
            color: 0x39d9df,
            lifetime: 180,
        },
        "popper" => WeaponSpec {
            behavior: "popper",
            damage: 9.0,
            fire_rate: 5.2,
            speed: 520.0,
            size: 6.0,
            spread: 0.0,
            burst: 1,
            color: 0x47b8e8,
            lifetime: 1900,
        },
        "bonker" => WeaponSpec {
            behavior: "bonker",
            damage: 34.0,
            fire_rate: 1.15,
            speed: 320.0,
            size: 14.0,
            spread: 0.0,
            burst: 1,
            color: 0xff725e,
            lifetime: 1900,
        },
        "sprinkler" => WeaponSpec {
            behavior: "sprinkler",
            damage: 7.0,
            fire_rate: 2.4,
            speed: 420.0,
            size: 6.0,
            spread: 0.2,
            burst: 3,
            color: 0x936ee8,
            lifetime: 800,
        },
        "boomer" => WeaponSpec {
            behavior: "boomerang",
            damage: 16.0,
            fire_rate: 1.35,
            speed: 390.0,
            size: 11.0,
            spread: 0.0,
            burst: 1,
            color: 0xf08a24,
            lifetime: 2300,
        },
        "wiggler" => WeaponSpec {
            behavior: "wiggler",
            damage: 11.0,
            fire_rate: 2.2,
            speed: 410.0,
            size: 8.0,
            spread: 0.0,
            burst: 1,
            color: 0x30b27a,
            lifetime: 1900,
        },
        "splitter" => WeaponSpec {
            behavior: "splitter",
            damage: 13.0,
            fire_rate: 1.4,
            speed: 380.0,
            size: 11.0,
            spread: 0.0,
            burst: 1,
            color: 0xe7658c,
            lifetime: 1900,
        },
        "ricochet" => WeaponSpec {
            behavior: "ricochet",
            damage: 12.0,
            fire_rate: 1.8,
            speed: 440.0,
            size: 8.0,
            spread: 0.0,
            burst: 1,
            color: 0xf6c453,
            lifetime: 3400,
        },
        _ => return None,
    })
}
fn spawn_projectile(
    world: &mut World,
    player: &PlayerState,
    attachment: &Attachment,
    spec: &WeaponSpec,
    offset: f32,
) {
    let mount_angle = attachment.mount as f32 * std::f32::consts::FRAC_PI_4;
    let angle = player.rotation
        + mount_angle
        + offset
        + if spec.behavior == "flamethrower" {
            rand::rng().random_range(-0.09..0.09)
        } else {
            0.0
        };
    let radius = if spec.behavior == "railgun" || spec.behavior == "flamethrower" {
        if attachment.layer == 0 { 110.0 } else { 146.24 }
    } else if attachment.layer == 0 {
        112.0
    } else {
        166.0
    };
    world.next_id += 1;
    world.projectiles.push(Projectile {
        id: format!("p{}", world.next_id),
        owner_id: player.id.clone(),
        behavior: spec.behavior.into(),
        x: player.x + (player.rotation + mount_angle).cos() * radius,
        y: player.y + (player.rotation + mount_angle).sin() * radius,
        vx: angle.cos() * spec.speed,
        vy: angle.sin() * spec.speed,
        rotation: angle,
        size: spec.size,
        color: spec.color,
        damage: spec.damage,
        age: 0,
        lifetime: spec.lifetime,
        base_angle: angle,
        base_speed: spec.speed,
        phase: world.next_id as f32 * 0.73,
        split: false,
        pierce: if spec.behavior == "flamethrower" {
            99
        } else if spec.behavior == "bonker" {
            2
        } else {
            1
        },
        hit: HashSet::new(),
    });
}
fn child_projectile(id: u64, parent: &Projectile, offset: f32) -> Projectile {
    let angle = parent.base_angle + offset;
    Projectile {
        id: format!("p{id}"),
        owner_id: parent.owner_id.clone(),
        behavior: "popper".into(),
        x: parent.x,
        y: parent.y,
        vx: angle.cos() * parent.base_speed * 1.08,
        vy: angle.sin() * parent.base_speed * 1.08,
        rotation: angle,
        size: 6.0,
        color: 0xe7658c,
        damage: parent.damage * 0.58,
        age: 0,
        lifetime: 1200,
        base_angle: angle,
        base_speed: parent.base_speed * 1.08,
        phase: id as f32,
        split: true,
        pierce: 1,
        hit: HashSet::new(),
    }
}
fn enemy_weapon(id: &str) -> Option<(u64, u8, f32, f32, f32)> {
    match id {
        "prism" => Some((3200, 1, 0.0, 260.0, 4.0)),
        "sentinel" => Some((3800, 2, 0.13, 240.0, 5.0)),
        "bastion" => Some((4400, 3, 0.22, 220.0, 6.0)),
        _ => None,
    }
}
fn update_enemy_attacks(world: &mut World, players: &HashMap<String, ConnectedPlayer>) {
    world
        .enemy_attacks
        .retain(|id, _| world.enemies.iter().any(|e| e.id == *id && e.health > 0.0));
    let mut count = world
        .projectiles
        .iter()
        .filter(|p| p.behavior == "hostile")
        .count();
    for enemy in &world.enemies {
        let Some((cooldown, burst, spread, speed, damage)) = enemy_weapon(&enemy.variant) else {
            continue;
        };
        if enemy.health <= 0.0 {
            continue;
        }
        let attack = world
            .enemy_attacks
            .entry(enemy.id.clone())
            .or_insert((world.elapsed + 2000 + (enemy.phase * 200.0) as u64, 0));
        let target = players.values().min_by(|a, b| {
            distance(enemy.x, enemy.y, a.state.x, a.state.y)
                .total_cmp(&distance(enemy.x, enemy.y, b.state.x, b.state.y))
        });
        let Some(target) = target else {
            continue;
        };
        if distance(enemy.x, enemy.y, target.state.x, target.state.y) > 750.0 {
            attack.1 = 0;
            continue;
        }
        if world.elapsed < attack.0 {
            continue;
        }
        if attack.1 == 0 {
            attack.1 = world.elapsed;
        }
        if world.elapsed.saturating_sub(attack.1) < 500 {
            continue;
        }
        let angle = (target.state.y - enemy.y).atan2(target.state.x - enemy.x);
        for i in 0..burst {
            if count >= 64 {
                break;
            }
            count += 1;
            let a = angle + (i as f32 - (burst - 1) as f32 / 2.0) * spread;
            let r = enemy.size / 2.0 + 10.0;
            world.next_id += 1;
            world.projectiles.push(Projectile {
                id: format!("p{}", world.next_id),
                owner_id: enemy.id.clone(),
                behavior: "hostile".into(),
                x: enemy.x + a.cos() * r,
                y: enemy.y + a.sin() * r,
                vx: a.cos() * speed,
                vy: a.sin() * speed,
                rotation: a,
                size: 6.5,
                color: 0xffffff,
                damage,
                age: 0,
                lifetime: 3200,
                base_angle: a,
                base_speed: speed,
                phase: 0.0,
                split: false,
                pierce: 1,
                hit: HashSet::new(),
            });
        }
        *attack = (world.elapsed + cooldown, 0);
    }
}

fn enemy_tier_weights(level: u8) -> [f32; 3] {
    let level = level.clamp(1, 26) as f32;
    let weak = 0.94 - 0.82 * (level - 1.0) / 25.0;
    let strong = 0.6 * ((level - 4.0) / 22.0).max(0.0);
    [weak, 1.0 - weak - strong, strong]
}
fn enemy_variant_weight(level: u8, unlock: u8) -> f32 {
    if level < unlock {
        0.0
    } else if unlock == 1 {
        1.0
    } else {
        ((level - unlock + 1) as f32 * 0.2).min(1.5)
    }
}
fn weighted_index(weights: &[f32], roll: f32) -> usize {
    let mut remaining = roll.clamp(0.0, 0.999999) * weights.iter().sum::<f32>();
    for (index, weight) in weights.iter().enumerate() {
        remaining -= weight;
        if remaining < 0.0 {
            return index;
        }
    }
    0
}
fn spawn_enemy(world: &mut World, cx: f32, cy: f32, player_level: u8) {
    let mut rng = rand::rng();
    let variants = [
        ("bubble", 42.0, 72.0, 120.0, 0.72, 0.7, 1),
        ("chunk", 58.0, 0.0, 0.0, 1.0, 1.0, 1),
        ("kite", 54.0, 96.0, 170.0, 0.82, 0.86, 1),
        ("honey", 72.0, 0.0, 0.0, 1.38, 1.28, 3),
        ("dart", 48.0, 128.0, 210.0, 0.62, 1.08, 5),
        ("loaf", 86.0, 0.0, 0.0, 1.65, 1.45, 7),
        ("prism", 64.0, 82.0, 180.0, 1.15, 1.05, 4),
        ("sentinel", 82.0, 38.0, 100.0, 1.9, 1.5, 9),
        ("bastion", 100.0, 24.0, 80.0, 2.65, 1.8, 15),
    ];
    let weights: Vec<f32> = variants
        .iter()
        .map(|v| enemy_variant_weight(player_level, v.6))
        .collect();
    let index = weighted_index(&weights, rng.random());
    let (v, size, speed, roam, hp_scale, damage_scale, _) = variants[index];
    let level = weighted_index(&enemy_tier_weights(player_level), rng.random()) as u8;
    let base_hp = [24.0, 52.0, 95.0][level as usize];
    let base_damage = [2.0, 4.5, 8.0][level as usize];
    let angle = rng.random_range(0.0..std::f32::consts::TAU);
    let radius = rng.random_range(330.0..1300.0);
    world.next_id += 1;
    let x = cx + angle.cos() * radius;
    let y = cy + angle.sin() * radius;
    world.enemies.push(Enemy {
        id: format!("e{}", world.next_id),
        variant: v.into(),
        level,
        x,
        y,
        home_x: x,
        home_y: y,
        health: base_hp * hp_scale,
        max_health: base_hp * hp_scale,
        size,
        speed,
        roam,
        phase: rng.random_range(0.0..std::f32::consts::TAU),
        contact_damage: base_damage * damage_scale,
        knock_x: 0.0,
        knock_y: 0.0,
    });
}

async fn world_snapshot(room: &Room) -> ServerMessage {
    let players = room
        .players
        .lock()
        .await
        .values()
        .map(|p| p.state.clone())
        .collect();
    let world = room.world.lock().await;
    ServerMessage::WorldSnapshot {
        revision: world.revision,
        players,
        enemies: world
            .enemies
            .iter()
            .map(|e| EnemyState {
                id: e.id.clone(),
                variant: e.variant.clone(),
                level: e.level,
                x: e.x,
                y: e.y,
                health: e.health,
                max_health: e.max_health,
                burning: world.burns.contains_key(&e.id),
                charging: world
                    .enemy_attacks
                    .get(&e.id)
                    .is_some_and(|(_, charge)| *charge > 0),
            })
            .collect(),
        projectiles: world
            .projectiles
            .iter()
            .map(|p| ProjectileState {
                id: p.id.clone(),
                owner_id: p.owner_id.clone(),
                behavior: p.behavior.clone(),
                x: p.x,
                y: p.y,
                rotation: p.rotation,
                size: p.size,
                color: p.color,
                length: (p.behavior == "railgun").then_some(p.base_speed),
                age_ms: (p.behavior == "railgun" || p.behavior == "flamethrower").then_some(p.age),
            })
            .collect(),
        stats: world.stats.clone(),
    }
}
async fn send_direct(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    message: &ServerMessage,
) {
    if let Ok(text) = serde_json::to_string(message) {
        let _ = sender.send(Message::Text(text.into())).await;
    }
}
fn queue_message(sender: &mpsc::Sender<Message>, message: &ServerMessage) {
    if let Ok(text) = serde_json::to_string(message) {
        let _ = sender.try_send(Message::Text(text.into()));
    }
}
async fn broadcast(room: &Room, message: &ServerMessage, except: Option<&str>) {
    let players = room.players.lock().await;
    for (id, player) in players.iter() {
        if except != Some(id.as_str()) {
            queue_message(&player.sender, message);
        }
    }
}
pub fn normalize_room_id(value: &str) -> String {
    value
        .trim()
        .to_ascii_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(6)
        .collect()
}
pub fn valid_build(build: &TankBuild) -> bool {
    build.version == 2
        && !build.name.trim().is_empty()
        && build.name.len() <= 24
        && build.color.len() == 7
        && build.color.starts_with('#')
        && build.color[1..].chars().all(|c| c.is_ascii_hexdigit())
        && build.attachments.len() <= MAX_ATTACHMENTS
        && build.attachments.iter().all(|a| {
            !a.uid.is_empty()
                && a.uid.len() <= 80
                && !a.part_id.is_empty()
                && a.part_id.len() <= 32
                && a.mount < 8
                && a.layer < 2
        })
}
type Point = (f32, f32);
fn beam_hits_enemy(x: f32, y: f32, angle: f32, range: f32, enemy: &Enemy) -> bool {
    let points = transform_outline(&enemy_outline(enemy), enemy.x, enemy.y, 0.0, 1.0);
    let (c, s) = (angle.cos(), angle.sin());
    let points: Vec<Point> = points
        .iter()
        .map(|p| {
            (
                (p.0 - x) * c + (p.1 - y) * s,
                -(p.0 - x) * s + (p.1 - y) * c,
            )
        })
        .collect();
    let mut inside = false;
    for i in 0..points.len() {
        let a = points[i];
        let b = points[(i + 1) % points.len()];
        if (a.1 > 0.0) != (b.1 > 0.0) {
            let hit = a.0 + (b.0 - a.0) * (-a.1) / (b.1 - a.1);
            if hit >= 0.0 && hit <= range {
                return true;
            }
            if hit < 0.0 {
                inside = !inside;
            }
        }
        if a.1.abs() < 1e-6 && a.0 >= 0.0 && a.0 <= range {
            return true;
        }
    }
    inside
}

fn enemy_outline(enemy: &Enemy) -> Vec<Point> {
    let r = enemy.size * 0.5;
    match enemy.variant.as_str() {
        "dart" => vec![
            (r, 0.0),
            (-r * 0.72, -r * 0.72),
            (-r * 0.42, 0.0),
            (-r * 0.72, r * 0.72),
        ],
        "kite" | "honey" | "prism" | "sentinel" | "bastion" => {
            let sides = match enemy.variant.as_str() {
                "kite" => 4,
                "prism" => 3,
                "sentinel" => 5,
                "bastion" => 8,
                _ => 6,
            };
            (0..sides)
                .map(|i| {
                    let angle = -std::f32::consts::FRAC_PI_2
                        + i as f32 * std::f32::consts::TAU / sides as f32;
                    (angle.cos() * r, angle.sin() * r)
                })
                .collect()
        }
        "chunk" => {
            let corner = r * 0.3;
            let mut points = Vec::new();
            for (x, y, start) in [
                (r - corner, r - corner, 0.0),
                (-r + corner, r - corner, 90.0),
                (-r + corner, -r + corner, 180.0),
                (r - corner, -r + corner, 270.0),
            ] {
                for i in 0..=4 {
                    let angle = (start + i as f32 * 22.5).to_radians();
                    points.push((x + angle.cos() * corner, y + angle.sin() * corner));
                }
            }
            points
        }
        "loaf" => (0..26)
            .map(|i| {
                let right = i < 13;
                let angle = (if right {
                    -std::f32::consts::FRAC_PI_2
                } else {
                    std::f32::consts::FRAC_PI_2
                }) + (i % 13) as f32 * std::f32::consts::PI / 12.0;
                (
                    (if right { 1.0 } else { -1.0 }) * r * 0.38 + angle.cos() * r * 0.62,
                    angle.sin() * r * 0.62,
                )
            })
            .collect(),
        _ => (0..24)
            .map(|i| {
                let angle = i as f32 * std::f32::consts::TAU / 24.0;
                (angle.cos() * r, angle.sin() * r)
            })
            .collect(),
    }
}
fn polygon_separation(a: &[Point], b: &[Point]) -> Option<Point> {
    let mut depth = f32::INFINITY;
    let mut normal = (0.0, 0.0);
    for points in [a, b] {
        for i in 0..points.len() {
            let p = points[i];
            let q = points[(i + 1) % points.len()];
            let length = (q.0 - p.0).hypot(q.1 - p.1);
            if length < 0.001 {
                continue;
            }
            let axis = (-(q.1 - p.1) / length, (q.0 - p.0) / length);
            let project = |poly: &[Point]| {
                poly.iter()
                    .fold((f32::INFINITY, f32::NEG_INFINITY), |(min, max), p| {
                        let v = p.0 * axis.0 + p.1 * axis.1;
                        (min.min(v), max.max(v))
                    })
            };
            let (amin, amax) = project(a);
            let (bmin, bmax) = project(b);
            let left = bmax - amin;
            let right = amax - bmin;
            if left <= 0.0 || right <= 0.0 {
                return None;
            }
            let signed = if left < right { left } else { -right };
            if signed.abs() < depth {
                depth = signed.abs();
                normal = (axis.0 * signed, axis.1 * signed);
            }
        }
    }
    Some(normal)
}
fn enemy_separation(a: &Enemy, b: &Enemy) -> Option<Point> {
    let pieces = |enemy: &Enemy| {
        let p = enemy_outline(enemy);
        let pieces = if enemy.variant == "dart" {
            vec![vec![p[0], p[1], p[2]], vec![p[0], p[2], p[3]]]
        } else {
            vec![p]
        };
        pieces
            .into_iter()
            .map(|poly| {
                poly.into_iter()
                    .map(|p| (p.0 + enemy.x, p.1 + enemy.y))
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>()
    };
    let mut result: Option<Point> = None;
    for pa in pieces(a) {
        for pb in pieces(b) {
            if let Some(offset) = polygon_separation(&pa, &pb)
                && result.is_none_or(|v| offset.0.hypot(offset.1) > v.0.hypot(v.1))
            {
                result = Some(offset);
            }
        }
    }
    result
}
fn ellipse_outline(x: f32, y: f32, rx: f32, ry: f32) -> Vec<Point> {
    (0..24)
        .map(|i| {
            let a = i as f32 * std::f32::consts::TAU / 24.0;
            (x + a.cos() * rx, y + a.sin() * ry)
        })
        .collect()
}
fn box_outline(x: f32, y: f32, w: f32, h: f32) -> Vec<Point> {
    vec![
        (x - w / 2.0, y - h / 2.0),
        (x + w / 2.0, y - h / 2.0),
        (x + w / 2.0, y + h / 2.0),
        (x - w / 2.0, y + h / 2.0),
    ]
}
fn transform_outline(points: &[Point], x: f32, y: f32, angle: f32, scale: f32) -> Vec<Point> {
    let (s, c) = angle.sin_cos();
    points
        .iter()
        .map(|p| {
            (
                x + (p.0 * c - p.1 * s) * scale,
                y + (p.0 * s + p.1 * c) * scale,
            )
        })
        .collect()
}
fn tank_outline(build: &TankBuild, x: f32, y: f32, rotation: f32) -> Vec<Vec<Point>> {
    let mut shapes = vec![ellipse_outline(0.0, 0.0, 60.0, 60.0)];
    let mut depths = HashMap::<u8, u8>::new();
    for a in &build.attachments {
        depths
            .entry(a.mount)
            .and_modify(|layer| *layer = (*layer).max(a.layer))
            .or_insert(a.layer);
    }
    for (mount, layer) in depths {
        let end = if layer == 0 { 92.0 } else { 134.0 };
        shapes.push(transform_outline(
            &box_outline((46.0 + end) / 2.0, 0.0, end - 46.0, 18.0),
            0.0,
            0.0,
            mount as f32 * std::f32::consts::FRAC_PI_4,
            1.0,
        ));
    }
    for a in &build.attachments {
        let shape = match a.part_id.as_str() {
            "popper" | "bonker" | "ricochet" | "railgun" | "flamethrower" => box_outline(
                19.0,
                0.0,
                58.0,
                if a.part_id == "bonker" { 34.0 } else { 26.0 },
            ),
            "sprinkler" | "boomer" | "wiggler" | "splitter" => vec![
                (-15.0, -18.0),
                (24.0, -18.0),
                (46.0, 0.0),
                (24.0, 18.0),
                (-15.0, 18.0),
            ],
            "rocket" | "twin-booster" | "micro-booster" => vec![
                (-28.0, -19.0),
                (11.0, -19.0),
                (35.0, -15.0),
                (35.0, 15.0),
                (11.0, 19.0),
                (-28.0, 19.0),
            ],
            "bubble" | "brick" | "bumper" => vec![
                (-18.0, -28.0),
                (17.0, -28.0),
                (30.0, -20.0),
                (38.0, -7.0),
                (38.0, 7.0),
                (30.0, 20.0),
                (17.0, 28.0),
                (-18.0, 28.0),
            ],
            "wheel" | "crawler" => ellipse_outline(4.0, 0.0, 31.0, 22.0),
            "spike" | "drill" => vec![(-25.0, -22.0), (41.0, 0.0), (-25.0, 22.0)],
            _ => ellipse_outline(2.0, 0.0, 25.0, 25.0),
        };
        let angle = a.mount as f32 * std::f32::consts::FRAC_PI_4;
        let radius = if a.layer == 0 { 62.0 } else { 104.0 };
        shapes.push(transform_outline(
            &shape,
            angle.cos() * radius,
            angle.sin() * radius,
            angle,
            if a.layer == 0 { 1.0 } else { 0.88 },
        ));
    }
    shapes
        .iter()
        .map(|p| transform_outline(p, x, y, rotation, 1.0))
        .collect()
}
fn tank_enemy_contact(tank: &[Vec<Point>], enemy: &Enemy) -> bool {
    // Two pixels of contact tolerance allow the client to report a solid edge touch.
    let scale = 1.0 + 2.0 / (enemy.size * 0.5);
    let p = enemy_outline(enemy);
    let pieces = if enemy.variant == "dart" {
        vec![vec![p[0], p[1], p[2]], vec![p[0], p[2], p[3]]]
    } else {
        vec![p]
    };
    pieces.iter().any(|piece| {
        let outline = transform_outline(piece, enemy.x, enemy.y, 0.0, scale);
        tank.iter().any(|shape| {
            let bounds = shape.iter().fold(
                (
                    f32::INFINITY,
                    f32::INFINITY,
                    f32::NEG_INFINITY,
                    f32::NEG_INFINITY,
                ),
                |(minx, miny, maxx, maxy), p| {
                    (minx.min(p.0), miny.min(p.1), maxx.max(p.0), maxy.max(p.1))
                },
            );
            let radius = enemy.size * 0.71 + 2.0;
            enemy.x + radius >= bounds.0
                && enemy.x - radius <= bounds.2
                && enemy.y + radius >= bounds.1
                && enemy.y - radius <= bounds.3
                && polygon_separation(shape, &outline).is_some()
        })
    })
}

fn shape_impact_damage(speed: f32, health: f32) -> f32 {
    if speed < 60.0 {
        0.0
    } else {
        (health * 0.3).ceil().min((speed / 18.0).round().max(2.0))
    }
}
fn collide_enemies(world: &mut World, previous: &HashMap<String, Point>) {
    let mut velocities: HashMap<String, Point> = world
        .enemies
        .iter()
        .map(|e| {
            let p = previous.get(&e.id).copied().unwrap_or((e.x, e.y));
            (
                e.id.clone(),
                (
                    (e.x - p.0) * 1000.0 / TICK_MS as f32,
                    (e.y - p.1) * 1000.0 / TICK_MS as f32,
                ),
            )
        })
        .collect();
    world
        .contacts
        .retain(|_, last| world.elapsed.saturating_sub(*last) < 1000);
    for i in 0..world.enemies.len() {
        for j in i + 1..world.enemies.len() {
            let (left, right) = world.enemies.split_at_mut(j);
            let a = &mut left[i];
            let b = &mut right[0];
            if a.health <= 0.0
                || b.health <= 0.0
                || distance(a.x, a.y, b.x, b.y)
                    > (a.size + b.size) * std::f32::consts::FRAC_1_SQRT_2
            {
                continue;
            }
            let Some(offset) = enemy_separation(a, b) else {
                continue;
            };
            let depth = offset.0.hypot(offset.1);
            if depth < 0.001 {
                continue;
            }
            let n = (offset.0 / depth, offset.1 / depth);
            let av = velocities[&a.id];
            let bv = velocities[&b.id];
            let closing = (bv.0 - av.0) * n.0 + (bv.1 - av.1) * n.1;
            for (enemy, sign) in [(&mut *a, 0.51), (&mut *b, -0.51)] {
                enemy.x += offset.0 * sign;
                enemy.y += offset.1 * sign;
                enemy.home_x += offset.0 * sign;
                enemy.home_y += offset.1 * sign;
            }
            if closing <= 0.0 {
                continue;
            }
            let impulse = closing * 0.8;
            a.knock_x += n.0 * impulse;
            a.knock_y += n.1 * impulse;
            b.knock_x -= n.0 * impulse;
            b.knock_y -= n.1 * impulse;
            velocities.insert(a.id.clone(), (av.0 + n.0 * impulse, av.1 + n.1 * impulse));
            velocities.insert(b.id.clone(), (bv.0 - n.0 * impulse, bv.1 - n.1 * impulse));
            let key = format!("shape:{}:{}", a.id, b.id);
            if world
                .contacts
                .get(&key)
                .is_some_and(|last| world.elapsed.saturating_sub(*last) < 520)
            {
                continue;
            }
            let da = shape_impact_damage(closing, a.max_health);
            let db = shape_impact_damage(closing, b.max_health);
            if da > 0.0 || db > 0.0 {
                world.contacts.insert(key, world.elapsed);
                a.health -= da;
                b.health -= db;
            }
        }
    }
}

fn smasher_knockback(ram_damage: f32, speed: f32) -> f32 {
    if ram_damage <= 8.0 || speed < 30.0 {
        return 0.0;
    }
    let impact = (speed / 170.0).clamp(0.0, 1.0);
    (220.0 * ((ram_damage - 8.0) / 28.0).sqrt()).min(480.0) * (0.3 + 0.7 * impact)
}

fn wander_noise(step: f32, seed: f32) -> f32 {
    let hash = |index: f32| {
        let value = (index as f64 * 127.1 + seed as f64 * 311.7).sin() * 43758.5453;
        ((value - value.floor()) * 2.0 - 1.0) as f32
    };
    let index = step.floor();
    let fraction = step - index;
    let blend = fraction * fraction * (3.0 - 2.0 * fraction);
    hash(index) + (hash(index + 1.0) - hash(index)) * blend
}

fn magnet_pull_distance(power: f32, distance: f32, stop_radius: f32, delta_ms: f32) -> f32 {
    if power <= 0.0 || distance <= stop_radius {
        return 0.0;
    }
    let strength = (power / 60.0).sqrt();
    let range = stop_radius + 240.0 * strength;
    if distance >= range {
        return 0.0;
    }
    let speed =
        150.0 * strength * (0.25 + 0.75 * (1.0 - (distance - stop_radius) / (range - stop_radius)));
    (distance - stop_radius).min(speed * delta_ms.clamp(0.0, 50.0) / 1000.0)
}

fn build_armor(build: &TankBuild) -> f32 {
    70.0 + build
        .attachments
        .iter()
        .map(|a| match a.part_id.as_str() {
            "bubble" => 40.0,
            "brick" => 75.0,
            "bumper" => 20.0,
            "spike" => 18.0,
            _ => 0.0,
        })
        .sum::<f32>()
}
fn build_ram_damage(build: &TankBuild) -> f32 {
    8.0 + build
        .attachments
        .iter()
        .map(|a| match a.part_id.as_str() {
            "spike" => 28.0,
            "drill" => 45.0,
            _ => 0.0,
        })
        .sum::<f32>()
}
fn distance(ax: f32, ay: f32, bx: f32, by: f32) -> f32 {
    ((ax - bx).powi(2) + (ay - by).powi(2)).sqrt()
}
fn generate_room_id() -> String {
    let mut rng = rand::rng();
    (0..6)
        .map(|_| ROOM_ALPHABET[rng.random_range(0..ROOM_ALPHABET.len())] as char)
        .collect()
}
fn normalize_angle(value: f32) -> f32 {
    (value + std::f32::consts::PI).rem_euclid(std::f32::consts::TAU) - std::f32::consts::PI
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio_tungstenite::{connect_async, tungstenite::Message as ClientWsMessage};
    fn build() -> TankBuild {
        TankBuild {
            version: 2,
            name: "Test Thing".into(),
            color: "#5b7cfa".into(),
            attachments: vec![Attachment {
                uid: "one".into(),
                part_id: "popper".into(),
                mount: 0,
                layer: 0,
            }],
        }
    }
    #[test]
    fn railgun_pierces_only_shapes_on_the_finite_beam_and_damages_once() {
        let enemy = |id: &str, x: f32, y: f32| Enemy {
            id: id.into(),
            variant: "bubble".into(),
            level: 0,
            x,
            y,
            home_x: x,
            home_y: y,
            health: 100.0,
            max_health: 100.0,
            size: 42.0,
            speed: 0.0,
            roam: 0.0,
            phase: 0.0,
            contact_damage: 0.0,
            knock_x: 0.0,
            knock_y: 0.0,
        };
        let mut world = World {
            enemies: vec![
                enemy("near", 200.0, 0.0),
                enemy("far", 900.0, 0.0),
                enemy("miss", 300.0, 25.0),
                enemy("beyond", 1300.0, 0.0),
                enemy("behind", 0.0, 0.0),
            ],
            ..World::default()
        };
        let player = PlayerState {
            id: "one".into(),
            build: build(),
            x: 0.0,
            y: 0.0,
            rotation: 0.0,
            health: 70.0,
            max_health: 70.0,
            progression: Progression::default(),
        };
        let spec = weapon_spec("railgun").unwrap();
        spawn_projectile(
            &mut world,
            &player,
            &player.build.attachments[0],
            &spec,
            0.0,
        );
        update_projectiles(&mut world, &mut HashMap::new());
        assert_eq!(world.stats.hits, 2);
        assert_eq!(
            world.enemies.iter().map(|e| e.health).collect::<Vec<_>>(),
            vec![58.0, 58.0, 100.0, 100.0, 100.0]
        );
        update_projectiles(&mut world, &mut HashMap::new());
        assert_eq!(world.stats.hits, 2);
        for _ in 0..5 {
            update_projectiles(&mut world, &mut HashMap::new());
        }
        assert!(world.projectiles.is_empty());
    }
    #[tokio::test]
    async fn room_limit_is_atomic_and_releases_capacity_when_a_room_is_removed() {
        let state = AppState::default();
        let responses =
            futures_util::future::join_all((0..32).map(|_| create_room(State(state.clone()))))
                .await;
        assert_eq!(
            responses
                .iter()
                .filter(|r| r.status() == StatusCode::OK)
                .count(),
            MAX_ROOMS
        );
        assert_eq!(state.rooms.read().await.len(), MAX_ROOMS);
        for response in responses
            .into_iter()
            .filter(|r| r.status() != StatusCode::OK)
        {
            assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
            let body = axum::body::to_bytes(response.into_body(), 4096)
                .await
                .unwrap();
            let error: serde_json::Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(error["code"], "room_limit_reached");
        }
        let id = state.rooms.read().await.keys().next().unwrap().clone();
        let removed = state.rooms.write().await.remove(&id).unwrap();
        removed.closed.store(true, Ordering::Relaxed);
        assert_eq!(
            create_room(State(state.clone())).await.status(),
            StatusCode::OK
        );
        assert_eq!(state.rooms.read().await.len(), MAX_ROOMS);
    }
    #[test]
    fn progression_curve_caps_levels_and_validates_spending() {
        let mut p = Progression::default();
        assert_eq!(p.level(), 1);
        assert!(!p.spend("damage"));
        p.xp = 30;
        assert_eq!(p.level(), 2);
        assert!(p.spend("health"));
        assert!(!p.spend("damage"));
        p.xp = 135;
        assert_eq!(p.level(), 4);
        assert!(!p.spend("unknown"));
        p.xp = 100000;
        assert_eq!(p.level(), 26);
        for _ in 0..5 {
            assert!(p.spend("damage"));
        }
        assert!(!p.spend("damage"));
        for stat in ["reload", "speed", "health", "ram"] {
            for _ in 0..5 {
                p.spend(stat);
            }
        }
        assert!(!p.spend("health"));
    }
    #[test]
    fn enemy_difficulty_grows_without_removing_easy_targets() {
        let mut previous = enemy_tier_weights(1);
        for level in 1..=26 {
            let weights = enemy_tier_weights(level);
            assert!((weights.iter().sum::<f32>() - 1.0).abs() < 0.0001);
            assert!(weights[0] >= 0.119 && weights[0] <= previous[0]);
            assert!(weights[2] >= previous[2]);
            previous = weights;
        }
        assert_eq!(enemy_tier_weights(1)[2], 0.0);
        assert!((enemy_tier_weights(26)[2] - 0.6).abs() < 0.0001);
        for (level, allowed) in [
            (1, vec!["bubble", "chunk", "kite"]),
            (3, vec!["bubble", "chunk", "kite", "honey"]),
        ] {
            let mut world = World::default();
            for _ in 0..200 {
                spawn_enemy(&mut world, 0.0, 0.0, level);
            }
            assert!(
                world
                    .enemies
                    .iter()
                    .all(|e| allowed.contains(&e.variant.as_str()))
            );
            assert!(world.enemies.iter().all(|e| e.level < 2));
        }
        let weights: Vec<f32> = [1, 1, 1, 3, 5, 7, 4, 9, 15]
            .iter()
            .map(|unlock| enemy_variant_weight(26, *unlock))
            .collect();
        for i in 0..9 {
            assert!((0..1000).any(|r| weighted_index(&weights, r as f32 / 1000.0) == i));
        }
    }
    #[test]
    fn armed_enemies_warn_before_firing_and_hostile_shots_damage_players_once() {
        let mut world = World::default();
        world.enemies.push(Enemy {
            id: "armed".into(),
            variant: "prism".into(),
            level: 0,
            x: 330.0,
            y: 0.0,
            home_x: 330.0,
            home_y: 0.0,
            health: 100.0,
            max_health: 100.0,
            size: 64.0,
            speed: 0.0,
            roam: 0.0,
            phase: 0.0,
            contact_damage: 0.0,
            knock_x: 0.0,
            knock_y: 0.0,
        });
        let (tx, _) = mpsc::channel(4);
        let mut tank = build();
        tank.attachments.clear();
        let mut players = HashMap::from([(
            "one".into(),
            ConnectedPlayer {
                state: PlayerState {
                    id: "one".into(),
                    build: tank,
                    x: 0.0,
                    y: 0.0,
                    rotation: 0.0,
                    health: 100.0,
                    max_health: 100.0,
                    progression: Progression::default(),
                },
                sender: tx,
                firing: false,
                last_fire: HashMap::new(),
                last_damage: 0,
                impact_speed: 0.0,
                last_state_received: std::time::Instant::now(),
            },
        )]);
        update_enemy_attacks(&mut world, &players);
        world.elapsed = 2000;
        update_enemy_attacks(&mut world, &players);
        assert_eq!(world.enemy_attacks["armed"].1, 2000);
        assert!(world.projectiles.is_empty());
        world.elapsed = 2499;
        update_enemy_attacks(&mut world, &players);
        assert!(world.projectiles.is_empty());
        world.elapsed = 2500;
        update_enemy_attacks(&mut world, &players);
        assert_eq!(world.projectiles.len(), 1);
        for _ in 0..40 {
            world.elapsed += TICK_MS;
            update_projectiles(&mut world, &mut players);
        }
        assert_eq!(players["one"].state.health, 96.0);
        assert!(world.projectiles.is_empty());
        world.enemies[0].health = 0.0;
        world.elapsed = 10000;
        update_enemy_attacks(&mut world, &players);
        assert!(world.projectiles.is_empty());
        assert!(world.enemy_attacks.is_empty());
        assert!(enemy_weapon("bubble").is_none());
        assert_eq!(enemy_weapon("sentinel").unwrap().1, 2);
        assert_eq!(enemy_weapon("bastion").unwrap().1, 3);
    }
    #[test]
    fn flame_ignites_once_and_burn_damage_lingers_then_expires_without_stacking() {
        let mut burn = ignite_burn(None, 0, 2.0);
        for i in 1..=20 {
            burn = ignite_burn(Some(&burn), i * 10, 1.0);
        }
        assert_eq!(burn.next_tick, 250);
        assert_eq!(burn.damage, 2.0);
        assert_eq!(ignite_burn(Some(&burn), 220, 3.2).damage, 3.2);
        assert_eq!(ignite_burn(Some(&burn), 5000, 1.0).damage, 1.0);
        let mut world = World::default();
        spawn_enemy(&mut world, 0.0, 0.0, 1);
        let enemy = &mut world.enemies[0];
        enemy.variant = "chunk".into();
        enemy.x = 230.0;
        enemy.y = 0.0;
        enemy.size = 58.0;
        enemy.health = 200.0;
        enemy.max_health = 200.0;
        let id = enemy.id.clone();
        let player = PlayerState {
            id: "one".into(),
            build: build(),
            x: 0.0,
            y: 0.0,
            rotation: 0.0,
            health: 70.0,
            max_health: 70.0,
            progression: Progression::default(),
        };
        spawn_projectile(
            &mut world,
            &player,
            &player.build.attachments[0],
            &weapon_spec("flamethrower").unwrap(),
            0.0,
        );
        for _ in 0..26 {
            world.elapsed += TICK_MS;
            update_projectiles(&mut world, &mut HashMap::new());
            update_burns(&mut world);
        }
        assert_eq!(world.stats.hits, 1);
        assert!(world.burns.contains_key(&id));
        assert!(world.projectiles.is_empty());
        world.elapsed = 10000;
        update_burns(&mut world);
        assert!((world.enemies[0].health - 180.75).abs() < 0.001);
        assert!(world.burns.is_empty());
        let hp = world.enemies[0].health;
        update_burns(&mut world);
        assert_eq!(world.enemies[0].health, hp);
    }
    #[tokio::test]
    async fn http_rate_limits_apply_before_room_creation_and_recover_with_new_clients() {
        use tower::ServiceExt;
        let state = AppState::default();
        let router = app(state.clone());
        for i in 0..120 {
            let response = router
                .clone()
                .oneshot(
                    axum::http::Request::builder()
                        .uri("/api/health")
                        .extension(axum::extract::ConnectInfo(
                            "192.0.2.1:4321".parse::<std::net::SocketAddr>().unwrap(),
                        ))
                        .header("x-forwarded-for", format!("203.0.113.{i}"))
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }
        let response = router
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/rooms")
                    .extension(axum::extract::ConnectInfo(
                        "192.0.2.1:4321".parse::<std::net::SocketAddr>().unwrap(),
                    ))
                    .method("POST")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(response.headers()["retry-after"], "60");
        assert!(state.rooms.read().await.is_empty());
        let response = router
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/health")
                    .extension(axum::extract::ConnectInfo(
                        "192.0.2.2:4321".parse::<std::net::SocketAddr>().unwrap(),
                    ))
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
    #[test]
    fn magnets_pull_only_within_reach_and_stack() {
        assert_eq!(magnet_pull_distance(0.0, 200.0, 42.0, 33.0), 0.0);
        assert_eq!(magnet_pull_distance(60.0, 300.0, 42.0, 33.0), 0.0);
        assert_eq!(magnet_pull_distance(60.0, 42.0, 42.0, 33.0), 0.0);
        assert!(magnet_pull_distance(60.0, 200.0, 42.0, 33.0) > 0.0);
        assert!(magnet_pull_distance(240.0, 400.0, 42.0, 33.0) > 0.0);
        assert!(
            magnet_pull_distance(240.0, 200.0, 42.0, 33.0)
                > magnet_pull_distance(60.0, 200.0, 42.0, 33.0)
        );
        assert!(magnet_pull_distance(60.0, 42.1, 42.0, 33.0) <= 0.101);
    }
    #[test]
    fn room_codes_are_easy_to_share_and_normalized() {
        for _ in 0..100 {
            let id = generate_room_id();
            assert_eq!(id.len(), 6);
            assert!(id.chars().all(|c| ROOM_ALPHABET.contains(&(c as u8))));
        }
        assert_eq!(normalize_room_id(" ab-c 12! "), "ABC12");
    }
    #[test]
    fn build_validation_caps_untrusted_client_data() {
        assert!(valid_build(&build()));
        let mut invalid = build();
        invalid.attachments[0].mount = 9;
        assert!(!valid_build(&invalid));
        let mut huge = build();
        huge.attachments = vec![huge.attachments[0].clone(); MAX_ATTACHMENTS + 1];
        assert!(!valid_build(&huge));
    }
    #[tokio::test]
    async fn authoritative_tick_spawns_shared_enemies_and_projectiles() {
        let room = Room::new();
        let (tx, _) = mpsc::channel(4);
        let state = PlayerState {
            id: "one".into(),
            build: build(),
            x: 0.0,
            y: 0.0,
            rotation: 0.0,
            health: 70.0,
            max_health: 70.0,
            progression: Progression::default(),
        };
        room.players.lock().await.insert(
            "one".into(),
            ConnectedPlayer {
                state,
                sender: tx,
                firing: true,
                last_fire: HashMap::new(),
                last_damage: 0,
                impact_speed: 0.0,
                last_state_received: std::time::Instant::now(),
            },
        );
        for _ in 0..8 {
            tick_world(&room).await;
        }
        let world = room.world.lock().await;
        assert_eq!(world.enemies.len(), ENEMY_TARGET);
        assert!(!world.projectiles.is_empty());
        assert!(world.stats.shots > 0);
    }

    #[tokio::test]
    async fn server_projectiles_damage_and_destroy_the_shared_enemy() {
        let room = Room::new();
        let (tx, _) = mpsc::channel(4);
        let state = PlayerState {
            id: "one".into(),
            build: build(),
            x: 0.0,
            y: 0.0,
            rotation: 0.0,
            health: 70.0,
            max_health: 70.0,
            progression: Progression::default(),
        };
        room.players.lock().await.insert(
            "one".into(),
            ConnectedPlayer {
                state,
                sender: tx,
                firing: true,
                last_fire: HashMap::new(),
                last_damage: 0,
                impact_speed: 0.0,
                last_state_received: std::time::Instant::now(),
            },
        );
        let mut teammate = room.players.lock().await["one"].state.clone();
        teammate.id = "two".into();
        teammate.y = 500.0;
        let (tx, _) = mpsc::channel(4);
        room.players.lock().await.insert(
            "two".into(),
            ConnectedPlayer {
                state: teammate,
                sender: tx,
                firing: false,
                last_fire: HashMap::new(),
                last_damage: 0,
                impact_speed: 0.0,
                last_state_received: std::time::Instant::now(),
            },
        );
        room.world.lock().await.enemies.push(Enemy {
            id: "target".into(),
            variant: "bubble".into(),
            level: 0,
            x: 180.0,
            y: 0.0,
            home_x: 180.0,
            home_y: 0.0,
            health: 1.0,
            max_health: 1.0,
            size: 42.0,
            speed: 0.0,
            roam: 0.0,
            phase: 0.0,
            contact_damage: 0.0,
            knock_x: 0.0,
            knock_y: 0.0,
        });
        for _ in 0..12 {
            tick_world(&room).await;
        }
        let world = room.world.lock().await;
        assert!(!world.enemies.iter().any(|enemy| enemy.id == "target"));
        assert!(world.stats.blocks >= 1);
        assert!(world.stats.hits >= 1);
        drop(world);
        let players = room.players.lock().await;
        assert!(players["one"].state.progression.xp >= 12);
        assert_eq!(
            players["one"].state.progression.xp,
            players["two"].state.progression.xp
        );
    }
    #[tokio::test]
    async fn smasher_impacts_push_stationary_enemies_and_decay() {
        let room = Room::new();
        let (tx, _) = mpsc::channel(4);
        let mut smasher = build();
        smasher.attachments[0].part_id = "spike".into();
        let state = PlayerState {
            id: "one".into(),
            build: smasher,
            x: 0.0,
            y: 0.0,
            rotation: 0.0,
            health: 70.0,
            max_health: 70.0,
            progression: Progression::default(),
        };
        room.players.lock().await.insert(
            "one".into(),
            ConnectedPlayer {
                state,
                sender: tx,
                firing: false,
                last_fire: HashMap::new(),
                last_damage: 0,
                impact_speed: 170.0,
                last_state_received: std::time::Instant::now(),
            },
        );
        room.world.lock().await.enemies.push(Enemy {
            id: "target".into(),
            variant: "bubble".into(),
            level: 0,
            x: 50.0,
            y: 0.0,
            home_x: 50.0,
            home_y: 0.0,
            health: 28.0,
            max_health: 28.0,
            size: 42.0,
            speed: 0.0,
            roam: 0.0,
            phase: 0.0,
            contact_damage: 0.0,
            knock_x: 0.0,
            knock_y: 0.0,
        });
        room.world.lock().await.elapsed = 600;
        tick_world(&room).await;
        {
            let world = room.world.lock().await;
            let enemy = world
                .enemies
                .iter()
                .find(|enemy| enemy.id == "target")
                .unwrap();
            assert!(enemy.knock_x > 0.0);
            assert!(enemy.health > 0.0 && enemy.health < enemy.max_health);
            assert_eq!(enemy.knock_y, 0.0);
        }
        for _ in 0..12 {
            tick_world(&room).await;
        }
        let world = room.world.lock().await;
        let enemy = world
            .enemies
            .iter()
            .find(|enemy| enemy.id == "target")
            .unwrap();
        assert!(enemy.x > 70.0);
        assert!(enemy.knock_x < smasher_knockback(36.0, 170.0));
        assert_eq!(enemy.x, enemy.home_x);
    }
    #[test]
    fn shapes_transfer_momentum_and_damage_without_passive_contact_damage() {
        let enemy = |id: &str, x: f32| Enemy {
            id: id.into(),
            variant: "chunk".into(),
            level: 0,
            x,
            y: 0.0,
            home_x: x,
            home_y: 0.0,
            health: 28.0,
            max_health: 28.0,
            size: 58.0,
            speed: 0.0,
            roam: 0.0,
            phase: 0.0,
            contact_damage: 0.0,
            knock_x: 0.0,
            knock_y: 0.0,
        };
        let mut world = World {
            elapsed: 1000,
            enemies: vec![enemy("a", 0.0), enemy("b", 56.0)],
            ..World::default()
        };
        let previous = HashMap::from([("a".into(), (-6.0, 0.0)), ("b".into(), (56.0, 0.0))]);
        collide_enemies(&mut world, &previous);
        assert!(
            world
                .enemies
                .iter()
                .all(|e| e.health > 0.0 && e.health < e.max_health)
        );
        assert!(world.enemies[1].knock_x > 0.0);
        assert!(world.enemies[1].x - world.enemies[0].x >= 58.0);
        let mut resting = World {
            elapsed: 1000,
            enemies: vec![enemy("a", 0.0), enemy("b", 56.0)],
            ..World::default()
        };
        let previous = HashMap::from([("a".into(), (0.0, 0.0)), ("b".into(), (56.0, 0.0))]);
        collide_enemies(&mut resting, &previous);
        assert!(resting.enemies.iter().all(|e| e.health == e.max_health));
    }
    #[test]
    fn tank_collision_follows_attachments_rotation_and_empty_space() {
        let mut tank = build();
        tank.attachments[0].part_id = "spike".into();
        tank.attachments[0].layer = 1;
        let mut enemy = Enemy {
            id: "target".into(),
            variant: "chunk".into(),
            level: 0,
            x: 145.0,
            y: 0.0,
            home_x: 145.0,
            home_y: 0.0,
            health: 28.0,
            max_health: 28.0,
            size: 58.0,
            speed: 0.0,
            roam: 0.0,
            phase: 0.0,
            contact_damage: 3.0,
            knock_x: 0.0,
            knock_y: 0.0,
        };
        assert!(tank_enemy_contact(
            &tank_outline(&tank, 0.0, 0.0, 0.0),
            &enemy
        ));
        enemy.x = 0.0;
        enemy.y = 120.0;
        assert!(!tank_enemy_contact(
            &tank_outline(&tank, 0.0, 0.0, 0.0),
            &enemy
        ));
        enemy.y = 145.0;
        assert!(tank_enemy_contact(
            &tank_outline(&tank, 0.0, 0.0, std::f32::consts::FRAC_PI_2),
            &enemy
        ));
        tank.attachments.clear();
        enemy.x = 90.0;
        enemy.y = 0.0;
        assert!(tank_enemy_contact(
            &tank_outline(&tank, 0.0, 0.0, 0.0),
            &enemy
        ));
        enemy.x = 100.0;
        assert!(!tank_enemy_contact(
            &tank_outline(&tank, 0.0, 0.0, 0.0),
            &enemy
        ));
    }
    async fn next_type<S>(socket: &mut S, wanted: &str) -> serde_json::Value
    where
        S: StreamExt<Item = Result<ClientWsMessage, tokio_tungstenite::tungstenite::Error>> + Unpin,
    {
        loop {
            let text = socket.next().await.unwrap().unwrap().into_text().unwrap();
            let value = serde_json::from_str::<serde_json::Value>(&text).unwrap();
            if value["type"] == wanted {
                return value;
            }
        }
    }
    #[tokio::test]
    async fn two_real_clients_receive_the_same_authoritative_world() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let app_state = AppState::default();
        let server_state = app_state.clone();
        let server = tokio::spawn(async move {
            axum::serve(listener, app(server_state)).await.unwrap();
        });
        let mut http = tokio::net::TcpStream::connect(address).await.unwrap();
        http.write_all(format!("POST /api/rooms HTTP/1.1\r\nHost: {address}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes()).await.unwrap();
        let mut response = Vec::new();
        http.read_to_end(&mut response).await.unwrap();
        let response = String::from_utf8(response).unwrap();
        let room =
            serde_json::from_str::<serde_json::Value>(response.split("\r\n\r\n").nth(1).unwrap())
                .unwrap()["roomId"]
                .as_str()
                .unwrap()
                .to_owned();
        let url = format!("ws://{address}/multiplayer/{room}");
        let (mut first, _) = connect_async(&url).await.unwrap();
        let (mut second, _) = connect_async(&url).await.unwrap();
        let join = serde_json::json!({"type":"join","build":build()}).to_string();
        first
            .send(ClientWsMessage::Text(join.clone().into()))
            .await
            .unwrap();
        let welcome = next_type(&mut first, "welcome").await;
        let first_id = welcome["player_id"].as_str().unwrap().to_owned();
        second
            .send(ClientWsMessage::Text(join.into()))
            .await
            .unwrap();
        next_type(&mut second, "welcome").await;
        let a = next_type(&mut first, "world_snapshot").await;
        let b = next_type(&mut second, "world_snapshot").await;
        let ids_a = a["enemies"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["id"].clone())
            .collect::<HashSet<_>>();
        let ids_b = b["enemies"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["id"].clone())
            .collect::<HashSet<_>>();
        assert_eq!(ids_a, ids_b);
        first
            .send(ClientWsMessage::Text(
                serde_json::json!({"type":"state","x":0,"y":0,"rotation":0,"firing":true})
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
        let fired = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let snapshot = next_type(&mut second, "world_snapshot").await;
                if snapshot["projectiles"]
                    .as_array()
                    .is_some_and(|p| !p.is_empty())
                {
                    break snapshot;
                }
            }
        })
        .await
        .unwrap();
        assert!(fired["stats"]["shots"].as_u64().unwrap() > 0);
        let active_room = app_state.rooms.read().await.get(&room).unwrap().clone();
        active_room
            .players
            .lock()
            .await
            .get_mut(&first_id)
            .unwrap()
            .state
            .progression
            .xp = 30;
        for stat in ["health", "damage", "unknown"] {
            first
                .send(ClientWsMessage::Text(
                    serde_json::json!({"type":"upgrade","stat":stat})
                        .to_string()
                        .into(),
                ))
                .await
                .unwrap();
        }
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let snapshot = next_type(&mut second, "world_snapshot").await;
                let player = snapshot["players"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|p| p["id"] == first_id)
                    .unwrap();
                if player["progression"]["upgrades"]["health"] == 1 {
                    assert_eq!(player["progression"]["upgrades"]["damage"], 0);
                    assert_eq!(player["maxHealth"], 81.0);
                    break;
                }
            }
        })
        .await
        .unwrap();
        first.close(None).await.unwrap();
        second.close(None).await.unwrap();
        server.abort();
    }
}
