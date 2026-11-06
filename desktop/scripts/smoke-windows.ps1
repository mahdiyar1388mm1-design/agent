$ErrorActionPreference = 'Stop'

# A new profile, with DNS intentionally unavailable: verify native startup and
# offline handling without an account, cookies or a request to the live service.
$executable = Join-Path $PSScriptRoot '../dist/win-unpacked/Arena Desktop.exe'
$profile = Join-Path $env:RUNNER_TEMP ('arena-desktop-smoke-' + [guid]::NewGuid())
$originalAppData = $env:APPDATA
$process = $null

try {
    New-Item -Path $profile -ItemType Directory -Force | Out-Null
    $env:APPDATA = $profile
    $stdout = Join-Path $profile 'bridge-check.stdout'
    $stderr = Join-Path $profile 'bridge-check.stderr'
    $process = Start-Process -FilePath (Resolve-Path $executable).Path `
        -ArgumentList '--arena-self-test' -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr -PassThru
    if (-not $process.WaitForExit(60000)) {
        throw 'Packaged preload/terminal IPC diagnostic timed out.'
    }
    $process.WaitForExit()
    $report = Get-Content $stdout -Raw -ErrorAction SilentlyContinue
    if ($process.ExitCode -ne 0 -or $report -notlike '*ARENA_DESKTOP_BRIDGE_SELF_TEST_OK*') {
        $detail = Get-Content $stderr -Raw -ErrorAction SilentlyContinue
        throw "Packaged preload/terminal IPC diagnostic failed: $report $detail"
    }
    foreach ($marker in @('ARENA_DESKTOP_BUNDLED_TOOLS_SELF_TEST_OK', 'ARENA_DESKTOP_COMPOSER_SELF_TEST_OK textarea', 'ARENA_DESKTOP_COMPOSER_SELF_TEST_OK rich')) {
        if ($report -notlike "*$marker*") { throw "Missing native compatibility marker: $marker" }
    }
    Write-Host 'Packaged IPC, bundled Git/gh and native textarea/rich-editor message checks passed; terminal stays disabled.'
    $process = Start-Process -FilePath (Resolve-Path $executable).Path `
        -ArgumentList '--host-resolver-rules="MAP * ~NOTFOUND"' -PassThru
    if ($process.WaitForExit(12000)) {
        throw "Arena Desktop exited during startup (exit code $($process.ExitCode))."
    }
    $process.Refresh()
    if ($process.MainWindowHandle -eq [IntPtr]::Zero) {
        throw 'Arena Desktop did not create a visible native main window.'
    }
    if ($process.MainWindowTitle -notlike '*Arena Desktop*') {
        throw "Unexpected main window title: $($process.MainWindowTitle)"
    }
    Write-Host "Windows offline startup passed: $($process.MainWindowTitle)"
}
finally {
    if ($process -and -not $process.HasExited) {
        & taskkill.exe /PID $process.Id /T /F | Out-Null
    }
    $env:APPDATA = $originalAppData
    Remove-Item -Path $profile -Recurse -Force -ErrorAction SilentlyContinue
}
