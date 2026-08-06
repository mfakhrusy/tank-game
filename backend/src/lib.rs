use axum::{
    Json, Router,
    extract::{
        Path, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
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
#[derive(Default)]
struct World {
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
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}
async fn create_room(State(state): State<AppState>) -> Json<RoomCreated> {
    loop {
        let room_id = generate_room_id();
        let mut rooms = state.rooms.write().await;
        if !rooms.contains_key(&room_id) {
            let room = Arc::new(Room::new());
            rooms.insert(room_id.clone(), room.clone());
            tokio::spawn(simulation_loop(room));
            return Json(RoomCreated { room_id });
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
    while let Some(Ok(message)) = socket_receiver.next().await {
        match message {
            Message::Text(text) => {
                let Ok(ClientMessage::State {
                    x,
                    y,
                    rotation,
                    firing,
                }) = serde_json::from_str::<ClientMessage>(&text)
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
    while world.enemies.len() < ENEMY_TARGET {
        spawn_enemy(&mut world, center_x, center_y);
    }
    for enemy in &mut world.enemies {
        if enemy.speed <= 0.0 {
            continue;
        }
        let dx = enemy.home_x - enemy.x;
        let dy = enemy.home_y - enemy.y;
        let distance = (dx * dx + dy * dy).sqrt();
        let wander = enemy.phase
            + (now as f32 * 0.00065 + enemy.phase).sin() * 0.85
            + (now as f32 * 0.00021 + enemy.phase * 2.3).sin() * 0.35;
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
        enemy.x += bx / len * enemy.speed * TICK_MS as f32 / 1000.0;
        enemy.y += by / len * enemy.speed * TICK_MS as f32 / 1000.0;
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
                let Some(spec) = weapon_spec(&attachment.part_id) else {
                    continue;
                };
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
    update_projectiles(&mut world, &players);
    let mut destroyed = 0u64;
    world.enemies.retain(|enemy| {
        if enemy.health <= 0.0 {
            destroyed += 1;
            false
        } else {
            true
        }
    });
    world.stats.blocks += destroyed;
    let World {
        enemies, contacts, ..
    } = &mut *world;
    for player in players.values_mut() {
        for enemy in &mut *enemies {
            let radius = 42.0 + enemy.size * 0.5;
            if distance(player.state.x, player.state.y, enemy.x, enemy.y) > radius {
                continue;
            }
            let key = format!("{}:{}", player.state.id, enemy.id);
            if now.saturating_sub(*contacts.get(&key).unwrap_or(&0)) < 520 {
                continue;
            }
            contacts.insert(key, now);
            player.state.health = (player.state.health - enemy.contact_damage).max(0.0);
            player.last_damage = now;
            enemy.health -= build_ram_damage(&player.state.build);
            if player.state.health <= 0.0 {
                player.state.x = 0.0;
                player.state.y = 0.0;
                player.state.health = player.state.max_health;
            }
        }
    }
}

fn update_projectiles(world: &mut World, players: &HashMap<String, ConnectedPlayer>) {
    let now = world.elapsed;
    let mut children = Vec::new();
    for projectile in &mut world.projectiles {
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
        projectile.x += projectile.vx * TICK_MS as f32 / 1000.0;
        projectile.y += projectile.vy * TICK_MS as f32 / 1000.0;
        for enemy in &mut world.enemies {
            if projectile.hit.contains(&enemy.id)
                || distance(projectile.x, projectile.y, enemy.x, enemy.y)
                    > projectile.size + enemy.size * 0.5
            {
                continue;
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
    let angle = player.rotation + mount_angle + offset;
    let radius = if attachment.layer == 0 { 112.0 } else { 166.0 };
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
        pierce: if spec.behavior == "bonker" { 2 } else { 1 },
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
fn spawn_enemy(world: &mut World, cx: f32, cy: f32) {
    let mut rng = rand::rng();
    let variants = [
        ("bubble", 42.0, 72.0, 120.0, 0.72, 0.7),
        ("chunk", 58.0, 0.0, 0.0, 1.0, 1.0),
        ("kite", 54.0, 96.0, 170.0, 0.82, 0.86),
        ("honey", 72.0, 0.0, 0.0, 1.38, 1.28),
        ("dart", 48.0, 128.0, 210.0, 0.62, 1.08),
        ("loaf", 86.0, 0.0, 0.0, 1.65, 1.45),
    ];
    let index = rng.random_range(0..variants.len());
    let (v, size, speed, roam, hp_scale, damage_scale) = variants[index];
    let level = rng.random_range(0..3) as u8;
    let base_hp = [24.0, 52.0, 95.0][level as usize];
    let base_damage = [4.0, 9.0, 16.0][level as usize];
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
        };
        room.players.lock().await.insert(
            "one".into(),
            ConnectedPlayer {
                state,
                sender: tx,
                firing: true,
                last_fire: HashMap::new(),
                last_damage: 0,
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
        };
        room.players.lock().await.insert(
            "one".into(),
            ConnectedPlayer {
                state,
                sender: tx,
                firing: true,
                last_fire: HashMap::new(),
                last_damage: 0,
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
        });
        for _ in 0..12 {
            tick_world(&room).await;
        }
        let world = room.world.lock().await;
        assert!(!world.enemies.iter().any(|enemy| enemy.id == "target"));
        assert!(world.stats.blocks >= 1);
        assert!(world.stats.hits >= 1);
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
        let server = tokio::spawn(async move {
            axum::serve(listener, app(AppState::default()))
                .await
                .unwrap();
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
        next_type(&mut first, "welcome").await;
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
        first.close(None).await.unwrap();
        second.close(None).await.unwrap();
        server.abort();
    }
}
