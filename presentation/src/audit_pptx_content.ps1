<#
.SYNOPSIS
Read-only factual/content audit for the 34-slide ESMC GFP deck.

.DESCRIPTION
Reads a PPTX as an Open XML ZIP package in memory. It never modifies the
presentation. The checks intentionally combine mechanical requirements
(slide/notes counts and prohibited phrases) with deck-specific scientific
guardrails from evidence.json.

.EXAMPLE
pwsh -File .\audit_pptx_content.ps1 -PptxPath ..\output\esmc_gfp_final.pptx \
  -ReportPath ..\output\esmc_gfp_content_audit.json
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$PptxPath,

    [ValidateRange(1, 200)]
    [int]$ExpectedSlideCount = 34,

    # Useful only for testing ZIP/notes parsing on the three-slide visual sample.
    [switch]$SkipScientificChecks,

    # Optional JSON destination. This is the only optional write; the PPTX stays read-only.
    [string]$ReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$script:findings = [System.Collections.Generic.List[object]]::new()
$script:slideTexts = @{}
$script:noteTexts = @{}
$script:slideChartParts = @{}

function Add-Finding {
    param(
        [ValidateSet('error', 'warning', 'info')]
        [string]$Severity,
        [string]$Code,
        [string]$Scope,
        [string]$Detail,
        [string]$Excerpt = ''
    )

    $script:findings.Add([pscustomobject][ordered]@{
            severity = $Severity
            code     = $Code
            scope    = $Scope
            detail   = $Detail
            excerpt  = $Excerpt
        })
}

function Get-ZipEntryText {
    param(
        [System.IO.Compression.ZipArchive]$Zip,
        [string]$EntryName
    )

    $entry = $Zip.GetEntry($EntryName)
    if ($null -eq $entry) {
        return $null
    }

    $stream = $entry.Open()
    try {
        $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8, $true)
        try {
            return $reader.ReadToEnd()
        }
        finally {
            $reader.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Get-PartRelationships {
    param([string]$XmlText)

    $relationships = @{}
    if ([string]::IsNullOrWhiteSpace($XmlText)) {
        return $relationships
    }

    [xml]$document = $XmlText
    foreach ($node in $document.DocumentElement.ChildNodes) {
        if ($node.LocalName -eq 'Relationship') {
            $relationships[$node.Id] = [pscustomobject]@{
                id     = [string]$node.Id
                type   = [string]$node.Type
                target = [string]$node.Target
            }
        }
    }
    return $relationships
}

function Resolve-PackageTarget {
    param(
        [string]$SourcePart,
        [string]$Target
    )

    # Open XML relationships use a target relative to the source part.
    $sourceUri = [Uri]::new("https://pptx.local/$SourcePart")
    return ([Uri]::new($sourceUri, $Target).AbsolutePath.TrimStart('/'))
}

function Get-RelationshipPartName {
    param([string]$PartName)

    $slash = $PartName.LastIndexOf('/')
    if ($slash -lt 0) {
        return "_rels/$PartName.rels"
    }
    $directory = $PartName.Substring(0, $slash)
    $fileName = $PartName.Substring($slash + 1)
    return "$directory/_rels/$fileName.rels"
}

function Get-DrawingText {
    param([string]$XmlText)

    if ([string]::IsNullOrWhiteSpace($XmlText)) {
        return ''
    }

    $document = [System.Xml.XmlDocument]::new()
    $document.LoadXml($XmlText)
    $ns = [System.Xml.XmlNamespaceManager]::new($document.NameTable)
    $ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')

    $parts = [System.Collections.Generic.List[string]]::new()
    foreach ($node in $document.SelectNodes('//a:t', $ns)) {
        $value = $node.InnerText.Trim()
        if ($value.Length -gt 0) {
            $parts.Add($value)
        }
    }
    return ($parts -join ' ')
}

function Get-ScopeText {
    param(
        [int]$SlideNumber,
        [switch]$IncludeNotes
    )

    $slideText = if ($script:slideTexts.ContainsKey($SlideNumber)) { [string]$script:slideTexts[$SlideNumber] } else { '' }
    if ($IncludeNotes -and $script:noteTexts.ContainsKey($SlideNumber)) {
        return "$slideText $($script:noteTexts[$SlideNumber])"
    }
    return $slideText
}

function Get-Excerpt {
    param(
        [string]$Text,
        [int]$Index,
        [int]$Length
    )

    if ([string]::IsNullOrEmpty($Text)) {
        return ''
    }
    $start = [Math]::Max(0, $Index - 48)
    $take = [Math]::Min($Text.Length - $start, $Length + 96)
    return (($Text.Substring($start, $take) -replace '\s+', ' ').Trim())
}

function Require-Tokens {
    param(
        [int]$SlideNumber,
        [string[]]$Tokens,
        [string]$Code,
        [string]$Requirement,
        [switch]$IncludeNotes
    )

    $text = Get-ScopeText -SlideNumber $SlideNumber -IncludeNotes:$IncludeNotes
    if ([string]::IsNullOrWhiteSpace($text)) {
        Add-Finding -Severity 'error' -Code $Code -Scope "P$('{0:d2}' -f $SlideNumber)" -Detail "无法读取此页文字，无法核对：$Requirement"
        return
    }

    $missing = @($Tokens | Where-Object { $text -notmatch [regex]::Escape($_) })
    if ($missing.Count -gt 0) {
        Add-Finding -Severity 'error' -Code $Code -Scope "P$('{0:d2}' -f $SlideNumber)" -Detail "$Requirement；缺少：$($missing -join ', ')"
    }
}

function Require-Regex {
    param(
        [int]$SlideNumber,
        [string]$Pattern,
        [string]$Code,
        [string]$Requirement,
        [switch]$IncludeNotes
    )

    $text = Get-ScopeText -SlideNumber $SlideNumber -IncludeNotes:$IncludeNotes
    if ($text -notmatch $Pattern) {
        Add-Finding -Severity 'error' -Code $Code -Scope "P$('{0:d2}' -f $SlideNumber)" -Detail $Requirement
    }
}

function Find-Pattern {
    param(
        [string]$Text,
        [string]$Pattern,
        [string]$Severity,
        [string]$Code,
        [string]$Scope,
        [string]$Detail,
        [string]$AllowedContext = ''
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return
    }

    $matches = [regex]::Matches($Text, $Pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    foreach ($match in $matches) {
        $excerpt = Get-Excerpt -Text $Text -Index $match.Index -Length $match.Length
        if ($AllowedContext.Length -gt 0 -and $excerpt -match $AllowedContext) {
            continue
        }
        Add-Finding -Severity $Severity -Code $Code -Scope $Scope -Detail $Detail -Excerpt $excerpt
    }
}

$resolvedPptx = (Resolve-Path -LiteralPath $PptxPath).Path
$zip = [System.IO.Compression.ZipFile]::OpenRead($resolvedPptx)
$slideTargets = [System.Collections.Generic.List[string]]::new()
$notePartNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

try {
    $presentationPart = 'ppt/presentation.xml'
    $presentationXmlText = Get-ZipEntryText -Zip $zip -EntryName $presentationPart
    if ($null -eq $presentationXmlText) {
        throw "PPTX 缺少 $presentationPart"
    }
    [xml]$presentationXml = $presentationXmlText
    $presentationNs = [System.Xml.XmlNamespaceManager]::new($presentationXml.NameTable)
    $presentationNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $relationshipNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

    $presentationRels = Get-PartRelationships -XmlText (Get-ZipEntryText -Zip $zip -EntryName (Get-RelationshipPartName $presentationPart))
    $slideIdNodes = $presentationXml.SelectNodes('/p:presentation/p:sldIdLst/p:sldId', $presentationNs)
    foreach ($slideIdNode in $slideIdNodes) {
        $relationshipId = $slideIdNode.GetAttribute('id', $relationshipNs)
        if (-not $presentationRels.ContainsKey($relationshipId)) {
            Add-Finding -Severity 'error' -Code 'PPTX_SLIDE_RELATIONSHIP_MISSING' -Scope 'package' -Detail "presentation.xml 未解析到 $relationshipId"
            continue
        }
        $partName = Resolve-PackageTarget -SourcePart $presentationPart -Target $presentationRels[$relationshipId].target
        if ($null -eq $zip.GetEntry($partName)) {
            Add-Finding -Severity 'error' -Code 'PPTX_SLIDE_PART_MISSING' -Scope 'package' -Detail "关系指向但找不到 $partName"
            continue
        }
        $slideTargets.Add($partName)
    }

    for ($index = 0; $index -lt $slideTargets.Count; $index++) {
        $slideNumber = $index + 1
        $slidePart = $slideTargets[$index]
        $slideXmlText = Get-ZipEntryText -Zip $zip -EntryName $slidePart
        $script:slideTexts[$slideNumber] = Get-DrawingText -XmlText $slideXmlText
        if ([string]::IsNullOrWhiteSpace($script:slideTexts[$slideNumber])) {
            Add-Finding -Severity 'warning' -Code 'SLIDE_TEXT_EMPTY' -Scope "P$('{0:d2}' -f $slideNumber)" -Detail '未找到 a:t 文字节点；请确认不是意外空白页。'
        }

        $slideRelsPart = Get-RelationshipPartName $slidePart
        $slideRels = Get-PartRelationships -XmlText (Get-ZipEntryText -Zip $zip -EntryName $slideRelsPart)
        $chartParts = [System.Collections.Generic.List[object]]::new()
        foreach ($chartRelationship in @($slideRels.Values | Where-Object { $_.type -match '/chart$' })) {
            $chartPart = Resolve-PackageTarget -SourcePart $slidePart -Target $chartRelationship.target
            $chartXmlText = Get-ZipEntryText -Zip $zip -EntryName $chartPart
            if ($null -eq $chartXmlText) {
                Add-Finding -Severity 'error' -Code 'CHART_PART_MISSING' -Scope "P$('{0:d2}' -f $slideNumber)" -Detail "关系指向但找不到 chart part：$chartPart"
                continue
            }
            $chartParts.Add([pscustomobject]@{ part = $chartPart; xml = $chartXmlText })
        }
        $script:slideChartParts[$slideNumber] = @($chartParts)
        $notesRelationship = @($slideRels.Values | Where-Object { $_.type -match '/notesSlide$' }) | Select-Object -First 1
        if ($null -eq $notesRelationship) {
            Add-Finding -Severity 'error' -Code 'NOTES_MISSING' -Scope "P$('{0:d2}' -f $slideNumber)" -Detail '此页没有 notesSlide 关系。'
            $script:noteTexts[$slideNumber] = ''
            continue
        }

        $notesPart = Resolve-PackageTarget -SourcePart $slidePart -Target $notesRelationship.target
        if ($null -eq $zip.GetEntry($notesPart)) {
            Add-Finding -Severity 'error' -Code 'NOTES_PART_MISSING' -Scope "P$('{0:d2}' -f $slideNumber)" -Detail "找不到 $notesPart"
            $script:noteTexts[$slideNumber] = ''
            continue
        }
        if (-not $notePartNames.Add($notesPart)) {
            Add-Finding -Severity 'error' -Code 'NOTES_PART_REUSED' -Scope "P$('{0:d2}' -f $slideNumber)" -Detail "多个页面关联同一 notes part：$notesPart"
        }
        $script:noteTexts[$slideNumber] = Get-DrawingText -XmlText (Get-ZipEntryText -Zip $zip -EntryName $notesPart)
        if ([string]::IsNullOrWhiteSpace($script:noteTexts[$slideNumber])) {
            Add-Finding -Severity 'warning' -Code 'NOTES_TEXT_EMPTY' -Scope "P$('{0:d2}' -f $slideNumber)" -Detail 'notesSlide 存在但未发现可读文字。'
        }
    }
}
finally {
    $zip.Dispose()
}

$slideCount = $slideTargets.Count
$notesCount = $notePartNames.Count
if ($slideCount -ne $ExpectedSlideCount) {
    Add-Finding -Severity 'error' -Code 'SLIDE_COUNT' -Scope 'deck' -Detail "实际 $slideCount 页，预期 $ExpectedSlideCount 页。"
}
if ($notesCount -ne $slideCount) {
    Add-Finding -Severity 'error' -Code 'NOTES_COUNT' -Scope 'deck' -Detail "实际 $notesCount 份唯一 Notes，对应 $slideCount 页。"
}

# The style guide forbids these exact Chinese contrast constructions everywhere,
# including Notes. They hide nuance in this deck and can also mask a false claim.
$bannedTerms = @('不是', '并非', '不等于', '≠', '并不')
foreach ($slideNumber in 1..$slideCount) {
    foreach ($entry in @(
            [pscustomobject]@{ scope = "P$('{0:d2}' -f $slideNumber) slide"; text = [string]$script:slideTexts[$slideNumber] },
            [pscustomobject]@{ scope = "P$('{0:d2}' -f $slideNumber) notes"; text = [string]$script:noteTexts[$slideNumber] }
        )) {
        foreach ($term in $bannedTerms) {
            Find-Pattern -Text $entry.text -Pattern ([regex]::Escape($term)) -Severity 'error' -Code 'BANNED_CHINESE_TERM' -Scope $entry.scope -Detail "命中禁用表达：$term"
        }
    }
}

if (-not $SkipScientificChecks -and $slideCount -ge 34) {
    # P21 must reproduce the full audited top ten, rather than a cherry-picked subset.
    $top10 = @(
        @{ site = 'M1'; score = '10.985' },
        @{ site = 'G24'; score = '3.423' },
        @{ site = 'K26'; score = '2.482' },
        @{ site = 'G20'; score = '2.323' },
        @{ site = 'G40'; score = '2.308' },
        @{ site = 'G91'; score = '1.883' },
        @{ site = 'K45'; score = '1.648' },
        @{ site = 'D173'; score = '1.417' },
        @{ site = 'L195'; score = '1.409' },
        @{ site = 'G174'; score = '1.232' }
    )
    $p21 = Get-ScopeText -SlideNumber 21
    $p21NaNCount = [regex]::Matches($p21, '\bNaN\b').Count
    if ($p21NaNCount -gt 0) {
        Add-Finding -Severity 'error' -Code 'P21_NUMERIC_SERIALIZATION_ERROR' -Scope 'P21' -Detail "Top10 表出现 $p21NaNCount 个 NaN；须从审计字段写入真实 margin、novelty 与 score。"
    }
    foreach ($candidate in $top10) {
        if ($p21 -notmatch [regex]::Escape($candidate.site) -or $p21 -notmatch [regex]::Escape($candidate.score)) {
            Add-Finding -Severity 'error' -Code 'P21_TOP10_MISMATCH' -Scope 'P21' -Detail "应显示 $($candidate.site) 与审计分数 $($candidate.score)（允许保留更多小数）。"
        }
    }

    # P23 is a rank comparison. All three values come from candidate_sites_all.csv.
    Require-Tokens -SlideNumber 23 -Tokens @('S65', 'Y66', 'G67', '225', '223', '211') -Code 'P23_SYG_RANK_MISMATCH' -Requirement 'SYG 三个位点与 rank S65=225、Y66=223、G67=211 必须完整出现'

    # P07 distinguishes inference/storage precision and mean-pool precision.
    Require-Tokens -SlideNumber 7 -Tokens @('238', '2560', 'BF16', 'FP16', 'FP32') -Code 'P07_PRECISION_MISSING' -Requirement 'H shape 与 BF16 计算、FP16 H 存储、FP32 protein mean 的精度边界必须可见'

    # P19 must preserve the clipping/MAD fallback result, not a generic robust-z diagram.
    Require-Tokens -SlideNumber 19 -Tokens @('28', '210') -Code 'P19_FALLBACK_MISMATCH' -Requirement '须说明原始 margin 正28、负210'
    Require-Regex -SlideNumber 19 -Pattern '0\.206(?:1997034|2)' -Code 'P19_FALLBACK_MISMATCH' -Requirement '须给出 clip 后 std fallback=0.2061997034（显示为0.2062亦可）'

    # P20 is a native line chart, so text extraction alone cannot tell whether
    # its 238 plotted values were accidentally serialized as NaN. Validate the
    # chart cache itself, including two audited anchor points.
    $p20Charts = if ($script:slideChartParts.ContainsKey(20)) { @($script:slideChartParts[20]) } else { @() }
    if ($p20Charts.Count -eq 0) {
        Add-Finding -Severity 'error' -Code 'P20_CHART_MISSING' -Scope 'P20' -Detail '须有包含238个综合分数的 native line chart。'
    }
    else {
        $p20ChartPassed = $false
        foreach ($chartPart in $p20Charts) {
            try {
                [xml]$chartDocument = $chartPart.xml
                $chartNs = [System.Xml.XmlNamespaceManager]::new($chartDocument.NameTable)
                $chartNs.AddNamespace('c', 'http://schemas.openxmlformats.org/drawingml/2006/chart')
                $lineSeries = @($chartDocument.SelectNodes('//c:lineChart/c:ser', $chartNs))
            }
            catch {
                Add-Finding -Severity 'error' -Code 'P20_CHART_XML_INVALID' -Scope 'P20' -Detail "无法解析 native chart XML：$($chartPart.part)"
                continue
            }
            if ($lineSeries.Count -eq 0) {
                Add-Finding -Severity 'error' -Code 'P20_CHART_SERIES_MISSING' -Scope 'P20' -Detail "chart part 没有 line series：$($chartPart.part)"
                continue
            }
            $series = $lineSeries[0]
            # Draft packages may carry inline numLit values; the finalizer may
            # materialize the same data into an embedded workbook and replace
            # them with numRef/numCache. Both are valid OOXML representations.
            $pointCountNode = $series.SelectSingleNode('./c:val/c:numLit/c:ptCount | ./c:val/c:numRef/c:numCache/c:ptCount', $chartNs)
            $points = @($series.SelectNodes('./c:val/c:numLit/c:pt | ./c:val/c:numRef/c:numCache/c:pt', $chartNs))
            $declaredCount = if ($null -eq $pointCountNode) { -1 } else { [int]$pointCountNode.GetAttribute('val') }
            if ($declaredCount -ne 238 -or $points.Count -ne 238) {
                Add-Finding -Severity 'error' -Code 'P20_CHART_POINT_COUNT_MISMATCH' -Scope 'P20' -Detail "native chart 应有238个值；声明=$declaredCount，实际=$($points.Count)。"
                continue
            }
            $values = @{}
            $invalidPointCount = 0
            foreach ($point in $points) {
                $indexText = $point.GetAttribute('idx')
                $valueNode = $point.SelectSingleNode('./c:v', $chartNs)
                $valueText = if ($null -eq $valueNode) { '' } else { $valueNode.InnerText.Trim() }
                try {
                    $value = [double]::Parse($valueText, [System.Globalization.CultureInfo]::InvariantCulture)
                    if ([double]::IsNaN($value) -or [double]::IsInfinity($value)) { throw 'nonfinite' }
                    $values[[int]$indexText] = $value
                }
                catch {
                    $invalidPointCount++
                }
            }
            if ($invalidPointCount -gt 0) {
                Add-Finding -Severity 'error' -Code 'P20_CHART_NONFINITE' -Scope 'P20' -Detail "native chart 有 $invalidPointCount / 238 个非有限或不可解析数值；不能绘制空白曲线。"
                continue
            }
            if (-not $values.ContainsKey(0) -or -not $values.ContainsKey(23) -or [Math]::Abs($values[0] - 10.985226822041271) -gt 0.000001 -or [Math]::Abs($values[23] - 3.422572687756945) -gt 0.000001) {
                Add-Finding -Severity 'error' -Code 'P20_CHART_ANCHOR_MISMATCH' -Scope 'P20' -Detail 'native chart 的 position1/M1 或 position24/G24 锚点与审计分数不一致。'
                continue
            }
            $p20ChartPassed = $true
        }
        if (-not $p20ChartPassed) {
            Add-Finding -Severity 'error' -Code 'P20_CHART_DATA_INVALID' -Scope 'P20' -Detail '未找到一条包含238个有限审计分数的 native line series。'
        }
    }

    # P24 needs the actual SAE normalization semantics. Include Notes because the
    # visual may deliberately keep this formula compact.
    Require-Tokens -SlideNumber 24 -Tokens @('2560', '16384', '64') -Code 'P24_SAE_DIM_OR_NORMALIZER_MISSING' -Requirement 'SAE 须给出 d=2560、K=16384、k=64' -IncludeNotes
    Require-Regex -SlideNumber 24 -Pattern '(?:均值.{0,32}标准差|μ.{0,32}σ|mean.{0,32}std)' -Code 'P24_SAE_DIM_OR_NORMALIZER_MISSING' -Requirement 'SAE 须说明逐表示 z-score 的均值/标准差（或已定义的 μ/σ）' -IncludeNotes
    Require-Regex -SlideNumber 24 -Pattern '(逐(?:条|个|表示)|每(?:条|个).{0,24}(?:表示|向量)|per[- ]?representation|dim\s*=\s*-1)' -Code 'P24_NORMALIZER_SCOPE_MISSING' -Requirement '须明确均值/标准差按每条 2560 维表示的末维计算，而非保存的层级均值/标准差' -IncludeNotes
    Require-Regex -SlideNumber 24 -Pattern '(?:N\s*[×xX]\s*16384|240\s*[×xX]\s*16384|238\s*[×xX]\s*16384)' -Code 'P24_SAE_RETURN_SHAPE_MISSING' -Requirement '须给出实际 SAE tensor 的 N×16384 布局，或说明本次240 token到238残基的筛选' -IncludeNotes
    Find-Pattern -Text (Get-ScopeText -SlideNumber 24 -IncludeNotes) -Pattern '(?:保存|预存|全局|层级|数据集).{0,32}(?:均值|标准差)|(?:均值|标准差).{0,32}(?:保存|预存|全局|层级|数据集)' -Severity 'error' -Code 'P24_FALSE_SAE_NORMALIZER' -Scope 'P24' -Detail '实现对每条表示按末维即时计算均值/标准差；不要写为保存的层级或数据集统计。'
    Find-Pattern -Text (Get-ScopeText -SlideNumber 24 -IncludeNotes) -Pattern '(?:编码器偏置|encoder\s*bias|b_enc|权重共享|tied\s*(?:weight|decoder|encoder))' -Severity 'warning' -Code 'P24_SAE_PARAMETER_REVIEW' -Scope 'P24' -Detail '请人工确认 SAE 参数措辞：实现为独立 W_enc/W_dec、无 b_enc、共享 b_dec 用于预编码中心化及解码。' -AllowedContext '(?:无\s*(?:b_enc|编码器偏置|encoder\s*bias)|没有.{0,12}(?:b_enc|编码器偏置|encoder\s*bias)|b_enc\s*未出现|W_enc.{0,36}W_dec.{0,24}独立)'
    foreach ($shapeSlide in @(15, 24)) {
        Find-Pattern -Text (Get-ScopeText -SlideNumber $shapeSlide -IncludeNotes) -Pattern 'B\s*[×xX]\s*T\s*[×xX]\s*16384' -Severity 'error' -Code 'SAE_FALSE_BATCH_TOKEN_LAYOUT' -Scope "P$('{0:d2}' -f $shapeSlide)" -Detail '本实现直接返回展平非padding token的 N×16384 稀疏 tensor；B×T×16384只能在明确标为概念性 reshape 时使用。' -AllowedContext '(?:概念|reshape|重塑|展平前)'
    }

    # P30 uses the audited 1EMA poly_seq_scheme mapping, never direct FASTA=label.
    Require-Regex -SlideNumber 30 -Pattern '(?:CRO.{0,100}65\s*(?:–|-|至)\s*67|65\s*(?:–|-|至)\s*67.{0,100}CRO)' -Code 'P30_CRO_COLLAPSE_MISSING' -Requirement '须明确 65–67 三个 FASTA 残基折叠为一个 CRO，不能声称三者各有独立结构坐标'
    Require-Regex -SlideNumber 30 -Pattern '(?:S65T.{0,24}Q80R|Q80R.{0,24}S65T)' -Code 'P30_VARIANT_CONTEXT_MISSING' -Requirement '须说明 1EMA 是 S65T/Q80R 变体；canonical 输入的 S65 与结构参照的变体残基不能混同' -IncludeNotes
    foreach ($mapping in @(
            @{ site = 'G91'; expected = @('89', '91') },
            @{ site = 'D173'; expected = @('171', '173') },
            @{ site = 'G174'; expected = @('172', '174') },
            @{ site = 'L195'; expected = @('193', '195') }
        )) {
        $p30 = Get-ScopeText -SlideNumber 30
        $pattern = [regex]::Escape($mapping.site) + '.{0,120}' + [regex]::Escape($mapping.expected[0]) + '.{0,120}' + [regex]::Escape($mapping.expected[1])
        if ($p30 -notmatch $pattern) {
            Add-Finding -Severity 'error' -Code 'P30_MAPPING_MISMATCH' -Scope 'P30' -Detail "应呈现 $($mapping.site) → label $($mapping.expected[0]) / author $($mapping.expected[1])。"
        }
    }
    foreach ($falseMapping in @(
            @{ site = 'G91'; badLabel = '91' },
            @{ site = 'D173'; badLabel = '173' },
            @{ site = 'G174'; badLabel = '174' },
            @{ site = 'L195'; badLabel = '195' }
        )) {
        # Require the wrong number to be syntactically attached to "label".
        # A correct row such as "G91 ... label89, author91" must not trip this.
        Find-Pattern -Text (Get-ScopeText -SlideNumber 30 -IncludeNotes) -Pattern ("{0}.{{0,100}}(?:label(?:_seq_id)?|标签)\s*(?:=|:|为|是)?\s*{1}(?!\d)" -f [regex]::Escape($falseMapping.site), $falseMapping.badLabel) -Severity 'error' -Code 'P30_FALSE_DIRECT_LABEL' -Scope 'P30' -Detail "检测到可能把 $($falseMapping.site) 直接当作 label_seq_id=$($falseMapping.badLabel) 的表述；须使用审计映射。"
    }

    # P31 catches accidental substitution of generic SAE descriptions for evidence.
    Require-Tokens -SlideNumber 31 -Tokens @('F627', '7.1875', 'F6579', '10.5625', 'F9237') -Code 'P31_CONTROL_FEATURE_MISMATCH' -Requirement 'SYG 控制位点的 feature ID 与 activation 必须来自审计表'
    Require-Regex -SlideNumber 31 -Pattern '6\.968(?:75|8)' -Code 'P31_CONTROL_FEATURE_MISMATCH' -Requirement 'F9237 activation 须为 6.96875（页面四舍五入为6.9688亦可）'
    Require-Regex -SlideNumber 31 -Pattern '(?:polymer\s*labels?\s*186\s*(?:–|-|至)\s*196|labels?\s*186\s*(?:–|-|至)\s*196)' -Code 'P31_L195_POLYMER_RANGE_MISMATCH' -Requirement 'L195 的当前 RCSB 未分配范围须写作 polymer labels 186–196（author/input 对应188–198）'
    Find-Pattern -Text (Get-ScopeText -SlideNumber 31 -IncludeNotes) -Pattern '(?:polymer\s*labels?\s*188\s*(?:–|-|至)\s*198|labels?\s*188\s*(?:–|-|至)\s*198)' -Severity 'error' -Code 'P31_L195_COORDINATE_SYSTEM_MIXUP' -Scope 'P31' -Detail '188–198 是 author/input 范围，不能标为 polymer labels；RCSB polymer-label feature 是186–196。'

    # These are content-risk scans. Warnings require a human factual read; they
    # do not reject scientifically cautious boundary statements.
    foreach ($slideNumber in 1..$slideCount) {
        $scope = "P$('{0:d2}' -f $slideNumber) slide+notes"
        $text = Get-ScopeText -SlideNumber $slideNumber -IncludeNotes
        Find-Pattern -Text $text -Pattern '(?:本次|当前(?:运行|分析)?|该运行|本地运行).{0,56}(?:训练|微调|反向传播|反传|参数更新|梯度更新)' -Severity 'warning' -Code 'TRAINING_INFERENCE_REVIEW' -Scope $scope -Detail '请确认这句话将历史预训练与本次冻结前向明确分开。' -AllowedContext '(?:未|没有|无|冻结|预训练|历史训练|只读|inference|前向)'
        Find-Pattern -Text $text -Pattern '(?:(?:Transformer\s*Engine|FlashAttention|flash-attn|xformers|SDPA|内核|kernel).{0,120}(?:导致|造成|归因|解释).{0,120}(?:色团|SYG|S65|Y66|G67|低分|低排名)|(?:色团|SYG|S65|Y66|G67|低分|低排名).{0,120}(?:由|因|归因).{0,120}(?:Transformer\s*Engine|FlashAttention|flash-attn|xformers|SDPA|内核|kernel))' -Severity 'error' -Code 'KERNEL_CAUSAL_ATTRIBUTION' -Scope $scope -Detail '不能将内核/后端警告归因于 SYG 低排名。' -AllowedContext '(?:不可|不能|勿|避免|尚未|未证明|缺少)'
        Find-Pattern -Text $text -Pattern '(?:(?:数值|推理|输出|模型).{0,20}(?:完全)?等价|(?:已证明|保证|确认).{0,36}等价)' -Severity 'error' -Code 'UNSUPPORTED_EQUIVALENCE_CLAIM' -Scope $scope -Detail '加载通过不能证明旧 checkpoint 与当前接口的数值/推理等价。' -AllowedContext '(?:待|未|尚|缺|不能|不可|校准任务|保留为)'
        Find-Pattern -Text $text -Pattern '(?:(?:rank|排名).{0,28}(?:概率|置信度)|(?:概率|置信度).{0,28}(?:rank|排名))' -Severity 'warning' -Code 'RANK_PROBABILITY_REVIEW' -Scope $scope -Detail '请确认 rank 仅为排序，未被称为概率或置信度。' -AllowedContext '(?:不作|不可|不能|并非|不是|未赋予|顺序指标)'
        Find-Pattern -Text $text -Pattern '(?:(?:激活值|activation|SAE 激活).{0,40}(?:置信度|概率|跨特征.{0,16}(?:可比|比较))|(?:(?:置信度|概率).{0,40}(?:激活值|activation|SAE 激活)))' -Severity 'warning' -Code 'SAE_ACTIVATION_CALIBRATION_REVIEW' -Scope $scope -Detail '请确认 raw SAE activation 未被解释为跨 feature 可比的置信度。' -AllowedContext '(?:不作|不可|不能|未作|避免|未校准|不把|没有跨)'
        Find-Pattern -Text $text -Pattern '(?:(?:色团|SYG|S65|Y66|G67).{0,60}(?:无功能|功能缺失|模型失败|性能.{0,12}(?:差|低)|未识别)|(?:低分|低排名).{0,60}(?:无功能|功能缺失|模型失败|性能))' -Severity 'warning' -Code 'BIOLOGICAL_OVERCLAIM_REVIEW' -Scope $scope -Detail '请确认低排名仅表述为本实现下的观察，不外推功能或模型固有性能。' -AllowedContext '(?:不能|不可|未能|不作|限制|边界)'
        Find-Pattern -Text $text -Pattern '(?:所有|全部).{0,24}(?:LayerNorm|层归一化|LN).{0,32}(?:无\s*bias|bias\s*=\s*False|无偏置|没有偏置)' -Severity 'error' -Code 'OVERBROAD_LAYERNORM_BIAS_CLAIM' -Scope $scope -Detail '线性投影可表述为bias=False；fallback QKV/FFN pre-LN含layer_norm_bias，不能概括为所有LayerNorm无偏置。'
    }
}

$errorCount = @($script:findings | Where-Object { $_.severity -eq 'error' }).Count
$warningCount = @($script:findings | Where-Object { $_.severity -eq 'warning' }).Count
$report = [ordered]@{
    audit_name           = 'esmc_gfp_pptx_xml_content_audit'
    pptx_path            = $resolvedPptx
    pptx_modified        = $false
    expected_slide_count = $ExpectedSlideCount
    slide_count          = $slideCount
    notes_count          = $notesCount
    scientific_checks    = -not $SkipScientificChecks
    error_count          = $errorCount
    warning_count        = $warningCount
    findings             = @($script:findings)
}
$json = $report | ConvertTo-Json -Depth 8

if (-not [string]::IsNullOrWhiteSpace($ReportPath)) {
    $reportDirectory = Split-Path -Parent $ReportPath
    if (-not [string]::IsNullOrWhiteSpace($reportDirectory) -and -not (Test-Path -LiteralPath $reportDirectory -PathType Container)) {
        throw "ReportPath 的目录不存在：$reportDirectory"
    }
    [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($ReportPath), $json, [System.Text.UTF8Encoding]::new($false))
}

Write-Output $json
if ($errorCount -gt 0) {
    exit 1
}
