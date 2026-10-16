# SONIC RETRO PHYSICS SPECIFICATION (SOURCE OF TRUTH)

This document serves as the mathematical and architectural source of truth for the 16-bit Sonic the Hedgehog physics engine in [`public/sonic-engine.js`](public/sonic-engine.js). All values are specified in **pixels per frame at 60 FPS** and scaled dynamically by `(dt * 60)` for frame-rate independence.

---

## 1. Core Constants (60 FPS Pixels/Frame)
* `ACC` (Ground Acceleration): `0.046875` ($12 / 256$)
* `DEC` (Ground Deceleration when holding opposite direction): `0.5` ($128 / 256$)
* `FRC` (Ground Friction with no input): `0.046875` ($12 / 256$)
* `TOP` (Normal Top Speed cap): `6.0` (Note: Do NOT clamp `gsp` to `6.0` if the player exceeds it via slopes or rolling; simply stop adding `ACC` once `|gsp| >= TOP`. Hard cap absolute speed at `16.0`).
* `ROLL_FRC` (Rolling Friction): `0.0234375` ($6 / 256$)
* `ROLL_DEC` (Rolling Deceleration): `0.125` ($32 / 256$)
* `AIR_ACC` (Air Horizontal Acceleration): `0.09375` ($24 / 256$)
* `GRV` (Airborne Gravity): `0.21875` ($56 / 256$)
* `JMP` (Jump Force): `6.5`
* `JMP_RELEASE_CAP` (Short-hop clamp): `-4.0`
* `SLP_NORMAL` (Running Slope Factor): `0.125` ($32 / 256$)
* `SLP_ROLL_UP` (Rolling Uphill Slope Factor): `0.078125` ($20 / 256$)
* `SLP_ROLL_DOWN` (Rolling Downhill Slope Factor): `0.3125` ($80 / 256$)
* `FALL_THRESHOLD` (Minimum `|gsp|` required to stick to steep walls/ceilings): `2.5`

## 2. Hitbox Radii & Sensor Offsets (in Pixels from Center `X, Y`)
* **Standing / Running:** `width_radius = 9`, `height_radius = 19`, `push_radius = 10`
* **Rolling / Jumping:** `width_radius = 7`, `height_radius = 14`, `push_radius = 10`
* **Curl/Uncurl Offset Rule:** When transitioning from Standing to Rolling on the ground, add `+5` pixels toward the floor normal (`Y += 5` on flat ground) so feet stay attached to the surface. Subtract `-5` pixels when uncurling.
* **The 6 Raycast Sensors:**
  * **Sensor A (Left Ground):** Offset `-width_radius` laterally, cast down `height_radius + 16` pixels.
  * **Sensor B (Right Ground):** Offset `+width_radius` laterally, cast down `height_radius + 16` pixels.
  * **Sensor C (Left Ceiling):** Offset `-width_radius` laterally, cast up `height_radius` pixels.
  * **Sensor D (Right Ceiling):** Offset `+width_radius` laterally, cast up `height_radius` pixels.
  * **Sensor E (Left Wall Push):** At center height (`Y`), cast left `push_radius` pixels.
  * **Sensor F (Right Wall Push):** At center height (`Y`), cast right `push_radius` pixels.

## 3. Ground Speed (`gsp`), Slope Factors, and Velocity Conversion
In the `GROUNDED` state, horizontal/vertical movement is governed by a single float `gsp` and the surface angle `angle` (`0°` = flat floor, `90°` = right wall going up, `180°` = ceiling, `270°` = left wall going down):
1. **Apply Slope Factor FIRST every frame:**
   * If `state == RUNNING`: `gsp -= SLP_NORMAL * sin(angle)`
   * If `state == ROLLING`:
     * Uphill (`sign(gsp) == sign(sin(angle))`): `gsp -= SLP_ROLL_UP * sin(angle)`
     * Downhill (`sign(gsp) != sign(sin(angle))`): `gsp -= SLP_ROLL_DOWN * sin(angle)`
2. **Apply Player Input & Friction:**
   * In `RUNNING`: Apply `ACC`, `DEC`, and `FRC` (when no input is held).
   * In `ROLLING`: Disable `ACC` (cannot accelerate manually while curled). Allow `ROLL_DEC` when holding the opposite direction, and always apply `ROLL_FRC`. Uncurl to `RUNNING` if `|gsp| < 0.5`.
   * Enter `ROLLING` if grounded, pressing Down, and `|gsp| >= 1.0`.
3. **Convert `gsp` to World `Xsp` and `Ysp`:**
   * `Xsp = gsp * cos(angle)`
   * `Ysp = gsp * -sin(angle)`

## 4. Spin Dash Mechanics
* Triggered when grounded, `|gsp| < 0.5`, holding Down, and pressing Jump.
* On first Jump press: enter `SPINDASH` state, set `spindash_rev = 0`.
* Each subsequent Jump press while holding Down: `spindash_rev = min(spindash_rev + 2.0, 8.0)`.
* Every frame while holding Down: `spindash_rev -= ((spindash_rev / 0.125) / 256.0)`.
* On releasing Down: enter `ROLLING` state and launch with:
  * `gsp = (8.0 + (floor(spindash_rev) / 2.0)) * facing_direction` (yields speed between `8.0` and `12.0`).

## 5. Jumping, Air Drag & Gravity
* **Jump Launch:** Leave ground, enter `AIRBORNE` + `ROLLING` hitbox, and add jump impulse perpendicular to the ground angle:
  * `Xsp -= JMP * sin(angle)`
  * `Ysp -= JMP * cos(angle)`
* **Variable Jump Height:** If Jump button is released while `Ysp < -4.0`, set `Ysp = -4.0`.
* **Air Drag:** Every airborne frame BEFORE gravity, if `-4.0 < Ysp < 0.0` and `|Xsp| >= 0.125`:
  * `Xsp *= 0.96875`
* **Gravity:** `Ysp = min(Ysp + GRV, 16.0)`. Gradually return visual `angle` toward `0°`.

## 6. 360-Degree Quadrant Collision Modes & Wall Detach Rules
Rotate the 6 sensor cast directions in 90-degree increments based on `angle`:
* **Mode 0 (Floor):** `315° <= angle <= 360°` or `0° <= angle < 45°` (Ground sensors cast Down)
* **Mode 1 (Right Wall):** `45° <= angle < 135°` (Ground sensors cast Right)
* **Mode 2 (Ceiling):** `135° <= angle <= 225°` (Ground sensors cast Up)
* **Mode 3 (Left Wall):** `225° < angle < 315°` (Ground sensors cast Left)
* **Winning Ground Sensor:** Both Sensors A and B check distance to the surface along the current Mode axis. Snap player position to whichever sensor finds the **highest/closest** surface within a `±14px` snap window, and adopt that surface's normal angle.
* **Slip & Detach Rule:** If `|gsp| < 2.5` while `46° <= angle <= 314°`:
  * Set `control_lock_timer = 30` frames (ignore left/right input while > 0).
  * If `70° <= angle <= 290°` (steep walls and ceiling), immediately detach into `AIRBORNE` state.

## 7. Landing Momentum Conversion (Air-to-Ground Re-attachment)
When airborne sensors detect ground and the player lands at surface angle `angle`, recalculate `gsp` to preserve momentum down slopes and curves:
* **Shallow (`0°–22.5°` or `337.5°–360°`):** `gsp = Xsp`
* **Half-Steep (`22.5°–45°` or `315°–337.5°`):**
  * If `|Xsp| > Ysp`: `gsp = Xsp`
  * Else: `gsp = Ysp * 0.5 * -sign(sin(angle))`
* **Steep (`45°–90°` or `270°–315°`):**
  * If `|Xsp| > Ysp`: `gsp = Xsp`
  * Else: `gsp = Ysp * -sign(sin(angle))`

---

## 8. Engine Architecture & Implementation Notes (`public/sonic-engine.js`)

### Analytical One-Sided Surface Primitives
Rather than discrete 16x16 pixel heightmasks, [`public/sonic-engine.js`](public/sonic-engine.js) uses analytical C1-continuous surface primitives with exact mathematical tangents and one-sided normal filtering (`dot(rayDir, normal) < -0.15`):
* **`LineSurface(x1, y1, x2, y2, layer)`**: Directed line segment where the outward surface normal points to the left of the vector `(x1, y1) -> (x2, y2)`.
* **`HeightFieldSurface(xStart, xEnd, fn, dfn, layer)`**: Continuous 1D function $y = f(x)$ with exact derivative $f'(x)$ for smooth rolling sine hills, valleys, and cosine ramps.
* **`ArcSurface(cx, cy, r, startDeg, endDeg, insideNormal, layer)`**: Analytical circular arc with exact tangent angle `theta` and inward/outward normal support for $360^\circ$ loops.
* **`PathBuilder`**: Utility for chaining smooth lines and tangent arcs.

### Dual-Layer 360° Loop-de-Loop System
Classic Sonic loops overlap at the bottom entry/exit (`x = cx`). The `Terrain.addLoop(cx, cy, radius)` method builds two overlapping collision layers (`layer 0` and `layer 1`) plus three automated trigger gates:
1. **Entry Gate (`x < cx - r * 0.5`)**: Forces `collisionLayer = 0` so the player enters on the right-ascending ground ramp (`0° -> 90° -> 180°`).
2. **Apex Gate (`x ≈ cx` and `y < cy`)**: Switches `collisionLayer = 1` at the top of the loop (`180°`) so the player transitions onto the left-descending wall (`180° -> 270° -> 360°`) and exits cleanly through the bottom without colliding with the entry wall.
3. **Exit Gate (`x > cx + r * 0.5`)**: Restores `collisionLayer = 0` after clearing the loop.
