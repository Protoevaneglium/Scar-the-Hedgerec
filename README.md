# Scar the Hedgerec 🦔⚡

**Scar the Hedgerec** is a high-speed 16-bit retro platformer built on an authentic 360-degree fixed-point physics engine. Designed as a clean, cross-platform (**Linux, macOS, and Windows**) HTML5 Canvas & JavaScript game with zero external runtime dependencies.

📄 **[Read the Full Physics Specification (`SONIC_PHYSICS_SPEC.md`)](SONIC_PHYSICS_SPEC.md)**

---

## ✨ Key Features

- **Multi-Tiered Act 1 Stage Design**:
  - **Three Vertical Routes (`High` / `Middle` / `Low`)**: High-speed sky arches and canopy ledges, middle-route corkscrew S-tunnels and pinball bumpers, and a continuous lower route with shallow waterfall splash basins and secret caverns.
  - **Interactive Stage Mechanics & Objects**: **Bounce Poles**, **Breakable Walls**, **Breakable Floors** (crumbling into `16x16` tiles), **Houdini Steps**, **Spinners**, **Swinging Platforms**, **Moving Platforms**, **Trap Doors**, **Rocks**, **Speed Boosters**, and **Animated Water Splashes**.
  - **Time Warp Posts (`PAST` / `FUTURE`)**: Pass a Time Post and sustain speed (`|gsp| >= 6`) to trigger a Time Warp between **Good Future**, **Present**, and **Past** visual palettes.
  - **Live Stage Map Radar**: Real-time mini-map tracking your exact position across the 10,400px stage.
- **Exact 16-Bit Fixed-Point Physics (`60 FPS` Sub-stepped)**:
  - Authentic `ACC`, `DEC`, `FRC`, `TOP` (soft cap at `6.0`, hard cap at `16.0`), `ROLL_FRC`, `ROLL_DEC`, `AIR_ACC`, `GRV`, and `JMP` constants.
  - Frame-rate independent `(dt * 60)` sub-stepping so physics behave identically at 60Hz, 120Hz, or 144Hz.
- **360-Degree 4-Quadrant Raycast Sensor Rig**:
  - Six analytical raycast sensors (**A/B** Ground, **C/D** Ceiling, **E/F** Wall Push) that dynamically rotate in $90^\circ$ increments across Floor (`Mode 0`), Right Wall (`Mode 1`), Ceiling (`Mode 2`), and Left Wall (`Mode 3`).
  - Dual-layer 360° Loops (**Loop #1** & **Loop #2**) with automatic entry, apex, and exit collision-layer switching gates.

---

## 🎮 Controls

| Key | Action |
| :--- | :--- |
| **Left / Right Arrows** or **A / D** | Run / Steer / Decelerate |
| **Down Arrow** or **S** | Crouch (when stopped) or Roll (when `\|gsp\| >= 1.0`) |
| **Down** + **Space / Z / X / C** (Tap repeatedly) | Charge Spin Dash (Release **Down** to launch) |
| **Space / Z / X / C** | Jump (Release early for short hop) |
| **1 – 7** | Warp to Stage Checkpoints (*Cliff & Slide*, *Loop #1*, *Waterfalls*, *Dome Arch*, *Corkscrew*, *Fortress*, *Finale*) |
| **T** | Cycle Time Era (*Good Future* / *Present* / *Past*) |
| **M** | Switch between *Act 1* and the *Physics Test* course |
| **Tab** or **G** | Toggle Debug HUD & Sensor Raycast Overlay |
| **R** | Reset Stage & Objects |

---

## 🖥️ Cross-Platform Setup (Linux, macOS, & Windows)

This repository is 100% OS-independent and verified automatically via GitHub Actions across **Ubuntu Linux**, **macOS**, and **Windows**.

### Option A: Zero-Install Instant Play (No Node.js Required)
Open [`public/index.html`](public/index.html) directly in any modern browser:

```bash
git clone https://github.com/Protoevaneglium/Scar-the-Hedgerec.git
cd Scar-the-Hedgerec

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
git clone https://github.com/Protoevaneglium/Scar-the-Hedgerec.git
cd Scar-the-Hedgerec

# 1. Install dependencies
npm install

# 2. Run the 26-test headless physics & stage verification suite
npm test

# 3. Start the local Express server (defaults to http://localhost:3000, or set PORT=8080)
npm start
```

---

## 📁 Repository Structure

```text
├── SONIC_PHYSICS_SPEC.md        # Complete 16-bit Physics Specification & math reference
├── public/
│   ├── sonic-engine.js          # Core UMD 16-bit physics & 360° terrain engine (Browser + Node)
│   ├── index.html               # Playable Scar the Hedgerec stage, sprite renderer, audio & HUD
│   ├── index_phaser_backup.html # Legacy Phaser prototype backup
│   ├── assets/                  # Sprite & stage assets
│   └── js/                      # Legacy prototype scripts
├── tests/
│   └── sonic_engine_test.js     # 26-test headless physics & stage verification suite
├── server.js                    # Cross-platform Express static server (port 3000)
├── .gitattributes               # LF line-ending normalization for Linux/macOS/Windows
└── package.json                 # Scripts and dependencies
```
