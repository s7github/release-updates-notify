<#
  Stores a GitHub token (read-only, public repos) as the `github-token` secret and wires it
  into the three Cloud Run services. Copy the token to the clipboard first, then run this.
  The token goes clipboard -> temp file -> Secret Manager and is never printed or put on a
  command line; the clipboard is cleared afterwards.
#>
param(
  [string]$Project = 'gen-lang-client-0099813375',
  [string]$Region = 'europe-west4'
)

$ErrorActionPreference = 'Stop'

function Run-Gcloud {
  $gArgs = $args
  & { $ErrorActionPreference = 'Continue'; & gcloud @gArgs 2>&1 | ForEach-Object { Write-Host "$_" } }
  if ($LASTEXITCODE -ne 0) { throw "gcloud $($args -join ' ') failed" }
}

$token = "$(Get-Clipboard -Raw)".Trim()
if ($token.Length -lt 20 -or $token -match '\s') {
  throw 'The clipboard does not hold a GitHub token. Copy the token, then run this again.'
}

$tmp = New-TemporaryFile
try {
  [IO.File]::WriteAllText($tmp, $token)
  $exists = & gcloud secrets list --project $Project --filter 'name~github-token' --format 'value(name)'
  if ($exists) {
    Run-Gcloud secrets versions add github-token --data-file $tmp --project $Project
  } else {
    Run-Gcloud secrets create github-token --data-file $tmp --project $Project
  }
} finally {
  Remove-Item $tmp -Force
  Set-Clipboard -Value ' '
}

foreach ($svc in 'updatenotify-api', 'updatenotify-poller', 'updatenotify-notifier') {
  Run-Gcloud run services update $svc --region $Region --project $Project --update-secrets 'GITHUB_TOKEN=github-token:latest'
}
Write-Host "`nDone: github-token stored and wired into the services." -ForegroundColor Green
