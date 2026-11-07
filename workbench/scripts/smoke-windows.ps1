$ErrorActionPreference = 'Stop'
$executable = (Resolve-Path (Join-Path $PSScriptRoot '../dist/win-unpacked/Orbit Agent.exe')).Path
$profile = Join-Path $env:RUNNER_TEMP ('orbit-smoke-' + [guid]::NewGuid())
$original = $env:APPDATA
$process = $null
try {
    New-Item -Path $profile -ItemType Directory -Force | Out-Null
    $env:APPDATA = $profile
    $stdout = Join-Path $profile 'stdout.log'
    $stderr = Join-Path $profile 'stderr.log'
    $process = Start-Process -FilePath $executable -ArgumentList '--orbit-self-test' -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    if (-not $process.WaitForExit(120000)) { throw 'Orbit native tool check timed out.' }
    $process.WaitForExit()
    $report = Get-Content $stdout -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if ($process.ExitCode -ne 0 -or $report -notlike '*ORBIT_NATIVE_SELF_TEST_OK*' -or $report -notlike '*ORBIT_NATIVE_TOOLS_OK*') {
        $detail = Get-Content $stderr -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        throw "Orbit native check failed: $report $detail"
    }
    Write-Host 'Packaged preload, safe defaults, real files/PowerShell, bundled Git/gh, real managed Chrome, offline Arena delegation and MCP imports passed.'
} finally {
    if ($process -and -not $process.HasExited) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
    $env:APPDATA = $original
    Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
}
