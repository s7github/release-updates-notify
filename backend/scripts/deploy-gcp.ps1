<#
.SYNOPSIS
  One-shot deploy of the UpdateNotify backend (api, poller, notifier) to Cloud Run,
  with Pub/Sub wiring and an hourly Cloud Scheduler sweep.

.DESCRIPTION
  Idempotent: safe to re-run. Prompts for the project and region, and reads the
  Gemini key from a hidden prompt (never from a file or the command line).
  Requires: gcloud, logged in (`gcloud auth login`), billing enabled on the project.

.EXAMPLE
  .\backend\scripts\deploy-gcp.ps1
#>
param(
  [string]$Project = $(Read-Host 'GCP project id'),
  [string]$Region = 'europe-west1',
  [string]$FirestoreDatabaseId = 'updatenotify',
  [string]$SweepSchedule = '0 * * * *',
  # Idle capacity costs money; the api is only hit by discover/refresh (clients read
  # Firestore directly), so a cold start is acceptable. Set 1 to remove it.
  [int]$ApiMinInstances = 0,
  # Optional: creates a budget with alerts at 40% and 100% of BudgetUsd.
  [string]$BillingAccount = '',
  [int]$BudgetUsd = 25,
  # Skip every interactive prompt (the optional GitHub token). Add it later with
  # `gcloud secrets create github-token` and re-run.
  [switch]$NoPrompt
)

$ErrorActionPreference = 'Stop'
$image = "gcr.io/$Project/updatenotify-backend"
$sa = "updatenotify-run@$Project.iam.gserviceaccount.com"

function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
# For safety nets (backups, TTL, monitoring): warn instead of aborting the deploy.
function Try-Gcloud {
  $gArgs = $args
  & { $ErrorActionPreference = 'Continue'; & gcloud @gArgs 2>&1 | ForEach-Object { Write-Host "$_" } }
  if ($LASTEXITCODE -ne 0) { Write-Warning "gcloud $($args -join ' ') failed; continue and set this up by hand" }
}
# gcloud prints progress to stderr. Windows PowerShell 5.1 turns redirected stderr into
# a terminating error under 'Stop', so only the exit code decides success here.
function Invoke-Gcloud {
  $gArgs = $args
  & { $ErrorActionPreference = 'Continue'; & gcloud @gArgs 2>&1 | ForEach-Object { Write-Host "$_" } }
  if ($LASTEXITCODE -ne 0) { throw "gcloud $($args -join ' ') failed" }
}

Step 'Enable APIs'
Invoke-Gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com `
  pubsub.googleapis.com cloudscheduler.googleapis.com firestore.googleapis.com --project $Project

Step 'Service account'
if (-not (& gcloud iam service-accounts list --project $Project --filter "email=$sa" --format 'value(email)')) {
  Invoke-Gcloud iam service-accounts create updatenotify-run --project $Project --display-name 'UpdateNotify Cloud Run'
}
foreach ($role in 'roles/datastore.user', 'roles/pubsub.publisher', 'roles/firebasecloudmessaging.admin', 'roles/secretmanager.secretAccessor') {
  Invoke-Gcloud projects add-iam-policy-binding $Project --member "serviceAccount:$sa" --role $role --condition None | Out-Null
}

Step 'Gemini secret'
$exists = & gcloud secrets list --project $Project --filter 'name~gemini-api-key' --format 'value(name)'
if (-not $exists) {
  $key = Read-Host 'Gemini API key (hidden)' -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($key))
  $tmp = New-TemporaryFile
  try {
    [IO.File]::WriteAllText($tmp, $plain)
    Invoke-Gcloud secrets create gemini-api-key --data-file $tmp --project $Project
  } finally { Remove-Item $tmp -Force }
} else { Write-Host 'gemini-api-key already exists, keeping it' }

Step 'GitHub token (optional)'
# Anonymous GitHub is 60 requests/hour, which a catalog of any size exhausts.
$hasGh = & gcloud secrets list --project $Project --filter 'name~github-token' --format 'value(name)'
if (-not $hasGh -and -not $NoPrompt) {
  $gh = Read-Host 'GitHub token, read-only public access (hidden, Enter to skip)' -AsSecureString
  $ghPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($gh))
  if ($ghPlain) {
    $tmp = New-TemporaryFile
    try {
      [IO.File]::WriteAllText($tmp, $ghPlain)
      Invoke-Gcloud secrets create github-token --data-file $tmp --project $Project
    } finally { Remove-Item $tmp -Force }
    $hasGh = 'github-token'
  }
}
$secrets = 'GEMINI_API_KEY=gemini-api-key:latest'
if ($hasGh) { $secrets += ',GITHUB_TOKEN=github-token:latest' }

Step 'Pub/Sub topics'
foreach ($t in 'poll-requests', 'release-published', 'dead-letter') {
  if (-not (& gcloud pubsub topics list --project $Project --filter "name~/$t$" --format 'value(name)')) {
    Invoke-Gcloud pubsub topics create $t --project $Project
  }
}

Step 'Build image'
Invoke-Gcloud builds submit (Join-Path $PSScriptRoot '..') --tag $image --project $Project

Step 'Deploy services'
$urls = @{}
foreach ($svc in 'api', 'poller', 'notifier') {
  # api is called from browsers and verifies Firebase ID tokens itself. The poller and
  # notifier only accept Pub/Sub / Scheduler OIDC calls, so they stay private.
  $extra = @()
  if ($svc -eq 'api') {
    $extra += "--min-instances=$ApiMinInstances"; $extra += '--max-instances=5'; $extra += '--allow-unauthenticated'
  } else {
    # Capped so a sweep cannot stampede the model's rate limit. Polling is mostly
    # waiting on the network, so a few requests share an instance.
    $extra += '--min-instances=0'; $extra += '--max-instances=3'; $extra += '--concurrency=4'
    $extra += '--no-allow-unauthenticated'
  }
  Invoke-Gcloud run deploy "updatenotify-$svc" --image $image --region $Region --project $Project `
    --service-account $sa `
    --set-env-vars "SERVICE=$svc,GOOGLE_CLOUD_PROJECT=$Project,FIRESTORE_DATABASE_ID=$FirestoreDatabaseId" `
    --set-secrets $secrets `
    --memory 512Mi --cpu-boost `
    @extra
  $urls[$svc] = (& gcloud run services describe "updatenotify-$svc" --region $Region --project $Project --format 'value(status.url)')
}

Step 'Dead-letter permissions'
# Without these the dead-letter topic silently receives nothing.
$projectNumber = & gcloud projects describe $Project --format 'value(projectNumber)'
$pubsubSa = "service-$projectNumber@gcp-sa-pubsub.iam.gserviceaccount.com"
Invoke-Gcloud pubsub topics add-iam-policy-binding dead-letter --project $Project `
  --member "serviceAccount:$pubsubSa" --role roles/pubsub.publisher | Out-Null
# Keeps dead letters for a week so they can be inspected and replayed.
if (-not (& gcloud pubsub subscriptions list --project $Project --filter 'name~/dead-letter-pull$' --format 'value(name)')) {
  Invoke-Gcloud pubsub subscriptions create dead-letter-pull --topic dead-letter --project $Project `
    --message-retention-duration 7d --ack-deadline 60
}

Step 'Push subscriptions (OIDC)'
foreach ($pair in @(@('poll-requests', 'poller', '/pubsub/poll'), @('release-published', 'notifier', '/pubsub/notify'))) {
  $topic, $svc, $path = $pair
  $name = "$topic-to-$svc"
  Invoke-Gcloud run services add-iam-policy-binding "updatenotify-$svc" --region $Region --project $Project `
    --member "serviceAccount:$sa" --role roles/run.invoker | Out-Null
  $has = & gcloud pubsub subscriptions list --project $Project --filter "name~/$name$" --format 'value(name)'
  $verb = if ($has) { 'update' } else { 'create' }
  $subArgs = @('--push-endpoint', "$($urls[$svc])$path", '--push-auth-service-account', $sa,
    '--push-auth-token-audience', $urls[$svc], '--dead-letter-topic', 'dead-letter', '--max-delivery-attempts', '5',
    # A poll scrapes then calls the model; the 10 s default would redeliver mid-run.
    '--ack-deadline', '300', '--min-retry-delay', '10s', '--max-retry-delay', '600s')
  if ($verb -eq 'create') { $subArgs = @('--topic', $topic) + $subArgs }
  Invoke-Gcloud pubsub subscriptions $verb $name --project $Project @subArgs
  Invoke-Gcloud pubsub subscriptions add-iam-policy-binding $name --project $Project `
    --member "serviceAccount:$pubsubSa" --role roles/pubsub.subscriber | Out-Null
}

Step 'Hourly sweep'
$job = 'updatenotify-sweep'
$verb = if (& gcloud scheduler jobs list --location $Region --project $Project --filter "name~/$job$" --format 'value(name)') { 'update' } else { 'create' }
Invoke-Gcloud scheduler jobs $verb http $job --location $Region --project $Project --schedule $SweepSchedule `
  --uri "$($urls['poller'])/scheduler/sweep" --http-method POST `
  --oidc-service-account-email $sa --oidc-token-audience $urls['poller'] `
  --attempt-deadline 300s --max-retry-attempts 3 --min-backoff 30s

Step 'Firestore: recovery and retention'
Try-Gcloud firestore databases update --database $FirestoreDatabaseId --project $Project --enable-pitr
Try-Gcloud firestore backups schedules create --database $FirestoreDatabaseId --project $Project --recurrence daily --retention 7d
# TTL deletes are free. Documents carry an expiresAt Timestamp (lib/retention.ts).
foreach ($coll in 'background_tasks', 'system_learnings', 'admin_audit') {
  Try-Gcloud firestore fields ttls update expiresAt --collection-group $coll --enable-ttl --async `
    --database $FirestoreDatabaseId --project $Project
}

Step 'Monitoring: is the pipeline alive?'
# /healthz/pipeline returns 503 when no sweep has been recorded for 3 hours.
$apiHost = ([uri]$urls['api']).Host
Try-Gcloud monitoring uptime create updatenotify-pipeline --project $Project `
  --resource-type uptime-url --resource-labels "host=$apiHost,project_id=$Project" `
  --protocol https --path /healthz/pipeline --period 15 --regions europe --timeout 10

if ($BillingAccount) {
  Step 'Budget'
  Try-Gcloud billing budgets create --billing-account $BillingAccount --display-name updatenotify `
    --budget-amount "${BudgetUsd}USD" --threshold-rule percent=0.4 --threshold-rule percent=1.0 `
    --filter-projects "projects/$Project"
}

Step 'Done'
Write-Host "api:      $($urls['api'])"
Write-Host "poller:   $($urls['poller'])"
Write-Host "notifier: $($urls['notifier'])"
Write-Host 'Trigger a first sweep now: gcloud scheduler jobs run updatenotify-sweep --location' $Region '--project' $Project
