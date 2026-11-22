# Gameplay baseline verification

`npm test` runs the normal routes and regressions, including the adversarial engine, runtime, NPC, input, rendering, server and packaging checks. It deliberately fails if the downloadable starter is stale.

`npm run test:consistency` checks the shared gameplay formula across every campaign act registered by the shipped page: acceleration, variable jump, Spin Dash, Peel-Out and Drop Dash at 30/60/144 Hz; ring and monitor rewards, power-up durations, shield/ring damage, checkpoint recovery, enemy species, repeated object resets, action sounds, trap-door opening/closing cues, title cards and inter-act carryover. Optional scenery, music, rosters and act-specific mechanics may vary. Both full verification commands include this suite. The browser harness loads the actual page's script list so new acts join the checks automatically.

To rebuild that starter, run every independent test file, and save a source fingerprint with the actual results:

```sh
npm run verify:baseline
```

For the intensive run, including extended seeded rendering and resource checks:

```sh
npm run verify:baseline -- --stress
```

Reports are written to `output/qa/baseline.json` or `output/qa/baseline-stress.json`. Each records the Node version, platform, per-suite exit codes and timings, and SHA-256 fingerprint of the tested source/assets/distributable. A source change during verification fails the run. Local output and unrelated handoff files are not part of the fingerprint.

The suites use fixed seeds so failures can be reproduced:

- Engine: seven stages, four seeds each, jittered 30/60/144 Hz timing, 67,200 updates; plus targeted physics, damage, death and reward tests. Campaign registrations are read from the shipped page so future acts join these traces.
- Browser lifecycle: real game callbacks, four action seeds and 3,600 scheduled frames; rapid resets, warps, deaths, results, visibility changes, invalid timestamps, audio failures and delayed assets.
- NPC: twelve seeds and 72,000 updates; crowding at both boundaries, input edges/cooldowns, real hops, dialogue, lava ignition and death/retry behavior.
- Rosie interactions: hugs from both sides at 30/60/144 Hz, interruptions, cooldowns, sprite/glove layering and hearts; C/number-key/on-screen conversation controls, remembered choices and lifecycle cleanup. The conversation library also receives 30,000 seeded actions across all 35 nodes and 105 replies.
- Scar speech: original PCM sample hashes, yes/yeah once per real hug, act/life/peel-out hooks, cooldown and hug priority, a bounded voice channel, mute, stale callbacks, and Web Audio/media failures.
- Xbox / standard gamepads: 12,000 seeded input polls plus real game integration at 30/60/144 Hz, stick deadzones, mixed input ownership, hotplug, blocked APIs, neutral re-arming, intro handoff, special moves, dialogue selection, pause across every world phase, and safe results/game-over transitions. These tests inject browser-standard gamepad states; they do not certify a physical controller or Bluetooth driver.
- Android release: native host pause/resume and Back behavior, duplicate intro interruptions, keyboard repeats after focus recovery, deterministic offline asset staging and exclusion of private signing material. The signed APK additionally receives SDK lint, signature and bundled-byte verification, native asset path/range boundary tests, and real Android emulator tests for multitouch, media ranges, all acts/checkpoints/eras, lifecycle churn, Rosie assists and recreation. See `ANDROID.md` for commands and recorded device limits.
- Rendering: every checkpoint and time era, complete/missing/delayed images, loaded sprite atlases, power-ups, debris and game-over recovery. Strict canvas checks reject nonfinite drawing coordinates, invalid radii, leaked save/restore stacks and resource growth. The stress run extends each stage/asset-mode control trace to 3,000 rendered frames.
- Enemy sources: a built-in PNG decoder independently checks all 77 atlas frames against the two supplied Badnik sheets, including exact source pixels, background transparency, source-file hashes and clear packing gutters. Rendering checks cover every campaign roster, all animation frames, stable species defaults, display anchors, nearest-neighbor scaling and deferred/failed images. These checks cover regular enemies; Kitt uses the separately documented custom boss art.
- Sanctuary Duet: actual 30/60/144 Hz approach runs, both armored bosses, Rosie's physical tag assist, note and returning-claw attacks, one hit per opening, damage/retry and bounded encounter resources. Browser checks exercise Act 2 carryover, the opening voice, C/controller X, pause/visibility and post-fight conversations. The ordinary animal capsule stays locked until both bosses fall. Boss source crops receive independent pixel checks against the supplied Vector and Crush Crawfish sheets.
- Server/package: native and optional Express paths, media range/HEAD/error handling, confinement to the public directory, and bundled source/asset integrity. Isolated builds from LF and CRLF source files must produce the same starter archive; archive text uses canonical line endings and binary assets retain their exact bytes.
- Installers: disposable local Git repositories exercise behind, ahead, diverged, dirty and detached checkouts without running installation, downloads or PATH changes. Updates only fast-forward a clean attached branch; local edits and commits are preserved. Available PowerShell, batch and shell update blocks are executed; unavailable interpreters are reported and their source guards still checked. On the recorded Windows host, PowerShell and batch blocks execute while shell blocks receive static checks.
- Asset utilities: native file-lock simulation runs without optional dependencies; installed Sharp also exercises real image conversion, transparency, source removal, and invalid CLI arguments.

The fixed baseline covers phase-correct moving platforms and consistent jump inheritance, bounded catch-up and ring grants, clean damage/death state, respawn protection, canceled time-warp retries, reliable input edges, hidden-tab pausing, bounded audio playback, recovery after draw failures, stale asset callbacks, game-over checkpoint recovery, Rosie boundary/dialogue timing, confined media serving, cancelled stream cleanup, and safe installer updates.

The headless harness is in `tests/helpers/game_harness.js`. It runs the actual shipped engine, levels, HUD and inline browser runtime; it supplies deterministic DOM/media/canvas shims and an explicit animation scheduler. Dedicated browser playtesting complements these shims because they cannot reproduce every device, GPU or audio driver.

For a manual pass, check the intro, ordinary running and jumping, a low-speed loop retry, moving-platform jumps, damage with and without rings/shield, death/checkpoint/game-over recovery, act-clear carryover, and Zone 2 Act 2 lava at 15 seconds. Near Rosie, press C and choose replies with 1/2/3 or the on-screen buttons; close with C/Esc, reopen and check remembered preferences. Stand facing away for a hug, then interrupt by turning, moving or jumping. Confirm an ask/space preference suppresses surprise hugs. Repeat after a checkpoint warp and stage reset. Confirm the browser console has no errors.

A passing run establishes the recorded baseline. It does not prove that every possible input sequence is defect-free. CI separately checks the configured Windows, macOS and Linux matrix; a local report only certifies its recorded host.

For a physical-controller pass, connect an Xbox controller over USB and Bluetooth separately, focus the game, press and release A, then start with A/Menu. Check movement, jump height, down+A spin dash, up+A peel-out, wall kicks, X/Up/Down/A/B dialogue, and Menu pause/resume. Unplug while moving, reconnect with a held button, switch windows and return, and continue results/game over with A. A fresh release must prevent unwanted movement, jumps or skipped screens.
