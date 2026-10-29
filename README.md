# Scar the Hedgerec 🦔⚡

**Scar the Hedgerec** is a high-speed 16-bit retro platformer built on an authentic 360-degree fixed-point physics engine. Designed as a clean, cross-platform (**Windows, Linux, macOS, and Termux / Android**) HTML5 Canvas & JavaScript game with zero external runtime dependencies required.

📄 **[Read the Full Physics Specification (`SONIC_PHYSICS_SPEC.md`)](SONIC_PHYSICS_SPEC.md)**  
📐 **[Level Core Foundation Blueprint (`templates/LEVEL_CORE_BLUEPRINT.md`)](templates/LEVEL_CORE_BLUEPRINT.md)** • **[Downloadable Starter Core Kit (`.zip`)](public/downloads/scar-level-core-template.zip)** *(or open `/template.html` when running locally)*

---

## 🚀 Easy Install & Startup (Windows, Linux, macOS, Termux / Android)

Every platform uses a simple **2-step setup**:
1. Run the **First-Time Install** command once — it downloads/updates the game and automatically generates your **`scar`** (`.bat` / `.sh`) launcher.
2. **Every time after that**, just open your terminal / Command Prompt and type **`scar`**!

> **Note:** Every command box below contains **only runnable commands** (no `#` comments inside the boxes), so you can click GitHub's **Copy** icon and paste directly into Windows Command Prompt (`cmd`), PowerShell, Linux Terminal, or Termux without errors.

---

### 1. Windows 🪟 (Command Prompt `cmd` or PowerShell)

#### Step 1 — First-Time Install (Run Once)
Open **Command Prompt (`cmd`)** or **PowerShell**, paste this single command, and press **Enter** *(automatically installs or updates `%USERPROFILE%\Scar-the-Hedgerec`, checks for Node.js, and creates `scar.bat` on your PATH)*:

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/Protoevaneglium/Scar-the-Hedgerec/main/install-windows.ps1 | iex"
```

#### Step 2 — Start the Game Every Time
Whenever you open **Command Prompt** or **PowerShell**, simply type:

```cmd
scar
```

*(You can also type `scar.bat`, or double-click `scar.bat` in your user folder `C:\Users\<YourName>\scar.bat` or inside the `Scar-the-Hedgerec` folder. Press `Ctrl+C` in the terminal window anytime to stop the server.)*

<details>
<summary><b>Alternative: Manual Git Clone / ZIP Install on Windows</b></summary>

If you cloned or unzipped the repository manually, run this inside the `Scar-the-Hedgerec` folder once to register the global `scar` / `scar.bat` command (or simply double-click `install-windows.bat` in File Explorer):

```cmd
install-windows.bat
```

Then start the game anytime by typing:

```cmd
scar.bat
```
</details>

---

### 2. Linux & macOS 🐧🍎

#### Step 1 — First-Time Install (Run Once)
Open your **Terminal**, paste this single command, and press **Enter** *(clones or updates `~/Scar-the-Hedgerec` and generates `~/.local/bin/scar` + `~/scar.sh`)*:

```bash
curl -fsSL https://raw.githubusercontent.com/Protoevaneglium/Scar-the-Hedgerec/main/install-linux.sh | sh
```

*(If your Linux distro uses `wget` instead of `curl`, use:)*

```bash
wget -qO- https://raw.githubusercontent.com/Protoevaneglium/Scar-the-Hedgerec/main/install-linux.sh | sh
```

#### Step 2 — Start the Game Every Time
Whenever you open a new **Terminal**, simply type:

```bash
scar
```

*(To launch immediately inside the same terminal window right after first-time install without opening a new tab, run `sh ~/scar.sh`.)*

<details>
<summary><b>Alternative: Manual Git Clone Install on Linux / macOS</b></summary>

```bash
git clone https://github.com/Protoevaneglium/Scar-the-Hedgerec.git
cd Scar-the-Hedgerec
sh install-linux.sh
sh scar.sh
```
</details>

---

### 3. Termux / Android 📱

#### Step 1 — First-Time Install (Run Once)
Open **Termux**, paste this single command, and press **Enter** *(installs Node.js/Git if needed, downloads the game, and generates `$PREFIX/bin/scar` + `~/scar.bat`)*:

```bash
pkg update -y && pkg install -y curl && curl -fsSL https://raw.githubusercontent.com/Protoevaneglium/Scar-the-Hedgerec/main/install-termux.sh | sh
```

#### Step 2 — Start the Game Every Time
Whenever you open **Termux**, simply type:

```bash
scar
```

and press **Enter** — it starts the local server and opens your Android browser at `http://localhost:3000` with multi-touch D-Pad (`◀`, `▼`, `▶`) and `JUMP` controls!

---

## ✨ Key Features

- **Classic 3-Act Zone Progression, Title Cards & Lives System**:
  - **16-Bit Sliding Title Cards** on every Act (starting with *Palmtree Panic — Zone — Act 1*) + Act Clear Score Tally (`TIME BONUS` + `RING BONUS`) & smooth fade transitions across `Act 1` &rarr; `Act 2` &rarr; `Act 3 (Boss Act with Animal Capsule)` &rarr; `Next Zone`.
  - **Classic Lives (`SCAR × 03`)**: Start with `3` lives, earn extra lives from **Scar `1-Up` TV Monitors** and every **100 Rings**, with authentic pixel **`GAME OVER`** and 10:00 **`TIME OVER`** overlays.
- **Custom Character, Badniks, Common Objects & Audio**:
  - **Scar the Hedgerec**: Custom speed-reactive 5-state sprite animation rig (`idle`, `walk1`, `walk2`, `run1`, `run2`) + Spin Dash ball physics.
  - **8 Animated Badniks**: **Motobug**, **Crabmeat**, **Buzz Bomber**, **Spikes (Yadorin)**, **Caterkiller**, **Burrobot**, **Batbrain**, and **Chopper**.
  - **Classic Sonic Common Objects**: Animated **Rings & Ring Sparkles**, **Item Monitors** (*Blue Shield*, *Invincibility*, *Super Ring +10*, *Speed Shoes*, *Scar 1-Up*), **Checkpoint Star Posts**, **Red & Yellow Springs**, **Spikes**, **Giant Ring (Okina Ring)**, spinning **Robotnik / Sonic Goal Post**, and **Act 3 Boss Animal Capsule**.
  - **Authentic Audio**: Looping soundtrack (`level1.mp3`) + custom WAV sound effects (`jump.wav`, `rings.wav`, `goalpost.wav`) + 16-bit 1-Up, Score Tally, and Game Over jingles.
- **Exact 16-Bit Fixed-Point Physics (`60 FPS` Sub-stepped)**:
  - Six analytical raycast sensors (**A/B** Ground, **C/D** Ceiling, **E/F** Wall Push) across Floor (`Mode 0`), Right Wall (`Mode 1`), Ceiling (`Mode 2`), and Left Wall (`Mode 3`), plus dual-layer 360° Loops (**Loop #1** & **Loop #2**).

---

## 🧪 Run the Automated 29-Test Verification Suite

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
| **Space / Z / X / C** or Touch **JUMP** | Jump (Release early for short hop; fast-forwards Act Clear tally) |
| **1 – 7** (or Top-Bar **Checkpoint** button) | Warp to Stage Checkpoints |
| **T** (or Top-Bar **Time** button) | Cycle Time Era (*Good Future* / *Present* / *Past*) |
| **M** (or Top-Bar **Stage** button) | Switch Stage (*Zone 1 Act 1*, *Act 2*, *Act 3 Boss*, *Physics Test*) |
| **Tab** or **G** | Toggle Debug HUD & Sensor Raycast Overlay |
| **R** | Reset Stage & Objects (or Restart on Game Over) |
