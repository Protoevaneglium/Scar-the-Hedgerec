# Scar the Hedgerec 🦔⚡

**Scar the Hedgerec** is a high-speed 16-bit retro platformer built on an authentic 360-degree fixed-point physics engine. Designed as a clean, cross-platform (**Windows, Linux, macOS, and Termux / Android**) HTML5 Canvas & JavaScript game with zero external runtime dependencies required.

📄 **[Read the Full Physics Specification (`SONIC_PHYSICS_SPEC.md`)](SONIC_PHYSICS_SPEC.md)**

---

## ✨ Key Features

- **Custom Character, Badniks, Common Objects & Audio**:
  - **Scar the Hedgerec**: Custom speed-reactive 5-state sprite animation rig (`idle`, `walk1`, `walk2`, `run1`, `run2`) + Spin Dash ball physics.
  - **8 Animated Badniks**: **Motobug**, **Crabmeat**, **Buzz Bomber**, **Spikes (Yadorin)**, **Caterkiller**, **Burrobot**, **Batbrain**, and **Chopper**.
  - **Classic Sonic Common Objects**: Animated **Rings & Ring Sparkles**, **Item Monitors** (*Blue Shield*, *Invincibility*, *Super Ring +10*, *Speed Shoes*), **Checkpoint Star Posts**, **Red & Yellow Springs**, **Spikes**, **Giant Ring (Okina Ring)**, and the spinning **Robotnik / Sonic Goal Post**.
  - **Authentic Audio**: Looping Level 1 soundtrack (`level1.mp3`) + custom WAV sound effects (`jump.wav`, `rings.wav`, `goalpost.wav`).
- **Multi-Tiered Act 1 Stage Design**:
  - **Three Vertical Routes (`High` / `Middle` / `Low`)** with **Bounce Poles**, **Breakable Walls**, **Breakable Floors**, **Houdini Steps**, **Spinners**, **Swinging & Moving Platforms**, **Trap Doors**, **Rocks**, **Speed Boosters**, **Time Warp Posts (`PAST` / `FUTURE`)**, and a **Live Stage Map Radar**.
- **Exact 16-Bit Fixed-Point Physics (`60 FPS` Sub-stepped)**:
  - Six analytical raycast sensors (**A/B** Ground, **C/D** Ceiling, **E/F** Wall Push) across Floor (`Mode 0`), Right Wall (`Mode 1`), Ceiling (`Mode 2`), and Left Wall (`Mode 3`), plus dual-layer 360° Loops (**Loop #1** & **Loop #2**).

---

## 📱🖥️ Running on All Platforms (Termux/Android, Windows, Linux, macOS)

The server ([`server.js`](server.js)) includes a **zero-dependency native Node HTTP server** with HTTP Range support for audio streaming, so it runs immediately on **Termux/Android**, **Windows**, **Linux**, and **macOS** even without running `npm install`.

### 1. Termux / Android 📱 (Type `scar` to Launch!)
Includes built-in multi-touch D-Pad (`◀`, `▼`, `▶`) and `JUMP` controls for Android screens, plus an auto-installer that generates the global **`scar`** launcher (`$PREFIX/bin/scar` and `~/scar.bat`) so anytime you open Termux you just type **`scar`** and hit Enter!

#### Option A: One-Line Termux Auto-Install
Paste this once into Termux:
```bash
pkg update -y && pkg install -y curl && curl -fsSL https://raw.githubusercontent.com/Protoevaneglium/Scar-the-Hedgerec/main/install-termux.sh | sh
```
From now on, whenever you open Termux, just type:
```bash
scar
```
and it automatically starts the server and launches your Android browser at `http://localhost:3000`!

#### Option B: Clone & Setup Manually
```bash
pkg update -y && pkg install -y git nodejs
git clone https://github.com/Protoevaneglium/Scar-the-Hedgerec.git
cd Scar-the-Hedgerec
sh start-termux.sh
# Automatically installs the global `scar` command on first run and opens the game!
```

### 2. Windows 🪟
Double-click [`scar.bat`](scar.bat) or [`start-windows.bat`](start-windows.bat), or run in PowerShell / CMD:

```powershell
git clone https://github.com/Protoevaneglium/Scar-the-Hedgerec.git
cd Scar-the-Hedgerec

# Start server and open browser automatically:
.\scar.bat
# (Optional: run `npm link` once to type `scar` from any terminal window on Windows too!)
```

### 3. Linux & macOS 🐧🍎
Run [`start-linux-mac.sh`](start-linux-mac.sh) or use `npm`:

```bash
git clone https://github.com/Protoevaneglium/Scar-the-Hedgerec.git
cd Scar-the-Hedgerec

# Start server and open default browser automatically:
sh start-linux-mac.sh
# Or with Node / npm:
npm start
```

### 4. Run the Automated 26-Test Verification Suite
```bash
npm test
```

---

## 🎮 Controls (Keyboard & Android Touch)

| Input | Action |
| :--- | :--- |
| **Left / Right Arrows**, **A / D**, or Touch **◀ / ▶** | Run / Steer / Decelerate |
| **Down Arrow**, **S**, or Touch **▼** | Crouch (when stopped) or Roll (when `\|gsp\| >= 1.0`) |
| **Down (▼)** + **Space / Z / X / C / JUMP** | Charge Spin Dash (Release **Down** to launch) |
| **Space / Z / X / C** or Touch **JUMP** | Jump (Release early for short hop) |
| **1 – 7** (or Top-Bar **Checkpoint** button) | Warp to Stage Checkpoints |
| **T** (or Top-Bar **Time** button) | Cycle Time Era (*Good Future* / *Present* / *Past*) |
| **M** (or Top-Bar **Stage** button) | Switch between *Act 1* and the *Physics Test* course |
| **Tab** or **G** | Toggle Debug HUD & Sensor Raycast Overlay |
| **R** | Reset Stage & Objects |
