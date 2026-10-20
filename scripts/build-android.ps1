param(
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$AndroidSdk = $env:ANDROID_HOME,
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
if (-not $JavaHome -or -not (Test-Path -LiteralPath "$JavaHome\bin\java.exe")) {
    throw 'Set JAVA_HOME or pass -JavaHome pointing to JDK 21.'
}
if (-not $AndroidSdk -or -not (Test-Path -LiteralPath "$AndroidSdk\platforms\android-36\android.jar")) {
    throw 'Set ANDROID_HOME or pass -AndroidSdk with Android platform 36 installed.'
}
$oldJavaHome = $env:JAVA_HOME
$oldAndroidHome = $env:ANDROID_HOME
$repoRoot = Split-Path $PSScriptRoot -Parent
try {
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $AndroidSdk
    Push-Location $repoRoot
    try {
        & npm.cmd run android:sync
        if ($LASTEXITCODE -ne 0) { throw 'Web build or Capacitor sync failed.' }
        & "$repoRoot\android\gradlew.bat" -p "$repoRoot\android" --no-daemon assembleDebug lintDebug
        if ($LASTEXITCODE -ne 0) { throw 'Android build or lint failed.' }
        $apk = Join-Path $repoRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
        if ($OutputDirectory) {
            New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
            $destination = Join-Path $OutputDirectory 'Afterblock.apk'
            Copy-Item -LiteralPath $apk -Destination $destination
            Get-Item -LiteralPath $destination
        } else { Get-Item -LiteralPath $apk }
    } finally { Pop-Location }
} finally {
    $env:JAVA_HOME = $oldJavaHome
    $env:ANDROID_HOME = $oldAndroidHome
}
