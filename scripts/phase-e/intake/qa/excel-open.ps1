# Engineering Phase E3 QA: open workbooks in real Excel (read-only copies), report whether Excel had to repair them,
# and list each sheet's protection, frozen panes and data-validation count. Windows + Microsoft Excel only.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase-e\intake\qa\excel-open.ps1 -Workbook a.xlsx,b.xlsx
#
# Excel logs repairs as %TEMP%\error*.xml; a new log after opening a file means Excel changed it to open it.
#   Add -PdfDir <folder> to also export each workbook's first rows per tab (-Rows, default 45) to PDF for the visual review.
param([Parameter(Mandatory = $true)][string[]]$Workbook, [string]$PdfDir = '', [int]$Rows = 45)
$ErrorActionPreference = 'Stop'
# Excel saves relative paths against its own folder, so hand it a full path.
if ($PdfDir) { $PdfDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PdfDir) }
# -File passes a list as one comma-joined string; split it (file names never contain commas here).
$Workbook = @($Workbook | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.AutomationSecurity = 3   # msoAutomationSecurityForceDisable: never run macros
try {
  foreach ($file in $Workbook) {
    $src = (Resolve-Path $file).Path
    $copy = Join-Path $env:TEMP ("e3-open-" + [IO.Path]::GetFileName($src))
    Copy-Item -LiteralPath $src -Destination $copy -Force
    $before = @(Get-ChildItem -Path $env:TEMP -Filter 'error*.xml' -ErrorAction SilentlyContinue | ForEach-Object FullName)
    $wb = $excel.Workbooks.Open($copy, 0, [bool](-not $PdfDir))
    $after = @(Get-ChildItem -Path $env:TEMP -Filter 'error*.xml' -ErrorAction SilentlyContinue | ForEach-Object FullName)
    $new = @($after | Where-Object { $before -notcontains $_ })
    "== $([IO.Path]::GetFileName($src)): opened; repair logs: $($new.Count)"
    foreach ($log in $new) { "   repair log: $log"; Get-Content -LiteralPath $log -TotalCount 40 | ForEach-Object { "     $_" } }
    foreach ($ws in $wb.Worksheets) {
      $ws.Activate()
      $win = $excel.ActiveWindow
      $dv = 0
      try { $dv = $ws.Cells.SpecialCells(-4174).Areas.Count } catch { $dv = 0 }   # xlCellTypeAllValidation
      $p = $ws.Protection
      "   {0,-18} visible={1} protected={2} frozen={3} splitRow={4} splitCol={5} validationAreas={6} allowInsertRows={7} allowSort={8}" -f $ws.Name, $ws.Visible, $ws.ProtectContents, $win.FreezePanes, $win.SplitRow, $win.SplitColumn, $dv, $p.AllowInsertingRows, $p.AllowSorting
      if ($PdfDir) {
        if ($ws.ProtectContents) { $ws.Unprotect() }
        $last = $ws.UsedRange.Columns.Count + $ws.UsedRange.Column - 1
        $ws.PageSetup.PrintArea = '$A$1:' + $ws.Cells.Item($Rows, [Math]::Max(1, $last)).Address()
        $ws.PageSetup.Orientation = 2
        $ws.PageSetup.Zoom = $false
        $ws.PageSetup.FitToPagesWide = 1
        $ws.PageSetup.FitToPagesTall = 1
      }
    }
    if ($PdfDir) {
      New-Item -ItemType Directory -Force $PdfDir | Out-Null
      $pdf = Join-Path $PdfDir ([IO.Path]::GetFileNameWithoutExtension($src) + '.pdf')
      $wb.ExportAsFixedFormat(0, $pdf)
      "   exported $pdf"
    }
    $wb.Close($false)
    Remove-Item -LiteralPath $copy -Force
  }
} finally {
  $excel.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
