$ErrorActionPreference = 'Stop'
function Run-Native([string]$Program, [string[]]$Arguments) {
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Program failed: $LASTEXITCODE" }
}
$Root = (Resolve-Path "$PSScriptRoot/../..").Path
$Source = Join-Path $env:RUNNER_TEMP 'reframe-whisper-source'
if (!$env:RUNNER_TEMP) { throw 'Run this preparation script in the Windows build workflow.' }
$Destination = Join-Path $Root 'build/windows/whisper'
New-Item -ItemType Directory -Force $Destination | Out-Null
Run-Native git @('clone', '--depth', '1', '--branch', 'v1.8.3', 'https://github.com/ggml-org/whisper.cpp.git', $Source)
# Static CRT, no external DLLs, no GPU or CPU instruction requirements beyond x64.
Run-Native cmake @('-S', $Source, '-B', "$Source/build", '-A', 'x64',
  '-DBUILD_SHARED_LIBS=OFF', '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded',
  '-DGGML_NATIVE=OFF', '-DGGML_AVX=OFF', '-DGGML_AVX2=OFF', '-DGGML_BMI2=OFF', '-DGGML_SSE42=OFF',
  '-DGGML_OPENMP=OFF', '-DGGML_BLAS=OFF', '-DGGML_CUDA=OFF', '-DGGML_VULKAN=OFF',
  '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_BUILD_SERVER=OFF')
Run-Native cmake @('--build', "$Source/build", '--config', 'Release', '--target', 'whisper-cli', '--parallel', '4')
Copy-Item "$Source/build/bin/Release/whisper-cli.exe" $Destination
Copy-Item "$Source/LICENSE" "$Destination/whisper-LICENSE.txt"
# Resolve a model revision once and verify the downloaded LFS content by SHA-256.
$Metadata = Invoke-RestMethod 'https://huggingface.co/api/models/ggerganov/whisper.cpp/revision/main?blobs=true'
$Model = $Metadata.siblings | Where-Object { $_.rfilename -eq 'ggml-small.bin' }
if (!$Model.lfs.sha256) { throw 'Missing model checksum' }
$ModelPath = Join-Path $Destination 'ggml-small.bin'
Invoke-WebRequest "https://huggingface.co/ggerganov/whisper.cpp/resolve/$($Metadata.sha)/ggml-small.bin" -OutFile "$ModelPath.download"
if ((Get-FileHash "$ModelPath.download" -Algorithm SHA256).Hash -ne $Model.lfs.sha256) { throw 'Model checksum mismatch' }
Move-Item -Force "$ModelPath.download" $ModelPath
@{ whisperVersion = 'v1.8.3'; whisperCommit = (& git -C $Source rev-parse HEAD); modelRevision = $Metadata.sha; modelSHA256 = $Model.lfs.sha256 } | ConvertTo-Json | Set-Content "$Destination/manifest.json"
Invoke-WebRequest 'https://raw.githubusercontent.com/openai/whisper/main/LICENSE' -OutFile "$Destination/model-LICENSE.txt"
New-Item -ItemType Directory -Force "$Root/.windows-smoke" | Out-Null
Copy-Item "$Source/samples/jfk.wav" "$Root/.windows-smoke/jfk.wav"
Run-Native "$Destination/whisper-cli.exe" @('--help')
