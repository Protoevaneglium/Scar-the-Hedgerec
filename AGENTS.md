# Scar the Hedgerec project rules

## All future zones and acts use our established formula

The owner's standing direction is to base every new zone and act on the existing Scar gameplay formula and features. Apply this to new content and revisions unless the owner explicitly changes that direction.

- Read the **Shared Formula: Rules for Every Act** in [the level blueprint](templates/LEVEL_CORE_BLUEPRINT.md) and follow [the physics specification](SONIC_PHYSICS_SPEC.md).
- Start normal acts from [the level template](templates/level_template.js) and boss acts from [the boss template](templates/boss_act_template.js). Register them through `SonicEngine.Terrain.registerLevel` and add their scripts to `public/index.html` in dependency order.
- Inherit the shared engine and runtime in `public/sonic-engine.js` and `public/index.html`. Keep object initialization, movement, hitboxes, special moves, controls, rewards, damage, lives, animations, sound effects and reset behavior in that foundation. Implement common improvements there so every act benefits.
- Place common objects through `objects` / `setupObjects`, using their existing sprites, collisions, rewards, durations and sound events. Declare enemy species explicitly when selecting a roster; appearance and movement must agree. Retain animal rescues from defeated badniks.
- Preserve title cards, checkpoints, death/retry behavior, completion tally, transitions and campaign carryover. Score, lives and shield carry between acts; rings, act time and temporary power-ups reset.
- Give each zone its own layout, theme, music, enemy roster and optional scenery. Add distinctive mechanics through the existing level hooks while preserving the shared rules. Normal acts finish at a signpost; boss acts use their boss and capsule lifecycle.

## Verification

- Run `npm run test:consistency` for new acts and shared gameplay changes. Keep the checks covering every campaign act; fix inconsistencies rather than weakening the checks.
- Run the relevant route, interaction and rendering regressions described in [TESTING.md](TESTING.md). Use `npm run verify:baseline` for full verification.
- Rebuild the downloadable starter with `npm run build:template` whenever shared code or templates change, so future creations inherit the current foundation.
