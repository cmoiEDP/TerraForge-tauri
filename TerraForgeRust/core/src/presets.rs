//! Curated terrain presets. Port of `lib/presets.js`.

use crate::biomes::BiomeParams;
use crate::erosion::ErosionParams;
use crate::noise::NoiseParams;

#[derive(Clone, Debug)]
pub struct Preset {
    pub id: &'static str,
    pub name: &'static str,
    pub tag: &'static str,
    pub noise: NoiseParams,
    pub erosion: ErosionParams,
    pub biome: BiomeParams,
}

pub fn presets() -> Vec<Preset> {
    vec![
        Preset {
            id: "alpine", name: "Alpine Peaks", tag: "snow · ridges",
            noise: NoiseParams { scale: 0.0020, octaves: 8, persistence: 0.50, ridge_blend: 0.75, warp: 0.20, exponent: 1.7, ..Default::default() },
            erosion: ErosionParams { iterations: 80_000, erosion: 0.45, deposition: 0.20, inertia: 0.05, ..Default::default() },
            biome: BiomeParams { water_level: 0.12, sand_width: 0.04, grass_max: 0.45, rock_max: 0.78, slope_bias: 0.55, ..Default::default() },
        },
        Preset {
            id: "rolling", name: "Rolling Hills", tag: "green · soft",
            noise: NoiseParams { scale: 0.0014, octaves: 5, persistence: 0.55, ridge_blend: 0.10, warp: 0.40, exponent: 1.0, ..Default::default() },
            erosion: ErosionParams { iterations: 30_000, erosion: 0.25, deposition: 0.40, inertia: 0.10, ..Default::default() },
            biome: BiomeParams { water_level: 0.08, sand_width: 0.05, grass_max: 0.78, rock_max: 0.95, slope_bias: 0.30, ..Default::default() },
        },
        Preset {
            id: "desert", name: "Desert Mesa", tag: "arid · plateau",
            noise: NoiseParams { scale: 0.0010, octaves: 6, persistence: 0.45, ridge_blend: 0.30, warp: 0.15, exponent: 2.4, ..Default::default() },
            erosion: ErosionParams { iterations: 60_000, erosion: 0.35, deposition: 0.15, inertia: 0.07, ..Default::default() },
            biome: BiomeParams { water_level: 0.00, sand_width: 0.70, grass_max: 0.0, rock_max: 0.95, slope_bias: 0.40, ..Default::default() },
        },
        Preset {
            id: "volcanic", name: "Volcanic Island", tag: "cone · obsidian",
            noise: NoiseParams { scale: 0.0024, octaves: 7, persistence: 0.55, ridge_blend: 0.55, warp: 0.50, exponent: 1.9, ..Default::default() },
            erosion: ErosionParams { iterations: 50_000, erosion: 0.40, deposition: 0.25, inertia: 0.08, ..Default::default() },
            biome: BiomeParams { water_level: 0.20, sand_width: 0.03, grass_max: 0.40, rock_max: 0.85, slope_bias: 0.50, ..Default::default() },
        },
        Preset {
            id: "archipelago", name: "Archipelago", tag: "water · islands",
            noise: NoiseParams { scale: 0.0030, octaves: 6, persistence: 0.50, ridge_blend: 0.15, warp: 0.60, exponent: 1.2, ..Default::default() },
            erosion: ErosionParams { iterations: 25_000, erosion: 0.20, deposition: 0.35, inertia: 0.10, ..Default::default() },
            biome: BiomeParams { water_level: 0.45, sand_width: 0.06, grass_max: 0.80, rock_max: 0.95, slope_bias: 0.30, ..Default::default() },
        },
        Preset {
            id: "canyon", name: "Canyon", tag: "carved · river",
            noise: NoiseParams { scale: 0.0015, octaves: 6, persistence: 0.45, ridge_blend: 0.40, warp: 0.10, exponent: 1.6, ..Default::default() },
            erosion: ErosionParams { iterations: 120_000, erosion: 0.55, deposition: 0.15, inertia: 0.04, ..Default::default() },
            biome: BiomeParams { water_level: 0.05, sand_width: 0.12, grass_max: 0.45, rock_max: 0.90, slope_bias: 0.45, ..Default::default() },
        },
        Preset {
            id: "plateau", name: "High Plateau", tag: "elevated · flat-top",
            noise: NoiseParams { scale: 0.0008, octaves: 5, persistence: 0.40, ridge_blend: 0.20, warp: 0.20, exponent: 0.7, ..Default::default() },
            erosion: ErosionParams { iterations: 40_000, erosion: 0.30, deposition: 0.30, inertia: 0.08, ..Default::default() },
            biome: BiomeParams { water_level: 0.06, sand_width: 0.04, grass_max: 0.55, rock_max: 0.85, slope_bias: 0.40, ..Default::default() },
        },
    ]
}

pub fn get_preset(id: &str) -> Option<Preset> {
    presets().into_iter().find(|p| p.id == id)
}
