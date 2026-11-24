# Engineering Phase E3 QA: open documents in real Microsoft Word (always copies, read-only), with the US English
# dictionary: report whether each opened, its page and word counts and any spelling errors. Windows + Microsoft Word.
# Page images for the visual review come from qa/word-render.ps1: Word's PDF/XPS export hangs in hidden sessions on
# this machine (an Acrobat add-in or the printer driver), so this script doesn't export.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase-e\intake\qa\word-checks.ps1 `
#     -Docs a.docx,b.md,c.txt -OutDir <qa folder> [-Allow Mulemark,HEIC]
param(
  [Parameter(Mandatory = $true)][string[]]$Docs,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$Allow = ''
)
$ErrorActionPreference = 'Stop'
$Docs = @($Docs | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$allowed = @($Allow -split ',' | Where-Object { $_ } | ForEach-Object { $_.ToLowerInvariant() })
New-Item -ItemType Directory -Force $OutDir | Out-Null
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0          # wdAlertsNone
$word.AutomationSecurity = 3     # never run macros
try {
  foreach ($file in $Docs) {
    $src = (Resolve-Path $file).Path
    $name = [IO.Path]::GetFileName($src)
    $copy = Join-Path $env:TEMP ("e3-word-" + $name + $(if ($src -match '\.md$') { '.txt' } else { '' }))
    Copy-Item -LiteralPath $src -Destination $copy -Force
    try {
      $doc = $word.Documents.Open($copy, $false, $true, $false)
    } catch {
      "== ${name}: FAILED TO OPEN: $($_.Exception.Message)"
      continue
    }
    $doc.Content.LanguageID = 1033   # English (US), the app's spelling
    $doc.Content.NoProofing = $false
    $pages = $doc.ComputeStatistics(2)
    $words = $doc.ComputeStatistics(0)
    $errors = @()
    foreach ($e in $doc.SpellingErrors) { $errors += $e.Text }
    $unique = @($errors | Sort-Object -Unique | Where-Object { $allowed -notcontains $_.ToLowerInvariant() })
    "== ${name}: opened; pages=$pages words=$words; spelling: " + $(if ($unique.Count) { $unique -join ', ' } else { 'none' })
    $doc.Close(0)
    Remove-Item -LiteralPath $copy -Force
  }
} finally {
  $word.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
