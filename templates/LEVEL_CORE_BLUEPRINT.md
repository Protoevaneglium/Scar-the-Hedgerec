# Scar the Hedgerec — Level Core Foundation & 3-Act Zone Blueprint 🦔📐

This blueprint documents **everything already built into the core foundation** ("the guts") vs. **the creative slots left completely open for the Owner** on each new Act and Zone (`Zone 1 Act 2`, `Zone 1 Act 3 Boss`, `Zone 2 Act 1`, etc.).

No map layouts, enemies, music, or bosses are pre-forced onto future levels — the core handles the physics, Scar's movement & animations, 3-Act Zone transitions, 16-bit Title Cards, Classic Lives, audio engine, controls, and universal Sonic stage objects so you can sculpt each level bit-by-bit.

---

## 1. What Is Already Built Into the Core (Inherited Automatically)

Every new level registered with `SonicEngine.Terrain.registerLevel(id, config)` automatically gets:

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
| **Explosions & Popups** | *Automatic* | 5-frame explosion poof & pixel score sprites (`+100`..`+10000`, `1UP!`) |

### E. Core Audio & Cross-Platform Controls
- **Core WAV SFX & Jingles**: `assets/jump.wav`, `assets/rings.wav`, `assets/goalpost.wav` + 16-bit Web Audio synth for 1-Up fanfare, Score Tally ticks/chime, Game Over cadence, Spin Dash, skids, springs, checkpoints, and shattering.
- **Per-Level Looping BGM**: Set `bgm: 'assets/zone2.mp3'` (loops seamlessly).
- **Controls**: Full Desktop Keyboard + Android / Termux Multi-Touch D-Pad (`◀`, `▼`, `▶`, `JUMP`).

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
