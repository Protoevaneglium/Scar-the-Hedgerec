# Scar the Hedgerec — Level Core Foundation & Blueprint 🦔📐

This blueprint documents **everything already built into the core foundation** ("the guts") vs. **the creative slots left completely open for the Owner** on each new level (`Level 2`, `Level 3`, etc.).

No map layouts, enemies, music, or bosses are pre-forced onto future levels — the core handles the physics, Scar's movement & animations, audio engine, controls, and universal Sonic stage objects so you can sculpt each level bit-by-bit.

---

## 1. What Is Already Built Into the Core (Inherited Automatically)

Every new level registered with `SonicEngine.Terrain.registerLevel(id, config)` automatically gets:

### A. 16-Bit 360° Physics & Scar Animation Rig
- **Exact 60Hz Sub-Stepped Physics (`public/sonic-engine.js`)**:
  - `ACC`, `DEC`, `FRC`, `TOP` (`6.0` run / `16.0` hard cap), `GRV`, variable-height `JMP`, slope momentum (`SLP_NORMAL`, `SLP_ROLL_UP`, `SLP_ROLL_DOWN`), and Spin Dash (`8 + floor(rev)/2`).
  - 6 analytical raycast sensors (**A/B** Ground, **C/D** Ceiling, **E/F** Wall Push) rotating across Floor (`Mode 0`), Right Wall (`Mode 1`), Ceiling (`Mode 2`), and Left Wall (`Mode 3`).
  - Dual-layer 360° Loop-de-Loop collision gates (`entryX -> Layer 0`, `apexX`, `exitX -> Layer 1`).
- **Scar the Hedgerec (`assets/scar_sheet.png`)**:
  - 5-frame speed-reactive animation state machine (`idle`, `walk1`, `walk2`, `run1`, `run2`) + Spin Dash ball + automatic slope rotation + hurt/invulnerability blink.
  - Built-in **Blue Shield** flickering bubble (absorbs 1 hit without losing rings) and **Invincibility Sparkle** aura (pops enemies on contact).

### B. Universal Common Sonic Objects (`assets/common_objects.png`)
All sprites, animations, hitboxes, and rewards below work out-of-the-box simply by listing coordinates in your level's `objects`:

| Object | Config Key | Built-In Behavior & Sprites |
| :--- | :--- | :--- |
| **Rings** | `rings` / `setupObjects` | 4-frame spinning gold rings, 4-frame collection sparkle, +1 ring/+10 score, scatters up to 16 bouncing rings when hit without a shield |
| **TV Item Monitors** | `objects.monitors` | Smashable CRT boxes with static flicker, explosion poof, rising icon & broken shell. Items: `'rings'` (+10 rings), `'shield'` (Blue Shield), `'invinc'` (15s Invincibility), `'shoes'` (15s Speed Shoes) |
| **Checkpoint Star Posts** | `objects.starPosts` | Blue orb spins 360° red when passed and updates Scar's active respawn point |
| **Coil Springs** | `objects.springs` | `'yellow'` (`ysp = -10.8`) and `'red'` (`ysp = -13.5`) upward springs with flat -> extended coil animation |
| **Spikes** | `objects.spikeClusters` | 3-prong upward metal hazards (respects Shield & Invincibility) |
| **Giant Ring (Okina Ring)** | `objects.bigRing` | 64×63 spinning Giant Ring with 7-frame flash burst (+50 rings & +10,000 score) |
| **Goal Post** | `objects.goalPost` | Robotnik plate spins through angled/edge frames to Sonic plate, plays `goalpost.wav`, awards `1000 + rings * 100` Act Clear bonus |
| **Explosions & Score Popups** | *Automatic* | 5-frame explosion poof & pixel score sprites (`+100`, `+200`, `+500`, `+1000`, `+10000`) |

### C. Core Audio & Cross-Platform Controls
- **Core WAV SFX**: `assets/jump.wav`, `assets/rings.wav`, `assets/goalpost.wav` + Web Audio synth SFX for Spin Dash rev/release, skids, springs, checkpoints, and shattering.
- **Per-Level Looping BGM**: Set `bgm: 'assets/level2.mp3'` (loops seamlessly and starts on page load).
- **Controls**: Full Desktop Keyboard + Android / Termux Multi-Touch D-Pad (`◀`, `▼`, `▶`, `JUMP`).

---

## 2. How to Start a New Level (Two Easy Options)

### Option A — Add a Level Directly Inside the Main Game
1. Copy [`templates/level_template.js`](level_template.js) to `public/levels/level2.js`.
2. Change `const LEVEL_ID = 'template'` to `'level2'` and set `title: 'Zone 2 — Act 1'`.
3. Add `<script src="levels/level2.js"></script>` right after `<script src="sonic-engine.js"></script>` in `public/index.html`.
4. Open `http://localhost:3000/?stage=level2` (or click the **Stage** button / press **`M`** in-game) to test and sculpt live!

### Option B — Unzip the Standalone Starter Core Kit (`scar-level-core-template.zip`)
1. Download `scar-level-core-template.zip` (from `http://localhost:3000/template.html` or `public/downloads/scar-level-core-template.zip`).
2. Unzip into any new folder and run `node server.js --open` (or `scar.bat` / `sh start-termux.sh`).
3. It boots straight into the clean **Blank Starter** level (`public/levels/level_template.js`) with **zero Level 1 clutter** — ready to prototype in complete isolation and copy back into the main game whenever finished.

---

## 3. Owner's Creative Building-Block Cheat Sheet

### A. Sculpting Terrain Piece-by-Piece (`buildTerrain(b, terrain)`)
Chain segments seamlessly with `b.path(startX, startY)` — surface normals stay smooth automatically:

```js
buildTerrain(b, terrain) {
    // 1. Main lower ground route (continuous from x = 0 to endX)
    const main = b.path(0, 600)
        .flat(500)                        // Flat runway (x: 0 -> 500, y: 600)
        .bump(400, 28, +1)                // Smooth 28° hill hump (x: 500 -> 900)
        .ease(120, 0, 0.4)                // Smooth entry into downhill slope
        .line(300, 0.4)                   // Constant downhill slide (Δy = +120)
        .ease(120, 0.4, 0)                // Smooth level-out at bottom
        .sWave(480, -80)                  // Smooth S-curve rising 80px
        .flat(1200);                      // Straightaway to Goal Post
    b.addFloor(main, { name: 'main floor' });

    // 2. Elevated jump-through shelf (High / Mid route)
    const upper = b.path(650, 420).flat(380);
    b.addShelf(upper, { name: 'upper ledge', tier: 'high' });

    // 3. 360-Degree Loop sitting on floor y = 640 with radius 128
    b.addLoop(2100, 640 - 128, 128, 'Loop #1');
}
```

### B. Plugging In Level-Specific Enemies
Drop your new level's transparent enemy sheet into `public/assets/` (e.g. `level2_enemies.png`), define frame rectangles, and place patrols:

```js
enemySheet: 'assets/level2_enemies.png',
enemyFrames: {
    bot_1: { sx: 0,  sy: 0, w: 32, h: 24, ax: 16, ay: 24 }, // ax/ay = bottom-center foot anchor
    bot_2: { sx: 34, sy: 0, w: 32, h: 24, ax: 16, ay: 24 },
    fly_1: { sx: 70, sy: 0, w: 30, h: 20, ax: 15, ay: 10 }, // ax/ay = center anchor for flyers
    fly_2: { sx: 102,sy: 0, w: 30, h: 20, ax: 15, ay: 10 },
},
enemies: [
    // Ground patroller (kind: 'crab' walks between minX..maxX and snaps to floor slopes)
    { kind: 'crab', x: 900, y: 600, minX: 780, maxX: 1040, vx: 1.2, frames: ['bot_1', 'bot_2'], animRate: 0.2 },

    // Aerial hover/swoop enemy (kind: 'buzz' oscillates around x, y)
    { kind: 'buzz', x: 1450, y: 430, phase: 0.5, frames: ['fly_1', 'fly_2'], animRate: 0.3 },
],
```
*(Need totally custom enemy AI or animations? Implement `onUpdate(terrain, player, h)` and `drawEnemy(ctx, en, info)` right in your level file!)*

### C. Adding an Act Boss or Unique Level Mechanic
Every level has built-in lifecycle hooks ready whenever you design a boss or custom gimmick:
- `createBoss(terrain)` — Returns initial boss object (`{ x, y, hp: 8, phase: 'enter', invuln: 0, ... }`), stored on `terrain.boss` and automatically reset when pressing `R`.
- `onUpdate(terrain, player, h)` — Runs every 60Hz physics step `h` for boss movement, projectiles, or custom stage hazards.
- `drawBack(ctx, game)` / `drawFront(ctx, game)` — Draw custom parallax props behind the terrain or boss sprites in the foreground.
