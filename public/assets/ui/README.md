# HUD source assets

Imported from the user-provided Sonic sprite archives for Scar's HUD refresh:

- `unleashed/mat_comon_num_001.PNG`: number glyphs from **Xbox 360 - Sonic Unleashed - Miscellaneous - HUD.zip**. The supplied `HUD (1).zip` is an identical duplicate and is imported only once.
- `unleashed/mat_playscreen_en_001.PNG`: score, time, ring, and speed labels from the same Unleashed archive.
- `colors/HUD Icons/1.png`: stopwatch and ring icons from **Wii - Sonic Colors - Miscellaneous - HUD Elements.zip**.
- `colors/ui-text.png`: praise callouts from **Wii - Sonic Colors - Miscellaneous - UI text.png**.

The four PNGs preserve their original transparency and pixels; unused archive textures are excluded. The game draws selected crops from these atlases alongside original canvas panels and typography. Praise callouts are cosmetic and do not introduce a rank mechanic or change scoring, gameplay sprites, or physics.

To import again on Windows, run `scripts/import-hud-assets.ps1` from the repository root. Its optional `-SourceDirectory` argument selects the folder containing the supplied downloads.
