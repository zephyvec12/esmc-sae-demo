Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$workspace = "E:\ESMC\ppt_handoff_20260906"
$bundleStage = Join-Path $workspace "_source_bundle_stage"
$zipPath = Join-Path $workspace "output\source_bundle.zip"

if (Test-Path -LiteralPath $bundleStage) {
  throw "Refusing to reuse existing staging path: $bundleStage"
}
if (Test-Path -LiteralPath $zipPath) {
  throw "Refusing to overwrite existing archive: $zipPath"
}

New-Item -ItemType Directory -Path $bundleStage | Out-Null

function Copy-Entry {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$RelativeDestination
  )
  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Required source is missing: $Source"
  }
  $destination = Join-Path $bundleStage $RelativeDestination
  $parent = Split-Path -Parent $destination
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  Copy-Item -LiteralPath $Source -Destination $destination -Recurse
}

@(
  @{ Source = (Join-Path $workspace "README.md"); Relative = "README.md" },
  @{ Source = (Join-Path $workspace "CONTENT_OUTLINE.md"); Relative = "CONTENT_OUTLINE.md" },
  @{ Source = (Join-Path $workspace "SOURCE_LEDGER.md"); Relative = "SOURCE_LEDGER.md" },
  @{ Source = (Join-Path $workspace "design_spec.md"); Relative = "design_spec.md" },
  @{ Source = (Join-Path $workspace "spec_lock.md"); Relative = "spec_lock.md" },
  @{ Source = (Join-Path $workspace "evidence.json"); Relative = "evidence.json" },
  @{ Source = (Join-Path $workspace "normalized_slide_data.json"); Relative = "normalized_slide_data.json" },
  @{ Source = (Join-Path $workspace "EVIDENCE_AUDIT.md"); Relative = "EVIDENCE_AUDIT.md" },
  @{ Source = (Join-Path $workspace "notes.json"); Relative = "notes.json" },
  @{ Source = (Join-Path $workspace "notes"); Relative = "notes" },
  @{ Source = (Join-Path $workspace "sources\run_20260905T135554Z_smoke_gfp"); Relative = "sources\run_20260905T135554Z_smoke_gfp" },
  @{ Source = (Join-Path $workspace "sources\styleguide"); Relative = "sources\styleguide" },
  @{ Source = (Join-Path $workspace "sources\audit"); Relative = "sources\audit" },
  @{ Source = (Join-Path $workspace "build\inspect_reference_decks.mjs"); Relative = "build\inspect_reference_decks.mjs" },
  @{ Source = (Join-Path $workspace "build\build_samples_061023.mjs"); Relative = "build\build_samples_061023.mjs" },
  @{ Source = (Join-Path $workspace "build\build_full_deck.mjs"); Relative = "build\build_full_deck.mjs" },
  @{ Source = (Join-Path $workspace "build\finalize_full_deck.mjs"); Relative = "build\finalize_full_deck.mjs" },
  @{ Source = (Join-Path $workspace "build\audit_pptx_content.ps1"); Relative = "build\audit_pptx_content.ps1" },
  @{ Source = (Join-Path $workspace "build\verify_final_import_render.mjs"); Relative = "build\verify_final_import_render.mjs" },
  @{ Source = (Join-Path $workspace "build\compare_render_pixels.mjs"); Relative = "build\compare_render_pixels.mjs" },
  @{ Source = (Join-Path $workspace "build\final_render_pixel_comparison.json"); Relative = "build\final_render_pixel_comparison.json" },
  @{ Source = (Join-Path $workspace "build\package_source_bundle.ps1"); Relative = "build\package_source_bundle.ps1" },
  @{ Source = (Join-Path $workspace "output\quality_report.md"); Relative = "output\quality_report.md" },
  @{ Source = (Join-Path $workspace "output\ESMC_6B_SAE_GFP_20260906_content_audit.json"); Relative = "output\ESMC_6B_SAE_GFP_20260906_content_audit.json" },
  @{ Source = (Join-Path $workspace ".codex-finalizer\ESMC_6B_SAE_GFP_20260906.validation.json"); Relative = "finalization\ESMC_6B_SAE_GFP_20260906.validation.json" }
) | ForEach-Object { Copy-Entry -Source $_.Source -RelativeDestination $_.Relative }

Compress-Archive -Path (Join-Path $bundleStage "*") -DestinationPath $zipPath -CompressionLevel Optimal
$entries = Get-ChildItem -LiteralPath $bundleStage -Recurse -File
$result = [PSCustomObject]@{
  archive = $zipPath
  archiveBytes = (Get-Item -LiteralPath $zipPath).Length
  stagedFileCount = $entries.Count
  stagedBytes = ($entries | Measure-Object -Property Length -Sum).Sum
}
$result | ConvertTo-Json -Compress
