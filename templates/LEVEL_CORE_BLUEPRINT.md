# Scar the Hedgerec — Level Core Foundation & 3-Act Zone Blueprint 🦔📐

This blueprint documents **everything already built into the core foundation** ("the guts") vs. **the creative slots left completely open for the Owner** on each new Act and Zone (`Zone 1 Act 2`, `Zone 1 Act 3 Boss`, `Zone 2 Act 1`, etc.).

No map layouts, enemies, music, or bosses are pre-forced onto future levels — the core handles the physics, Scar's movement & animations, 3-Act Zone transitions, 16-bit Title Cards, Classic Lives, audio engine, controls, and universal Sonic stage objects so you can sculpt each level bit-by-bit.

---

## 1. What Is Already Built Into the Core (Inherited Automatically)

Every new level registered with `SonicEngine.Terrain.registerLevel(id, config)` automatically gets:

### Shared Formula: Rules for Every Act

All campaign acts, including Palmtree Panic, use the same object initialization, physics, interactions, rewards, sound events, and reset path in `public/sonic-engine.js` and `public/index.html`.

- Keep Scar's acceleration, jump, rolling, Spin Dash, Super Peel-Out, Drop Dash, hitboxes, damage, lives, and controls in the shared core. New acts inherit them automatically.
- Place common objects through `objects` / `setupObjects`. Their sprites, collisions, rewards, power-up durations, audio cues, and reset behavior come from the foundation. A ring always gives 1 ring and 10 points; the giant ring gives 50 rings and 10,000 points; shoes and invincibility last 900 gameplay frames; every 100 rings grants a life.
- Declare enemy `type` explicitly when choosing a species. Ground (`kind: 'crab'`) and flying (`kind: 'buzz'`) defaults are Crabmeat and Buzz Bomber. Motion and rendering use the same species; enemy list position never chooses its appearance. Use `type: 'chopper'` / `'masher'` for leaping fish, not hovering guards.
- Use shared player events for sound feedback. Trap doors play the same opening/closing cues wherever placed; common actions and Scar's voice cues keep their mappings across acts. Stage music remains configurable.
- Keep title cards, completion tally, checkpoint recovery and restart behavior. Score, lives and shield carry between acts; rings, act time and temporary power-ups start fresh.
- The shared runtime saves the current act and safe checkpoint for reload/app recovery, and commits the next act when a goal is reached. Resumes keep score, lives and shield; rings, act time and temporary power-ups restart. Use `SonicEngine.roundRectPath` for rounded canvas paths so older WebViews can render them.
- Layouts, palettes, music, enemy rosters and optional object placements remain creative choices. Marked wall-kick routes, Kitt's locked boss capsule, and Molten Sanctuary's lava and Rosie gate are intentional extensions of the foundation.

### Owner's Reference Baseline: Layered Routes and 2.5D Presentation

The supplied Hydrocity Act 2 (Dry, 1/3) and Sandopolis Act 1 (2/3) maps and browser screenshots establish how future levels should look and play. Use their design principles to create original layouts:

- Build connected upper, middle, and lower routes with meaningful differences: speed, platforming, secrets, or a safe catch course. Upper routes must reconnect; test missed jumps and low-speed retries as well as the ideal run.
- Shape slopes and chutes with continuous tangents. Give loops visible approach runways, speed support, and an escape/retry route. Ring trails teach the path, and hazards must be visible before contact.
- Use substantial textured ruins, turquoise channels, arches, inset masonry, columns, and foreground/background separation where appropriate to the zone. Decorative supports are visibly behind the playable plane. Draw the front collision lip directly from the registered surface, so depth cannot mislead the player.
- Change sky colors with both position and gameplay time, with distinct past/present/future palettes. Templates enable `changingSkies: true`; the shared `SonicEngine.skyColors` helper also supports custom backgrounds and `skyPalettes`. Layer distant scenery with restrained parallax and preserve clear contrast around Scar and hazards.
- New acts opt into `spritePresentation: 'volume'`. The shared `Game.drawModelSprite` uses pre-rendered, shaded relief models built from the actual character/enemy/object sprite pixels. The projection gives silhouettes shallow 3D depth while movement, hitboxes, floor contact and animation remain 2D. It is not a free-camera 3D game or a new character design.
- Preserve supplied sprite provenance. `npm run build:sprite-models` produces the model atlas and its source hashes, crop mappings, depth metadata and padding; original atlases are unchanged. Model drawing uses one cached atlas draw and falls back to the original sprite if its derivative is missing or delayed. Never create a new enemy species by changing a sprite's appearance alone.
- Include the shared object kit, rescued animals, title/tally, checkpoint recovery, controls and sound events. Distinctive mechanics may add water currents, launch jets, slides, lifts, or similar features through level hooks without altering the core movement constants.

Mirage Aqueduct (`z3_act1`) is the first implementation: three aqueducts over a continuous lower course, three real loops, escapable shallow currents, three launch jets, lift alternatives, marked wall climbs, a crumbling bridge and a reachable treasury. The reference maps inspire route layering and architecture; they are not pasted in as a flat background or traced as collision geometry.

For acceptance, run the registered campaign consistency suite, full route and checkpoint regressions at 30/60/144 Hz, render every checkpoint/era with missing and delayed assets, and play the incoming campaign transition in a real browser. Update the starter whenever this shared baseline changes.

Run `npm run test:consistency` after changing an act or the core. It discovers campaign registrations from the shipped page and checks movement at 30/60/144 Hz, rewards, damage/recovery, sounds, title cards, carryover, and repeated resets. `npm test` and `npm run verify:baseline` include this check. Rebuild the starter with `npm run build:template` after changing shared code or templates.

### A. Classic 3-Act Zone Progression & 16-Bit Title Cards
- **3-Act Zone Campaign Flow**:
  - `Act 1` → `Act 2` → `Act 3 (Boss Act)` → `Next Zone Act 1`!
  - Stages automatically chain in registration order (or via optional `nextStage` override).
  - **Carryover State**: `score`, `lives`, and `shield` carry seamlessly from Act to Act, while `rings` and `stageTime` reset cleanly for each new Act.
- **16-Bit Sliding Title Card Banner**:
  - Automatically slides onto screen when any Act loads (including Level 1 `PALMTREE PANIC — ACT 1`!), displaying `zoneName`, `"ZONE"`, the golden `ACT 1 / 2 / 3` medallion, Scar's crimson emblem, and `★ BOSS ACT ★` on Act 3.
- **Act Clear Score Tally & Fade Transition**:
  - Passing the **Goal Post** (Acts 1–2) or popping the **Animal Capsule** (Act 3 Boss Act) slides in `"SCAR GOT THROUGH"`, ticks `TIME BONUS` + `RING BONUS` into `TOTAL SCORE` (Jump fast-forwards), fades to black, unlocks the next Act in `localStorage`, and launches the next Act's Title Card!

### B. Classic Sonic Lives System (`SCAR × 03`)
- **3 Starting Lives**: `player.lives` starts at `3` and renders in the HUD badge (`SCAR × 03`) with Scar's mini portrait.
- **Extra Lives (`1UP!`)**:
  - **1-Up TV Monitors (`item: '1up'`)**: Displays **Scar's** portrait on the CRT screen and grants `+1` Life + 1-Up fanfare when smashed!
  - **100-Ring Milestones**: Reaching `100`, `200`, `300`... rings automatically grants `+1` Life!
- **Death, `TIME OVER` & `GAME OVER`**:
  - Taking a hit with `0` rings (and no Shield) or falling below `deathY` costs `1` life and respawns Scar at the last active Star Post checkpoint (`lives > 0`).
  - Reaching `10:00` (`600s`) triggers a classic **`TIME OVER`** life loss.
  - Losing the last life (`lives === 0`) slides in the authentic pixel **`GAME OVER`** or **`TIME OVER`** sprites from `common_objects.png` with a 16-bit Game Over cadence (press `Jump` or `R` to restart with 3 lives).

### C. 16-Bit 360° Physics & Scar Animation Rig
- **Exact 60Hz Sub-Stepped Physics (`public/sonic-engine.js`)**:
  - `ACC`, `DEC`, `FRC`, `TOP` (`6.0` run / `16.0` hard cap), `GRV`, variable-height `JMP`, slope momentum (`SLP_NORMAL`, `SLP_ROLL_UP`, `SLP_ROLL_DOWN`), and Spin Dash (`8 + floor(rev)/2`).
  - 6 analytical raycast sensors (**A/B** Ground, **C/D** Ceiling, **E/F** Wall Push) rotating across Floor (`Mode 0`), Right Wall (`Mode 1`), Ceiling (`Mode 2`), and Left Wall (`Mode 3`).
  - Dual-layer 360° Loop-de-Loop collision gates (`entryX -> Layer 0`, `apexX`, `exitX -> Layer 1`).
- **Scar the Hedgerec (`assets/scar_sheet.png`)**:
  - 5-frame speed-reactive animation state machine (`idle`, `walk1`, `walk2`, `run1`, `run2`) + Spin Dash ball + automatic slope rotation + hurt/invulnerability blink + **Blue Shield** & **Invincibility** auras.

### D. Universal Common Sonic Objects (`assets/common_objects.png`)

| Object | Config Key | Built-In Behavior & Sprites |
| :--- | :--- | :--- |
| **Rings** | `rings` / `setupObjects` | 4-frame spinning gold rings, 4-frame collection sparkle, +1 ring/+10 score (+1 Life every 100 rings), scatters up to 16 bouncing rings when hit without a shield |
| **TV Item Monitors** | `objects.monitors` | Smashable CRT boxes with static flicker, explosion poof, rising icon & broken shell. Items: `'rings'` (+10 rings), `'shield'` (Blue Shield), `'invinc'` (15s Invincibility), `'shoes'` (15s Speed Shoes), `'1up'` (+1 Life with Scar icon!) |
| **Checkpoint Star Posts** | `objects.starPosts` | Blue orb spins 360° red when passed and updates Scar's active respawn point |
| **Coil Springs** | `objects.springs` | `'yellow'` (`ysp = -10.8`) and `'red'` (`ysp = -13.5`) upward springs with flat -> extended coil animation |
| **Spikes** | `objects.spikeClusters` | 3-prong upward metal hazards (respects Shield & Invincibility) |
| **Giant Ring (Okina Ring)** | `objects.bigRing` | 64×63 spinning Giant Ring with 7-frame flash burst (+50 rings & +10,000 score) |
| **Goal Post (Acts 1–2)** | `objects.goalPost` | Robotnik plate spins to Sonic plate, plays `goalpost.wav`, triggers Act Clear Score Tally -> Next Act |
| **Animal Capsule (Act 3)** | `objects.capsule` | Solid 64×60 Act 3 Boss Capsule + top plunger button (`lockedUntilBoss: true/false`). Jumping on the plunger pops explosions, frees critters, and clears the Zone! |
| **Rescued Animals (every act)** | `animalZone` / `animalTypes` | Every defeated Badnik frees one animated animal; boss capsules release a crowd. The shared animal atlas, terrain hopping, and reset work in every zone. |
| **Swinging Platforms** | `objects.swingPlatforms` | Pendulum platforms with pivot/chain sprites, collision, and player carrying; configure `pivotX`, `pivotY`, `len`, `maxAngle`, `speed`, `phase`. |
| **Bounce Poles & Bumpers** | `objects.bouncePoles` / `objects.spinners` | The original springy poles and silver/dark pinball bumpers launch Scar using the same physics and sound events in every act. |
| **Breakable Walls & Rocks** | `objects.breakableWalls` / `objects.rocks` | `{x, y}` is the bottom center. Rolling or enough speed smashes the solid object into animated debris. |
| **Collapsing Floors** | `objects.breakableFloors` | `{x, y, w, h, kind}` is the top-left edge. Cracks on contact, collapses after a short delay, and regenerates after five seconds. |
| **Trap Doors** | `objects.trapDoors` | `{x, y, w, period, openDuration, phase}` creates a bridge that warns before opening; placement must provide a safe recovery route. |
| **Sparkling Steps** | `objects.houdiniGroups` | `{triggerX, triggerY, steps: [{x, y}]}` reuses Act 1's animated step blocks and their collision surfaces. |
| **Explosions & Popups** | *Automatic* | 5-frame explosion poof & pixel score sprites (`+100`..`+10000`, `1UP!`) |

### E. Core Audio & Cross-Platform Controls
- **Core WAV SFX & Jingles**: `assets/jump.wav`, `assets/rings.wav`, `assets/goalpost.wav` + 16-bit Web Audio synth for 1-Up fanfare, Score Tally ticks/chime, Game Over cadence, Spin Dash, skids, springs, checkpoints, and shattering.
- **Per-Level Looping BGM**: Set `bgm: 'assets/zone2.mp3'` (loops seamlessly).
- **Controls**: Full Desktop Keyboard + Android / Termux Multi-Touch D-Pad (`◀`, `▼`, `▶`, `JUMP`).
- **Shared Moves & Xbox Controls**: Super Peel-Out (Up + Jump), Drop Dash (press and hold Jump again in the air), and standard gamepad support inherit the same behavior and audio in every act. Wall kicks use the same rules on marked climb walls in enabled acts.

---

## 2. How to Add the Next Act or Zone (Two Easy Options)

### Option A — Add a New Act or Zone Inside the Main Game
1. For **Act 1 or Act 2**, copy [`templates/level_template.js`](level_template.js) to `public/levels/zone2_act1.js`.
   For **Act 3 (Boss Act)**, copy [`templates/boss_act_template.js`](boss_act_template.js) to `public/levels/zone2_act3.js`.
2. Set `LEVEL_ID` (e.g. `'z2_act1'`), `zone: 2`, `zoneName: 'YOUR ZONE NAME'`, and `act: 1` (or `2` / `3`).
3. Add `<script src="levels/zone2_act1.js"></script>` in `public/index.html` right after the previous Act's `<script>` tag — it automatically joins the campaign progression chain!
4. Open `http://localhost:3000/?stage=z2_act1` (or click **Stage** / press **`M`** in-game) to sculpt and test live!

### Option B — Unzip the Standalone Starter Core Kit (`scar-level-core-template.zip`)
1. Download `scar-level-core-template.zip` (from `http://localhost:3000/template.html` or `public/downloads/scar-level-core-template.zip`).
2. Unzip into any folder and run `node server.js --open` (or `scar.bat` / `sh start-termux.sh`).
3. It boots straight into the clean **Blank Starter Act 1 → Boss Act 3** loop (`level_template.js` + `boss_act_template.js`) with Title Cards, Classic Lives, and **zero Level 1 clutter**!

---

## 3. Owner's Creative Building-Block Cheat Sheet

### A. Sculpting Terrain Piece-by-Piece (`buildTerrain(b, terrain)`)
```js
buildTerrain(b, terrain) {
    const main = b.path(0, 600)
        .flat(500)                        // Flat runway (x: 0 -> 500, y: 600)
        .bump(400, 28, +1)                // Smooth 28° hill hump (x: 500 -> 900)
        .ease(120, 0, 0.4)                // Smooth entry into downhill slope
        .line(300, 0.4)                   // Constant downhill slide (Δy = +120)
        .ease(120, 0.4, 0)                // Smooth level-out at bottom
        .sWave(480, -80)                  // Smooth S-curve rising 80px
        .flat(1200);                      // Straightaway to Goal Post
    b.addFloor(main, { name: 'main floor' });

    b.addShelf(b.path(650, 420).flat(380), { name: 'upper ledge', tier: 'high' });
    b.addLoop(2100, 640 - 128, 128, 'Loop #1');
}
```

### B. Plugging In Level-Specific Enemies
Use the owner's supplied enemy sprite sheets. The shared Sonic 1 atlas (`assets/enemies.png`) and Sonic 2 atlas (`assets/enemies_act2.png`) are direct source crops; their source images, crop records and pixel checks are retained under `assets/enemy_sources`. Keep species explicit and use the shared sprite renderer instead of drawing replacement enemy bodies. New sheets must be supplied by the owner and receive the same provenance record before use. Display dimensions and anchors may be configured separately from source crop dimensions, with image smoothing disabled.

```js
enemySheet: 'assets/zone2_enemies.png',
enemyFrames: {
    bot_1: { sx: 0,  sy: 0, w: 32, h: 24, ax: 16, ay: 24 },
    bot_2: { sx: 34, sy: 0, w: 32, h: 24, ax: 16, ay: 24 },
},
enemies: [
    { kind: 'crab', x: 900, y: 600, minX: 780, maxX: 1040, vx: 1.2, frames: ['bot_1', 'bot_2'], animRate: 0.2 },
],
```

### C. Act 3 Boss & Animal Capsule Lifecycle
- Set `isBossAct: true`, `goalPost: null`, and `capsule: { x: 1140, y: 560, lockedUntilBoss: true }`.
- Implement `createBoss(terrain)` returning `{ x, y, hp: 8, defeated: false, ... }`.
- Update boss movement & hit logic in `onUpdate(terrain, player, h)` and render in `drawBoss(ctx, boss, game)`.
- Once `terrain.boss.defeated = true`, the Animal Capsule unlocks automatically so Scar can jump on the plunger button to free the critters and advance to the next Zone!
