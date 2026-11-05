param([string]$SourceDirectory = 'C:\Users\mycal\Downloads')

# Import the user-supplied reference atlases. The two Unleashed ZIPs are
# byte-identical; import HUD.zip once and leave HUD (1).zip untouched.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$assetDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/assets/ui'))
$unleashed = Join-Path $SourceDirectory 'Xbox 360 - Sonic Unleashed - Miscellaneous - HUD.zip'
$colors = Join-Path $SourceDirectory 'Wii - Sonic Colors - Miscellaneous - HUD Elements.zip'
New-Item -ItemType Directory -Force -Path "$assetDirectory/unleashed", "$assetDirectory/colors/HUD Icons" | Out-Null
function Import-HudEntry([string]$ArchivePath, [string]$EntryName, [string]$DestinationPath) {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $entry = $archive.GetEntry($EntryName)
        if ($null -eq $entry) { throw "Missing HUD atlas entry: $EntryName" }
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $DestinationPath, $true)
    } finally {
        $archive.Dispose()
    }
}
Import-HudEntry $unleashed 'mat_comon_num_001.PNG' "$assetDirectory/unleashed/mat_comon_num_001.PNG"
Import-HudEntry $unleashed 'mat_playscreen_en_001.PNG' "$assetDirectory/unleashed/mat_playscreen_en_001.PNG"
Import-HudEntry $colors 'HUD Icons/1.png' "$assetDirectory/colors/HUD Icons/1.png"
Copy-Item -LiteralPath (Join-Path $SourceDirectory 'Wii - Sonic Colors - Miscellaneous - UI text.png') -Destination "$assetDirectory/colors/ui-text.png"
Write-Output "Imported four Sonic Unleashed and Sonic Colors HUD atlases into $assetDirectory"
