# Engineering Phase E3 QA: render each page of Word documents to PNG with Word's own layout engine, for the visual
# review. Uses each page's EnhMetaFileBits (an EMF drawn by Word) instead of PDF/XPS export: on this machine the
# fixed-format export hangs in hidden Word sessions (an Acrobat add-in or the printer driver), while page metafiles
# don't. Always works on copies, read-only. Windows + Microsoft Word only.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase-e\intake\qa\word-render.ps1 `
#     -Docs a.docx,b.docx -OutDir <qa folder> [-Width 1100]
param(
  [Parameter(Mandatory = $true)][string[]]$Docs,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [int]$Width = 1100
)
$ErrorActionPreference = 'Stop'
$Docs = @($Docs | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3
try {
  foreach ($file in $Docs) {
    $src = (Resolve-Path $file).Path
    $base = [IO.Path]::GetFileNameWithoutExtension($src)
    $copy = Join-Path $env:TEMP ("e3-render-" + [IO.Path]::GetFileName($src))
    Copy-Item -LiteralPath $src -Destination $copy -Force
    $doc = $word.Documents.Open($copy, $false, $true, $false)
    $win = $doc.ActiveWindow
    $win.View.Type = 3   # wdPrintView
    $pane = $win.Panes.Item(1)
    $count = $pane.Pages.Count
    for ($i = 1; $i -le $count; $i++) {
      [byte[]]$bits = $pane.Pages.Item($i).EnhMetaFileBits
      $stream = New-Object IO.MemoryStream(, $bits)
      $meta = [System.Drawing.Image]::FromStream($stream)
      $height = [int]($meta.Height * $Width / $meta.Width)
      $bmp = New-Object System.Drawing.Bitmap($Width, $height)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.Clear([System.Drawing.Color]::White)
      $g.SmoothingMode = 'AntiAlias'
      $g.DrawImage($meta, 0, 0, $Width, $height)
      $g.Dispose()
      $out = Join-Path $OutDir ("{0}-word-p{1:D2}.png" -f $base, $i)
      $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
      $bmp.Dispose(); $meta.Dispose(); $stream.Dispose()
    }
    "== ${base}: $count pages rendered by Word"
    $doc.Close(0)
    Remove-Item -LiteralPath $copy -Force
  }
} finally {
  $word.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
