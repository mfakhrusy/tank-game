use crate::data::model::*;
use crate::game::systems::stat_composer::{self, FinalStats};

pub struct Tank {
    pub x: f32,
    pub y: f32,
    pub aim_angle: f32, // radians, where the tank is aiming (mouse direction)
    pub vel_x: f32,
    pub vel_y: f32,
    pub body: Body,
    pub engine: Engine,
    pub barrels: Vec<(Barrel, BarrelPlacement)>,
    pub modules: Vec<Module>,
    pub stats: FinalStats,
}

impl Tank {
    pub fn from_build(build: &TankBuild, catalog: &PartCatalog) -> Self {
        let body = catalog.find_body(&build.body).expect("Unknown body").clone();
        let engine = catalog.find_engine(&build.engine).expect("Unknown engine").clone();

        let barrels: Vec<(Barrel, BarrelPlacement)> = build
            .barrels
            .iter()
            .map(|bp| {
                let barrel = catalog.find_barrel(&bp.part).expect("Unknown barrel").clone();
                (barrel, bp.clone())
            })
            .collect();

        let modules: Vec<Module> = build
            .modules
            .iter()
            .map(|mp| catalog.find_module(&mp.part).expect("Unknown module").clone())
            .collect();

        let stats = stat_composer::compose(&body, &engine, &barrels, &modules);

        Self {
            x: 400.0,
            y: 300.0,
            aim_angle: 0.0,
            vel_x: 0.0,
            vel_y: 0.0,
            body,
            engine,
            barrels,
            modules,
            stats,
        }
    }

    pub fn recompute_stats(&mut self) {
        self.stats = stat_composer::compose(&self.body, &self.engine, &self.barrels, &self.modules);
    }
}
