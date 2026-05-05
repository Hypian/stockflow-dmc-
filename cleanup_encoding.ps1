$path = "app.js"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

$mappings = @{
    "Ã¢â€ â‚¬" = "─";
    "Ã¢â€¢Â" = "═";
    "Ã¢â€ â€™" = "→";
    "Ã¢â‚¬Â¢" = "•";
    "Ã¢â‚¬Â¦" = "…";
    "Ã¢â‚¬â€œ" = "–";
    "Ã¢Ëœâ‚¬Ã¯Â¸Â" = "☀️";
    "Ã°Å¸Å’â„¢" = "🌙";
    "Ã‚Â·" = "·";
    "Ã¢Å“â€œ" = "✓";
    "Ã‚Â©" = "©";
    "Ã¢â‚¬â€" = "—";
    "Ã¢â‚¬Å“" = "“";
    "Ã¢â‚¬Â" = "”";
    "Ã¢â‚¬â„¢" = "’"
}

foreach ($key in $mappings.Keys) {
    $content = $content.Replace($key, $mappings[$key])
}

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "Cleanup complete."
