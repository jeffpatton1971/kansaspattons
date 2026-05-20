# PowerShell Environment

This repository is developed primarily on Windows using PowerShell.

## Command Rules

Prefer PowerShell commands instead of bash utilities.

Use:
- `Get-Content` instead of `cat`
- `Get-ChildItem` instead of `ls`
- `Select-String` instead of `grep`
- `Set-Location` instead of `cd`
- `Copy-Item` instead of `cp`
- `Move-Item` instead of `mv`
- `Remove-Item` instead of `rm`

## Shell Assumptions

- Do not assume bash is installed.
- Do not assume GNU utilities exist.
- Avoid Linux-specific shell syntax.
- Prefer PowerShell-compatible syntax.
- Use Windows paths when appropriate.

## Scripts

- Prefer `.ps1` scripts.
- Prefer PowerShell examples in documentation.