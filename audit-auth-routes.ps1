# PowerShell script to audit API routes for auth checks
$routes = @()
$unprotected = @()
$protected = @()

# Get all route.ts files
$files = Get-ChildItem -Path "D:/Mployedin/mployedin/src/app/api" -Filter "route.ts" -Recurse -Force

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw
    $path = $file.FullName -replace "D:/Mployedin/mployedin/", ""
    
    # Check for auth patterns
    $hasWithAuth = $content -match "withAuth\s*\("
    $hasRequireRole = $content -match "requireRole\s*\("
    $hasAuth = $content -match "from\s+['\"]@/lib/auth"
    $hasGetServerSession = $content -match "getServerSession|getSession"
    $hasAuthCall = $content -match "\bauth\(\s*\)"
    
    $isProtected = $hasWithAuth -or $hasRequireRole -or ($hasAuth -and ($hasGetServerSession -or $hasAuthCall))
    
    $obj = @{
        Path = $path
        HasWithAuth = $hasWithAuth
        HasRequireRole = $hasRequireRole
        HasAuthImport = $hasAuth
        HasAuthCall = $hasGetServerSession -or $hasAuthCall
        IsProtected = $isProtected
        Content = $content
    }
    
    if ($isProtected) {
        $protected += $obj
    } else {
        $unprotected += $obj
    }
}

Write-Host "Protected routes: $($protected.Count)"
Write-Host "Unprotected routes: $($unprotected.Count)"
Write-Host ""

# Output unprotected routes
Write-Host "=== UNPROTECTED ROUTES ===" -ForegroundColor Yellow
foreach ($route in $unprotected | Sort-Object Path) {
    Write-Host $route.Path
}
