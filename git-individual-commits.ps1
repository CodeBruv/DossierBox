# ============================================================
# Git Individual Commit Logger — SAFE VERSION
# ============================================================
# Creates one commit per eligible changed file.
#
# SAFETY:
# - Automatically detects the current branch.
# - Stages exactly ONE file per commit.
# - Handles modified, deleted, and untracked files correctly.
# - NEVER includes .playwright-mcp or evidence-* by default.
# - Shows the exact files before making commits.
# - Pushes ONLY after explicit confirmation.
#
# Evidence files remain untouched in the working tree.
# ============================================================

# ------------------------------------------------------------
# Configuration
# ------------------------------------------------------------

$excludedPatterns = @(
    ".playwright-mcp",
    "evidence-*"
)

$actions = @(
    "Update",
    "Fix issue in",
    "Refactor",
    "Tweak",
    "Adjust",
    "Clean up",
    "Implement updates for",
    "Improve",
    "Finalize",
    "Polish",
    "Revise",
    "Complete updates for"
)

# ------------------------------------------------------------
# Verify Git repository
# ------------------------------------------------------------

git rev-parse --is-inside-work-tree *> $null

if ($LASTEXITCODE -ne 0) {
    Write-Host "This directory is not a Git repository." -ForegroundColor Red
    exit 1
}

# ------------------------------------------------------------
# Determine current branch
# ------------------------------------------------------------

$currentBranch = (git branch --show-current).Trim()

if ([string]::IsNullOrWhiteSpace($currentBranch)) {
    Write-Host "Could not determine the current Git branch." -ForegroundColor Red
    exit 1
}

$targetBranch = $currentBranch

# ------------------------------------------------------------
# Repository information
# ------------------------------------------------------------

$repositoryName = Split-Path -Leaf (Get-Location)

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Git Individual Commit Logger" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Repository : $repositoryName" -ForegroundColor White
Write-Host "Branch     : $currentBranch" -ForegroundColor White
Write-Host ""

# ------------------------------------------------------------
# Get complete working-tree status
# ------------------------------------------------------------

$statusLines = @(git status --porcelain=v1)

if ($statusLines.Count -eq 0) {
    Write-Host "Nothing to commit." -ForegroundColor Yellow
    exit 0
}

# ------------------------------------------------------------
# Parse changed paths safely
# ------------------------------------------------------------

$eligibleFiles = @()
$excludedFiles = @()

foreach ($line in $statusLines) {

    if ([string]::IsNullOrWhiteSpace($line)) {
        continue
    }

    # Porcelain v1:
    # XY path
    #
    # The path begins at character 3.
    # This is valid because status --porcelain is being used here.

    if ($line.Length -lt 4) {
        continue
    }

    $status = $line.Substring(0, 2)
    $pathPart = $line.Substring(3)

    # Handle rename:
    # R  old/path -> new/path
    if ($status -match "R" -and $pathPart -match '^(.*?) -> (.*)$') {
        $file = $Matches[2]
    }
    else {
        $file = $pathPart
    }

    # Remove Git's surrounding quotes where applicable.
    $file = $file.Trim('"')

    if ([string]::IsNullOrWhiteSpace($file)) {
        continue
    }

    # --------------------------------------------------------
    # Exclude evidence artifacts
    # --------------------------------------------------------

    $isExcluded = $false

    foreach ($pattern in $excludedPatterns) {

        if ($pattern -eq ".playwright-mcp") {
            if (
                $file -eq ".playwright-mcp" -or
                $file.StartsWith(".playwright-mcp\")
            ) {
                $isExcluded = $true
                break
            }
        }
        elseif ($pattern -like "evidence-*") {
            $fileName = Split-Path $file -Leaf

            if ($fileName -like $pattern) {
                $isExcluded = $true
                break
            }
        }
    }

    if ($isExcluded) {
        $excludedFiles += $file
    }
    else {
        $eligibleFiles += $file
    }
}

# ------------------------------------------------------------
# Show eligible files
# ------------------------------------------------------------

Write-Host "Files that WILL be committed individually:" -ForegroundColor Green
Write-Host ""

if ($eligibleFiles.Count -eq 0) {
    Write-Host "  None" -ForegroundColor Yellow
}
else {
    foreach ($file in $eligibleFiles) {
        Write-Host "  + $file" -ForegroundColor Green
    }
}

Write-Host ""

# ------------------------------------------------------------
# Show excluded evidence files
# ------------------------------------------------------------

if ($excludedFiles.Count -gt 0) {

    Write-Host "Files deliberately EXCLUDED:" -ForegroundColor Yellow
    Write-Host ""

    foreach ($file in $excludedFiles) {
        Write-Host "  - $file" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "These evidence files will NOT be committed." -ForegroundColor DarkYellow
    Write-Host ""
}

Write-Host "Eligible files: $($eligibleFiles.Count)" -ForegroundColor Cyan
Write-Host "Excluded files: $($excludedFiles.Count)" -ForegroundColor Yellow
Write-Host ""

if ($eligibleFiles.Count -eq 0) {
    Write-Host "Nothing eligible to commit." -ForegroundColor Yellow
    exit 0
}

# ------------------------------------------------------------
# Final safety confirmation
# ------------------------------------------------------------

$confirmation = Read-Host "Commit these eligible files individually? (y/n)"

if ($confirmation -ne "y") {
    Write-Host ""
    Write-Host "No commits were created." -ForegroundColor Yellow
    exit 0
}

# ------------------------------------------------------------
# Commit each file separately
# ------------------------------------------------------------

$failed = @()

Write-Host ""
Write-Host "Creating individual commits..." -ForegroundColor Cyan
Write-Host ""

foreach ($file in $eligibleFiles) {

    $fileNameOnly = Split-Path $file -Leaf

    $prefix = $actions | Get-Random

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    $message = "$prefix $fileNameOnly [$timestamp]"

    Write-Host "--------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "File   : $file" -ForegroundColor White
    Write-Host "Commit : $message" -ForegroundColor Cyan
    Write-Host ""

    # --------------------------------------------------------
    # Reset staging area first.
    #
    # This prevents anything accidentally staged beforehand
    # from being included in this file's commit.
    # --------------------------------------------------------

    git reset --quiet

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to clear staging area." -ForegroundColor Red
        $failed += $file
        continue
    }

    # --------------------------------------------------------
    # Stage ONLY this file
    # --------------------------------------------------------

    git add -- "$file"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to stage: $file" -ForegroundColor Red
        $failed += $file
        continue
    }

    # --------------------------------------------------------
    # Verify exactly what is staged
    # --------------------------------------------------------

    $stagedFiles = @(git diff --cached --name-only)

    if ($stagedFiles.Count -ne 1 -or $stagedFiles[0] -ne $file) {

        Write-Host "SAFETY CHECK FAILED." -ForegroundColor Red
        Write-Host "Expected only: $file" -ForegroundColor Red
        Write-Host "Actually staged:" -ForegroundColor Red

        foreach ($staged in $stagedFiles) {
            Write-Host "  $staged" -ForegroundColor Red
        }

        git reset --quiet
        $failed += $file
        continue
    }

    # --------------------------------------------------------
    # Commit
    # --------------------------------------------------------

    git commit -m "$message"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Committed successfully." -ForegroundColor Green
    }
    else {
        Write-Host "Commit failed: $file" -ForegroundColor Red

        # Leave staging clean.
        git reset --quiet

        $failed += $file
    }

    Write-Host ""
}

# ------------------------------------------------------------
# Final report
# ------------------------------------------------------------

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Commit process finished." -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------
# Handle failures
# ------------------------------------------------------------

if ($failed.Count -gt 0) {

    Write-Host "The following files failed:" -ForegroundColor Red
    Write-Host ""

    foreach ($file in $failed) {
        Write-Host "  $file" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "Push was NOT attempted." -ForegroundColor Yellow
    Write-Host "Your successful commits remain local." -ForegroundColor Yellow
    Write-Host ""

    git status --short

    exit 1
}

# ------------------------------------------------------------
# Show recent history
# ------------------------------------------------------------

Write-Host "Recent commit history:" -ForegroundColor Cyan
Write-Host ""

git log --oneline --decorate --graph -20

Write-Host ""

# ------------------------------------------------------------
# Verify working tree
# ------------------------------------------------------------

Write-Host "Remaining working tree:" -ForegroundColor Cyan
Write-Host ""

git status --short

Write-Host ""

# ------------------------------------------------------------
# Push
# ------------------------------------------------------------

$push = Read-Host "Push commits to origin/$targetBranch? (y/n)"

if ($push -eq "y") {

    Write-Host ""
    Write-Host "Pushing to origin/$targetBranch..." -ForegroundColor Cyan

    git push origin $targetBranch

    if ($LASTEXITCODE -eq 0) {

        Write-Host ""
        Write-Host "Push completed successfully." -ForegroundColor Green
    }
    else {

        Write-Host ""
        Write-Host "Push failed." -ForegroundColor Red
        Write-Host "Your commits remain safely local." -ForegroundColor Yellow

        exit 1
    }
}
else {

    Write-Host ""
    Write-Host "Push skipped. Commits remain local." -ForegroundColor Yellow
}