# Engineering Phase E3 QA (kit 2.0): drive the setup workbooks and the customer's list template in real Microsoft
# Excel (always on copies) and report.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase-e\intake\qa\excel-checks.ps1 `
#     -Blank <setup workbook.xlsx> -Example <example.xlsx> -ListTemplate <equipment-list-template.xlsx> `
#     -FleetCsv <fleet.csv> -OutDir <qa folder>
#
#  1. Opens each workbook read-only and reports Excel repair logs (%TEMP%\error*.xml) and the tab order.
#  2. Reads the dropdown type and source of key input cells, and the CALL SHEET's date cell.
#  3. Example: compares every ASSETS and MODELS Check result Excel calculates with the value stored in the file, and
#     reads the CALL SHEET's dates back as Excel shows them.
#  4. Blank: types test codes into a protected copy (leading zero, a duplicate in another case, a number code, codes
#     with * and ?) and reads the Check column; confirms Review > Unprotect Sheet works with no password; types a
#     date and minutes into the CALL SHEET.
#  5. Paste test: copies codes from the fleet CSV opened the usual way (Excel drops leading zeros) and opened as text,
#     pastes them into the protected ASSETS tab, and reports the values and whether the pasted cells became locked.
#  6. List template: types a row the way a customer would and reads it back (zeros kept), and shows the column prompt.
#  7. Exports each workbook to PDF for the visual review: the CALL SHEET with its own print area (one page), the other
#     tabs' first rows.
# Excel only; nothing here edits the source files.
param(
  [Parameter(Mandatory = $true)][string]$Blank,
  [Parameter(Mandatory = $true)][string]$Example,
  [Parameter(Mandatory = $true)][string]$ListTemplate,
  [Parameter(Mandatory = $true)][string]$FleetCsv,
  [Parameter(Mandatory = $true)][string]$OutDir
)
$ErrorActionPreference = 'Stop'
$OutDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir)
New-Item -ItemType Directory -Force $OutDir | Out-Null
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.AutomationSecurity = 3

function Copy-Temp([string]$path, [string]$tag) {
  $copy = Join-Path $env:TEMP ("e3v2-$tag-" + [IO.Path]::GetFileName($path))
  Copy-Item -LiteralPath (Resolve-Path $path).Path -Destination $copy -Force
  return $copy
}
function Repair-Logs { @(Get-ChildItem -Path $env:TEMP -Filter 'error*.xml' -ErrorAction SilentlyContinue | ForEach-Object FullName) }
function Show-Validation($ws, [string]$addr) {
  try {
    $v = $ws.Range($addr).Validation
    "   {0}!{1}: type={2} source={3} alertStyle={4} showError={5}" -f $ws.Name, $addr, $v.Type, $v.Formula1, $v.AlertStyle, $v.ShowError
  } catch { "   {0}!{1}: no validation" -f $ws.Name, $addr }
}
function Find-CallRow($ws, [string]$label) { (1..80 | Where-Object { $ws.Cells.Item($_, 2).Text -eq $label } | Select-Object -First 1) }

try {
  # ---- 1-3: open, validations, example formulas
  foreach ($pair in @(@($Blank, 'blank'), @($Example, 'example'))) {
    $copy = Copy-Temp $pair[0] $pair[1]
    $before = Repair-Logs
    $wb = $excel.Workbooks.Open($copy, 0, $true)
    $new = @(Repair-Logs | Where-Object { $before -notcontains $_ })
    "== $($pair[1]): opened, repair logs: $($new.Count)"
    "   tab order: " + (($wb.Worksheets | ForEach-Object { $_.Name }) -join ' | ')
    $assets = $wb.Worksheets.Item('ASSETS')
    $models = $wb.Worksheets.Item('MODELS')
    $call = $wb.Worksheets.Item('CALL SHEET')
    $files = $wb.Worksheets.Item('FILES & NOTES')
    foreach ($a in 'A6', 'C6', 'D6', 'E6', 'F6', 'G6') { Show-Validation $assets $a }
    foreach ($a in 'D6', 'E6', 'H6', 'L6') { Show-Validation $models $a }
    $dateRow = Find-CallRow $call 'Everything in (list and call answers)'
    $minutesRow = Find-CallRow $call 'Hands-on minutes (Mulemark)'
    Show-Validation $call "C$dateRow"
    "   CALL SHEET print area: " + $call.PageSetup.PrintArea + "; fit " + $call.PageSetup.FitToPagesWide + " wide x " + $call.PageSetup.FitToPagesTall + " tall; landscape=" + ($call.PageSetup.Orientation -eq 2)
    foreach ($a in 'B6', 'D6', 'E6') { Show-Validation $files $a }
    if ($pair[1] -eq 'example') {
      $excel.CalculateFull()
      $counts = @{}
      for ($r = 6; $r -le 60; $r++) {
        $t = $assets.Cells.Item($r, 13).Text
        if ($t -ne '') { if ($counts.ContainsKey($t)) { $counts[$t]++ } else { $counts[$t] = 1 } }
      }
      "   ASSETS Check results (Excel): " + (($counts.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name) x$($_.Value)" }) -join '; ')
      "   MODELS Check results (Excel): " + ((6..9 | ForEach-Object { $models.Cells.Item($_, 17).Text }) -join ' | ')
      "   Leading zeros kept: A13=" + $assets.Range('A13').Text + " A52=" + $assets.Range('A52').Text
      "   CALL SHEET dates and time as Excel shows them: everything in=" + $call.Range("C$dateRow").Text + "; minutes=" + $call.Range("C$minutesRow").Text
    }
    $wb.Close($false)
    Remove-Item -LiteralPath $copy -Force
  }

  # ---- 4: typed entries on the protected blank
  $copy = Copy-Temp $Blank 'typed'
  $wb = $excel.Workbooks.Open($copy, 0, $false)
  $ws = $wb.Worksheets.Item('ASSETS')
  "== typed entries (protected blank copy)"
  $entries = @(
    @(6, '00412', 'Trailer', 'Not sure'),
    @(7, 'ab-1', 'Trailer', 'Big Tex 35SA'),
    @(8, 'AB-1', 'Trailer', 'Not sure'),
    @(10, 'A*1', 'Trailer', 'Not sure'),
    @(11, 'AB1', 'Trailer', 'Not sure'),
    @(12, 'X?2', 'Trailer', 'Not sure'),
    @(13, 'XY2', 'Trailer', 'Not sure')
  )
  foreach ($e in $entries) { $ws.Cells.Item($e[0], 1).Value2 = $e[1]; $ws.Cells.Item($e[0], 2).Value2 = $e[2]; $ws.Cells.Item($e[0], 3).Value2 = $e[3] }
  $call = $wb.Worksheets.Item('CALL SHEET')
  $dateRow = Find-CallRow $call 'Everything in (list and call answers)'
  $minutesRow = Find-CallRow $call 'Hands-on minutes (Mulemark)'
  $call.Range("C$dateRow").Formula = '11/26/2026'
  $call.Range("C$minutesRow").Formula = '95'
  "   CALL SHEET typed while protected: date shows '" + $call.Range("C$dateRow").Text + "' (stored as a date: " + ($call.Range("C$dateRow").Value2 -is [double]) + "); minutes '" + $call.Range("C$minutesRow").Text + "'"
  # A number in the code column (as Excel stores a pasted numeric code).
  $ws.Unprotect()
  $ws.Range('A9').NumberFormat = 'General'
  $ws.Range('A9').Value2 = 412
  $ws.Range('B9').Value2 = 'Trailer'
  $ws.Range('C9').Value2 = 'Not sure'
  "   Unprotect with no password: ok (ProtectContents now $($ws.ProtectContents))"
  $excel.CalculateFull()
  foreach ($r in 6..13) { "   row {0}: code='{1}' check='{2}'" -f $r, $ws.Cells.Item($r, 1).Text, $ws.Cells.Item($r, 13).Text }
  $wb.Close($false)
  Remove-Item -LiteralPath $copy -Force

  # ---- 5: paste from a fleet export
  "== paste test"
  $copy = Copy-Temp $Blank 'paste'
  $wb = $excel.Workbooks.Open($copy, 0, $false)
  $ws = $wb.Worksheets.Item('ASSETS')
  $csvCopy = Copy-Temp $FleetCsv 'fleet'
  $plain = $excel.Workbooks.Open($csvCopy)
  $plain.Worksheets.Item(1).Range('A2:A4').Copy() | Out-Null
  $ws.Range('A20').PasteSpecial(-4104) | Out-Null   # xlPasteAll
  "   opened normally: pasted codes = " + ((20..22 | ForEach-Object { "'" + $ws.Cells.Item($_, 1).Text + "'" }) -join ', ') + "; pasted cells locked = " + $ws.Range('A20').Locked
  $trapped = $false
  try { $ws.Range('A20').Value2 = 'edit-after-paste' } catch { $trapped = $true }
  "   editing a pasted cell afterwards: " + $(if ($trapped) { 'BLOCKED (cell became locked)' } else { 'ok' })
  $plain.Close($false)
  $txtCopy = [IO.Path]::ChangeExtension($csvCopy, '.txt')
  Copy-Item -LiteralPath $csvCopy -Destination $txtCopy -Force
  $excel.Workbooks.OpenText($txtCopy, 65001, 1, 1, 1, $false, $false, $false, $true, $false, $false, $null, ([object[]]@(, ([object[]](1, 2)))))
  $text = $excel.ActiveWorkbook
  $text.Worksheets.Item(1).Range('A2:A4').Copy() | Out-Null
  $ws.Range('A30').PasteSpecial(-4163) | Out-Null   # xlPasteValues
  "   imported as text, pasted as values: codes = " + ((30..32 | ForEach-Object { "'" + $ws.Cells.Item($_, 1).Text + "'" }) -join ', ') + "; locked = " + $ws.Range('A30').Locked
  $text.Close($false)
  $wb.Close($false)
  Remove-Item -LiteralPath $copy, $csvCopy, $txtCopy -Force

  # ---- 6: the customer's list template, typed the way a customer would
  "== list template"
  $copy = Copy-Temp $ListTemplate 'list'
  $before = Repair-Logs
  $wb = $excel.Workbooks.Open($copy, 0, $false)
  $new = @(Repair-Logs | Where-Object { $before -notcontains $_ })
  $ws = $wb.Worksheets.Item(1)
  "   opened, repair logs: $($new.Count); sheets: " + (($wb.Worksheets | ForEach-Object { $_.Name }) -join ' | ') + "; protected: " + $ws.ProtectContents
  "   headers: " + ((1..6 | ForEach-Object { $ws.Cells.Item(1, $_).Text }) -join ' | ')
  "   prompt on A2: " + $ws.Range('A2').Validation.InputMessage
  $ws.Range('A2').Formula = '00412'
  $ws.Range('B2').Formula = 'Dump trailer 14 ft'
  $ws.Range('E2').Formula = '2022'
  "   typed 00412 shows '" + $ws.Range('A2').Text + "'; year shows '" + $ws.Range('E2').Text + "'"
  $wb.Close($false)
  Remove-Item -LiteralPath $copy -Force

  # ---- 7: PDFs for the visual review
  foreach ($pair in @(@($Blank, 'blank'), @($Example, 'example'))) {
    $copy = Copy-Temp $pair[0] "pdf-$($pair[1])"
    $wb = $excel.Workbooks.Open($copy, 0, $false)
    $areas = @{ 'ASSETS' = '$A$1:$M$34'; 'MODELS' = '$A$1:$Q$14'; 'FILES & NOTES' = '$A$1:$I$14'; 'LISTS' = '$A$1:$Z$22' }
    foreach ($ws in $wb.Worksheets) {
      $ws.Unprotect()
      if ($areas.ContainsKey($ws.Name)) { $ws.PageSetup.PrintArea = $areas[$ws.Name] }
    }
    $pdf = Join-Path $OutDir ("excel-" + $pair[1] + ".pdf")
    $wb.ExportAsFixedFormat(0, $pdf)
    "== exported $pdf"
    $wb.Close($false)
    Remove-Item -LiteralPath $copy -Force
  }
} finally {
  $excel.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
