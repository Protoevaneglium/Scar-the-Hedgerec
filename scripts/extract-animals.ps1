# Extract the user's Sonic 2 reference into a transparent, unscaled sprite atlas.
param([Parameter(Mandatory=$true)][string]$SourcePath)
Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $SourcePath).Path)
$atlas = [System.Drawing.Bitmap]::new(96, 384, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$names = @('flicky','cucky','pocky','ricky','pecky','rocky','locky','becky','wocky','micky','tocky','picky')
$columns = @(@(128,156), @(157,184), @(185,217))
$backgrounds = @('FF25661A','FF0D4807','FF03470E')
try {
    for ($row = 0; $row -lt $names.Length; $row++) {
        $top = if ($row -eq 0) { 250 } else { 326 + ($row - 1) * 44 }
        for ($frame = 0; $frame -lt 3; $frame++) {
            $points = [System.Collections.Generic.List[object]]::new()
            $minX = 999; $maxX = -1; $minY = 999; $maxY = -1
            for ($y = $top; $y -lt $top + 30; $y++) {
                for ($x = $columns[$frame][0]; $x -le $columns[$frame][1]; $x++) {
                    $color = $source.GetPixel($x, $y)
                    if ($color.A -eq 0 -or $backgrounds -contains $color.ToArgb().ToString('X8')) { continue }
                    $points.Add(@{X=$x;Y=$y;Color=$color})
                    $minX = [Math]::Min($minX,$x); $maxX = [Math]::Max($maxX,$x)
                    $minY = [Math]::Min($minY,$y); $maxY = [Math]::Max($maxY,$y)
                }
            }
            if ($points.Count -eq 0) { throw "Missing $($names[$row]) frame $frame" }
            $width = $maxX - $minX + 1; $height = $maxY - $minY + 1
            if ($width -gt 32 -or $height -gt 32) { throw 'Sprite exceeds atlas cell' }
            $destX = $frame * 32 + [Math]::Floor((32 - $width) / 2)
            $destY = $row * 32 + 32 - $height
            foreach ($point in $points) {
                $atlas.SetPixel($destX + $point.X - $minX, $destY + $point.Y - $minY, $point.Color)
            }
            Write-Output "$($names[$row]) frame ${frame}: ${width}x${height}"
        }
    }
    $destination = Join-Path $PSScriptRoot '../public/assets/animals.png'
    $atlas.Save([System.IO.Path]::GetFullPath($destination), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $atlas.Dispose()
    $source.Dispose()
}
