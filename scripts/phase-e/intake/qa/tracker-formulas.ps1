# Engineering Phase E3 QA: prove the onboarding tracker's formulas in real Excel (on a copy). Enters a small batch:
# hands-on minutes, a customer wait, a tag-manufacturing wait, the batch dates and one exception, then reads the summary.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase-e\intake\qa\tracker-formulas.ps1 -Tracker <xlsx>
#
# Expected: hands-on 75 (preflight 30, research 45; the other batch's QA excluded), customer wait 30 h, tag
# manufacturing 7 days, elapsed business days 3 (Mon 2 Nov to Thu 5 Nov 2026), within target Yes, first ID EX-001.
param([Parameter(Mandatory = $true)][string]$Tracker)
$ErrorActionPreference = 'Stop'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.AutomationSecurity = 3
$copy = Join-Path $env:TEMP ('e3-tracker-' + [IO.Path]::GetFileName($Tracker))
Copy-Item -LiteralPath (Resolve-Path $Tracker).Path -Destination $copy -Force
try {
  $wb = $excel.Workbooks.Open($copy)
  $tt = $wb.Worksheets.Item('TOUCH TIME')
  $rows = @(@('2026-11-02', 'B1', 'Preflight', 30), @('2026-11-03', 'B1', 'Research', 45), @('2026-11-03', 'B2', 'QA', 10))
  $oa = { param([string]$s) [double]([datetime]::ParseExact($s, $(if ($s.Length -gt 10) { 'yyyy-MM-dd HH:mm' } else { 'yyyy-MM-dd' }), $null).ToOADate()) }
  for ($i = 0; $i -lt $rows.Count; $i++) {
    $r = 3 + $i
    $tt.Range("A$r").Value2 = & $oa $rows[$i][0]
    $tt.Range("B$r").Value2 = [string]$rows[$i][1]
    $tt.Range("C$r").Value2 = [string]$rows[$i][2]
    $tt.Range("D$r").Value2 = [double]$rows[$i][3]
  }
  $waits = @(@('B1', 'Customer', '2026-11-02 09:00', '2026-11-03 15:00'), @('B1', 'Tag maker', '2026-11-03 08:00', '2026-11-10 08:00'))
  for ($i = 0; $i -lt $waits.Count; $i++) {
    $r = 3 + $i
    $tt.Range("G$r").Value2 = [string]$waits[$i][0]
    $tt.Range("H$r").Value2 = [string]$waits[$i][1]
    $tt.Range("I$r").Value2 = & $oa $waits[$i][2]
    $tt.Range("J$r").Value2 = & $oa $waits[$i][3]
  }
  $tt.Range('N2').Value2 = 'B1'
  $tt.Range('N3').Value2 = & $oa '2026-11-02'
  $tt.Range('N4').Value2 = & $oa '2026-11-05'
  $ex = $wb.Worksheets.Item('EXCEPTIONS')
  $ex.Range('C2').Value2 = 'B1'
  $excel.CalculateFull()
  foreach ($r in 2..18) { "   {0}: {1}" -f ([string]$tt.Range("M$r").Text).Trim(), [string]$tt.Range("N$r").Text }
  "   wait hours: " + $tt.Range('K3').Text + " / " + $tt.Range('K4').Text
  "   first exception ID: " + $ex.Range('A2').Text + "; empty row ID: '" + $ex.Range('A3').Text + "'"
  $wb.Close($false)
} catch {
  "error at line $($_.InvocationInfo.ScriptLineNumber): $($_.Exception.Message)"
} finally {
  $excel.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  Remove-Item -LiteralPath $copy -Force -ErrorAction SilentlyContinue
}
