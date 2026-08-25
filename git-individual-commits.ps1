# ============================================================
# Git Individual Commit Logger
# ============================================================
# Creates one commit per changed file.
#
# The script automatically detects the current Git branch.
# No branch name needs to be changed manually.
#
# Every changed file is committed individually, regardless
# of how many changes that file contains.
#
# Example:
# 1 changed file  -> 1 commit
# 10 changed files -> 10 commits
# 50 changed files -> 50 commits
#
# The script only asks for confirmation before pushing.
# ============================================================

# ------------------------------------------------------------
# Human-like commit prefixes
# ------------------------------------------------------------
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
# Verify this is a Git repository
# ------------------------------------------------------------
git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "This directory is not a Git repository." -ForegroundColor Red
    exit 1
}

# ------------------------------------------------------------
# Automatically determine current branch
# ------------------------------------------------------------
$currentBranch = git branch --show-current
if ([string]::IsNullOrWhiteSpace($currentBranch)) {
    Write-Host "Could not determine the current branch." -ForegroundColor Red
    exit 1
}
$targetBranch = $currentBranch

# ------------------------------------------------------------
# Repository information
# ------------------------------------------------------------
$repositoryName = Split-Path -Leaf (Get-Location)
Write-Host ""
Write-Host "Repository : $repositoryName" -ForegroundColor Cyan
Write-Host "Branch     : $currentBranch" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------
# Get all changed files (porcelain format)
# ------------------------------------------------------------
$changes = @(git status --porcelain)
if ($changes.Count -eq 0) {
    Write-Host "Nothing to commit." -ForegroundColor Yellow
    exit 0
}

# ------------------------------------------------------------
# Show files before committing
# ------------------------------------------------------------
Write-Host "Files to be committed individually:" -ForegroundColor Cyan
Write-Host ""
foreach ($line in $changes) {
    Write-Host "  $line"
}
Write-Host ""
Write-Host "Total changed files: $($changes.Count)" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------
# Commit each file separately
# ------------------------------------------------------------
$failed = @()
Write-Host "Creating individual commits..." -ForegroundColor Cyan
Write-Host ""

foreach ($line in $changes) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }

    # Porcelain format: XY[space]path  or  XY[space]"path with spaces"
    # For renames: R  old -> new
    $status = $line.Substring(0, 2).Trim()
    $rawPath = $line.Substring(3).Trim()

    # Handle rename (status starts with R)
    if ($status -like "R*" -and $rawPath -match ' -> "?(.+?)"?$') {
        $file = $Matches[1]
    }
    else {
        # Strip surrounding quotes if present
        $file = $rawPath.Trim('"')
    }

    if ([string]::IsNullOrWhiteSpace($file)) { continue }

    # Extract filename only for the commit message
    $fileNameOnly = Split-Path $file -Leaf

    # Select a natural commit prefix
    $prefix = $actions | Get-Random

    # Current timestamp
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    # Create commit message
    $message = "$prefix $fileNameOnly [$timestamp]"

    Write-Host "--------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "File    : $file" -ForegroundColor White
    Write-Host "Commit  : $message" -ForegroundColor Cyan

    # Stage ONLY this file
    git add -- "$file"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to stage: $file" -ForegroundColor Red
        $failed += $file
        continue
    }

    # Commit ONLY this staged file
    git commit -m "$message"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Committed successfully." -ForegroundColor Green
    }
    else {
        Write-Host "Commit failed: $file" -ForegroundColor Red
        $failed += $file
    }
    Write-Host ""
}

# ------------------------------------------------------------
# Final commit status
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
    Write-Host "Fix the failed files and run the script again." -ForegroundColor Yellow
    exit 1
}

# ------------------------------------------------------------
# Show resulting history
# ------------------------------------------------------------
Write-Host "Recent commit history:" -ForegroundColor Cyan
Write-Host ""
git log --oneline --decorate --graph -20
Write-Host ""

# ------------------------------------------------------------
# Verify working tree
# ------------------------------------------------------------
Write-Host "Remaining working tree:" -ForegroundColor Cyan
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
        Write-Host "Push failed. Your commits remain safely local." -ForegroundColor Red
        exit 1
    }
}
else {
    Write-Host ""
    Write-Host "Push skipped. Commits remain local." -ForegroundColor Yellow
}