# 16-Bit Sonic Retro Physics Engine & Test Stage 🦔⚡

An authentic 16-bit Sonic the Hedgehog physics engine and playable Green Hill test stage built from the **Sonic Retro Physics Guide** specification. Designed as a clean, cross-platform (**Linux, macOS, and Windows**), zero-approximation foundation for building Sonic fan games in HTML5 Canvas & JavaScript.

📄 **[Read the Full Physics Specification (`SONIC_PHYSICS_SPEC.md`)](SONIC_PHYSICS_SPEC.md)**

---

## ✨ Key Features

- **Exact 16-Bit Fixed-Point Physics (`60 FPS` Sub-stepped)**:
  - Authentic `ACC`, `DEC`, `FRC`, `TOP` (soft cap at `6.0`, hard cap at `16.0`), `ROLL_FRC`, `ROLL_DEC`, `AIR_ACC`, `GRV`, and `JMP` constants.
  - Frame-rate independent `(dt * 60)` sub-stepping so physics behave identically at 60Hz, 120Hz, or 144Hz.
- **360-Degree 4-Quadrant Raycast Sensor Rig**:
  - Six analytical raycast sensors (**A/B** Ground, **C/D** Ceiling, **E/F** Wall Push) that dynamically rotate in $90^\circ$ increments across Floor (`Mode 0`), Right Wall (`Mode 1`), Ceiling (`Mode 2`), and Left Wall (`Mode 3`).
  - Exact `±14px` ground snap window, `±5px` curl/uncurl normal offset, and steep slope slip/detach rules (`FALL_THRESHOLD = 2.5`, 30-frame control lock).
- **Full Move Set**:
  - Running with asymmetric slope factors (`SLP_NORMAL`), high-speed rolling (`SLP_ROLL_UP` vs `SLP_ROLL_DOWN`), Spin Dash (`spindash_rev` charge & decay), perpendicular slope jump launch, short-hop release clamp (`-4.0`), and airborne apex drag (`0.96875`).
  - Full air-to-ground momentum conversion across shallow, half-steep, and steep landing angles.
- **Dual-Layer 360° Loop-de-Loop & Analytical Terrain**:
  - Supports `LineSurface`, `HeightFieldSurface` ($y = f(x)$ with exact derivative), and `ArcSurface` primitives.
  - Built-in dual-layer loop system (`layer 0` entry + `layer 1` exit) with automatic entry, apex, and exit collision-layer switching gates.
- **Real-Time Debug HUD & Visualizer**:
  - Live telemetry for `State`, `GSP`, `Xsp/Ysp`, `Angle`, `Mode`, `Layer`, `Lock`, and `Rev`, plus toggleable on-screen rendering of the A–F sensor rays and hitbox.

---

## 🎮 Controls

| Key | Action |
| :--- | :--- |
| **Left / Right Arrows** or **A / D** | Run / Steer / Decelerate |
| **Down Arrow** or **S** | Crouch (when stopped) or Roll (when `\|gsp\| >= 1.0`) |
| **Down** + **Space / Z / X / C** (Tap repeatedly) | Charge Spin Dash (Release **Down** to launch) |
| **Space / Z / X / C** | Jump (Release early for short hop) |
| **Tab** or **G** | Toggle Debug HUD & Sensor Raycast Overlay |
| **1 – 7** | Warp to Stage Checkpoints (Runway, Hills, Valley, Loop, Tunnel, Ramp) |
| **R** | Reset Player to Stage Start |

---

## 🖥️ Cross-Platform Setup (Linux, macOS, & Windows)

This repository is 100% OS-independent and verified automatically via GitHub Actions across **Ubuntu Linux**, **macOS**, and **Windows**.

### Option A: Zero-Install Instant Play (No Node.js Required)
Because [`public/index.html`](public/index.html) and [`public/sonic-engine.js`](public/sonic-engine.js) are self-contained with procedural graphics and Web Audio synthesis (no CORS-restricted external fetches), you can clone or download the ZIP and open `public/index.html` directly in any modern browser:

```bash
git clone https://github.com/Protoevaneglium/sonic-retro-physics-engine.git
cd sonic-retro-physics-engine

# macOS:
open public/index.html

# Linux:
xdg-open public/index.html

# Windows (PowerShell / CMD):
start public/index.html
```

### Option B: Run with Node.js Server & Automated Test Suite
If you have [Node.js](https://nodejs.org/) (v18+ recommended) installed on Linux, macOS, or Windows:

```bash
git clone https://github.com/Protoevaneglium/sonic-retro-physics-engine.git
cd sonic-retro-physics-engine

# 1. Install dependencies
npm install

# 2. Run the 21-test headless physics verification suite
npm test

# 3. Start the local Express server (defaults to http://localhost:3000, or set PORT=8080)
npm start
```

---

## 📁 Repository Structure

```text
├── SONIC_PHYSICS_SPEC.md        # Complete Sonic Retro Physics Specification & math reference
├── public/
│   ├── sonic-engine.js          # Core UMD 16-bit physics & 360° terrain engine (Browser + Node)
│   ├── index.html               # Playable Green Hill test stage, sprite renderer, audio & HUD
│   ├── index_phaser_backup.html # Legacy Phaser prototype backup
│   ├── assets/                  # Sprite assets
│   └── js/                      # Legacy prototype scripts
├── tests/
│   └── sonic_engine_test.js     # 21-test headless physics verification suite
├── server.js                    # Cross-platform Express static server (port 3000)
├── .gitattributes               # LF line-ending normalization for Linux/macOS/Windows
└── package.json                 # Scripts and dependencies
```

---

## 🛠️ Using This Base for Future Sonic Fan Games

[`public/sonic-engine.js`](public/sonic-engine.js) is a standalone UMD module that works in both the browser (`window.SonicEngine`) and Node.js (`require('./public/sonic-engine.js')`):

```javascript
const { Terrain, Player } = window.SonicEngine;

// 1. Load the built-in Green Hill test course (or construct custom surfaces)
const terrain = new Terrain();

// 2. Spawn the player on the terrain
const player = new Player(terrain);

// 3. Step physics in your requestAnimationFrame loop (frame-rate independent)
player.update({
  left: keys.left,
  right: keys.right,
  down: keys.down,
  jumpHeld: keys.jumpHeld,
  jumpPressed: keys.jumpPressed
}, dtSeconds);
```
