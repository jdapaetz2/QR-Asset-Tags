# Engineering Phase E2A: render selected PDF pages to PNG with the Windows.Data.Pdf API built into Windows 10/11
# (no extra software). Used for the private review gallery's manual-page images, which stay in the source vault
# outside Git.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase-e\packs\render-pdf-pages.ps1 `
#     -Pdf <file.pdf> -OutDir <vault>\renders -PageList "1,6,7" [-Width 1100]
#
# Output names: <pdf base name>-pNNN.png (PDF page numbers, not printed page numbers).
param(
  [Parameter(Mandatory = $true)][string]$Pdf,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [Parameter(Mandatory = $true)][string]$PageList,
  [int]$Width = 1100
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
})[0]
function Await($op, [Type]$type) { $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
function AwaitAction($op) { $t = $asTaskAction.Invoke($null, @($op)); $t.Wait(-1) | Out-Null }
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]

New-Item -ItemType Directory -Force $OutDir | Out-Null
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Pdf).Path)) ([Windows.Storage.StorageFile])
$doc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
"pages in document: $($doc.PageCount)"
$base = [IO.Path]::GetFileNameWithoutExtension($Pdf)
$pages = $PageList -split '[,; ]+' | Where-Object { $_ } | ForEach-Object { [int]$_ }
foreach ($n in $pages) {
  if ($n -lt 1 -or $n -gt $doc.PageCount) { "skip page $n"; continue }
  $page = $doc.GetPage([uint32]($n - 1))
  $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
  $opts.DestinationWidth = [uint32]$Width
  $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  AwaitAction ($page.RenderToStreamAsync($stream, $opts))
  $out = Join-Path $OutDir ("{0}-p{1:D3}.png" -f $base, $n)
  $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream.GetInputStreamAt(0))
  $fs = [IO.File]::Create($out)
  $net.CopyTo($fs)
  $fs.Close(); $net.Dispose(); $stream.Dispose(); $page.Dispose()
  "rendered $out"
}
