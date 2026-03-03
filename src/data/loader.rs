use std::fs;
use crate::data::model::*;

pub fn load_catalog(assets_dir: &str) -> PartCatalog {
    let bodies: Vec<Body> = serde_json::from_str(
        &fs::read_to_string(format!("{}/parts/bodies.json", assets_dir)).expect("Failed to load bodies.json")
    ).expect("Failed to parse bodies.json");

    let engines: Vec<Engine> = serde_json::from_str(
        &fs::read_to_string(format!("{}/parts/engines.json", assets_dir)).expect("Failed to load engines.json")
    ).expect("Failed to parse engines.json");

    let barrels: Vec<Barrel> = serde_json::from_str(
        &fs::read_to_string(format!("{}/parts/barrels.json", assets_dir)).expect("Failed to load barrels.json")
    ).expect("Failed to parse barrels.json");

    let modules: Vec<Module> = serde_json::from_str(
        &fs::read_to_string(format!("{}/parts/modules.json", assets_dir)).expect("Failed to load modules.json")
    ).expect("Failed to parse modules.json");

    PartCatalog { bodies, engines, barrels, modules }
}

pub fn load_build(path: &str) -> TankBuild {
    let content = fs::read_to_string(path).expect(&format!("Failed to load build: {}", path));
    serde_json::from_str(&content).expect(&format!("Failed to parse build: {}", path))
}
