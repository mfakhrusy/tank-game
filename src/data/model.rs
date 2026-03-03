use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
pub struct Body {
    pub id: String,
    pub name: String,
    pub radius: f32,
    pub hp: i32,
    pub body_damage: f32,
    pub max_barrels: u8,
    pub module_slots: u8,
    pub mass: f32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Engine {
    pub id: String,
    pub name: String,
    pub max_speed: f32,
    pub acceleration: f32,
    pub mass: f32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Barrel {
    pub id: String,
    pub name: String,
    pub width: f32,
    pub length: f32,
    pub damage: f32,
    pub reload_ms: u32,
    pub bullet_speed: f32,
    pub bullet_lifetime_ms: u32,
    pub bullet_count: u8,
    pub spread: f32,
    pub recoil: f32,
    pub mass: f32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Module {
    pub id: String,
    pub name: String,
    pub effects: HashMap<String, f32>,
    pub mass: f32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BarrelPlacement {
    pub part: String,
    pub angle: f32,
    #[serde(default)]
    pub facing: f32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModulePlacement {
    pub part: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TankBuild {
    pub name: String,
    pub body: String,
    pub engine: String,
    pub barrels: Vec<BarrelPlacement>,
    pub modules: Vec<ModulePlacement>,
}

pub struct PartCatalog {
    pub bodies: Vec<Body>,
    pub engines: Vec<Engine>,
    pub barrels: Vec<Barrel>,
    pub modules: Vec<Module>,
}

impl PartCatalog {
    pub fn find_body(&self, id: &str) -> Option<&Body> {
        self.bodies.iter().find(|b| b.id == id)
    }
    pub fn find_engine(&self, id: &str) -> Option<&Engine> {
        self.engines.iter().find(|e| e.id == id)
    }
    pub fn find_barrel(&self, id: &str) -> Option<&Barrel> {
        self.barrels.iter().find(|b| b.id == id)
    }
    pub fn find_module(&self, id: &str) -> Option<&Module> {
        self.modules.iter().find(|m| m.id == id)
    }
}
