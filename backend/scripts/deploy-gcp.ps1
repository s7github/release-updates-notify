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
  [string]$FirestoreDatabaseId = 'ai-studio-521db98c-8ec1-48c1-abff-6ca1d8854b1f',
  [string]$SweepSchedule = '0 * * * *'
)

$ErrorActionPreference = 'Stop'
$image = "gcr.io/$Project/updatenotify-backend"
$sa = "updatenotify-run@$Project.iam.gserviceaccount.com"

function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Gc { & gcloud @args; if ($LASTEXITCODE -ne 0) { throw "gcloud $($args -join ' ') failed" } }

Step 'Enable APIs'
Gc services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com `
  pubsub.googleapis.com cloudscheduler.googleapis.com firestore.googleapis.com --project $Project

Step 'Service account'
if (-not (& gcloud iam service-accounts list --project $Project --filter "email=$sa" --format 'value(email)')) {
  Gc iam service-accounts create updatenotify-run --project $Project --display-name 'UpdateNotify Cloud Run'
}
foreach ($role in 'roles/datastore.user', 'roles/pubsub.publisher', 'roles/firebasecloudmessaging.admin', 'roles/secretmanager.secretAccessor') {
  Gc projects add-iam-policy-binding $Project --member "serviceAccount:$sa" --role $role --condition None | Out-Null
}

Step 'Gemini secret'
$exists = & gcloud secrets list --project $Project --filter 'name~gemini-api-key' --format 'value(name)'
if (-not $exists) {
  $key = Read-Host 'Gemini API key (hidden)' -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($key))
  $tmp = New-TemporaryFile
  try {
    [IO.File]::WriteAllText($tmp, $plain)
    Gc secrets create gemini-api-key --data-file $tmp --project $Project
  } finally { Remove-Item $tmp -Force }
} else { Write-Host 'gemini-api-key already exists, keeping it' }

Step 'Pub/Sub topics'
foreach ($t in 'poll-requests', 'release-published', 'dead-letter') {
  if (-not (& gcloud pubsub topics list --project $Project --filter "name~/$t$" --format 'value(name)')) {
    Gc pubsub topics create $t --project $Project
  }
}

Step 'Build image'
Gc builds submit (Join-Path $PSScriptRoot '..') --tag $image --project $Project

Step 'Deploy services'
$urls = @{}
foreach ($svc in 'api', 'poller', 'notifier') {
  $extra = @()
  if ($svc -eq 'api') { $extra += '--min-instances=1' }
  Gc run deploy "updatenotify-$svc" --image $image --region $Region --project $Project `
    --service-account $sa `
    --set-env-vars "SERVICE=$svc,GOOGLE_CLOUD_PROJECT=$Project,FIRESTORE_DATABASE_ID=$FirestoreDatabaseId" `
    --set-secrets 'GEMINI_API_KEY=gemini-api-key:latest' `
    --no-allow-unauthenticated @extra
  $urls[$svc] = (& gcloud run services describe "updatenotify-$svc" --region $Region --project $Project --format 'value(status.url)')
}

Step 'Push subscriptions (OIDC)'
foreach ($pair in @(@('poll-requests', 'poller', '/pubsub/poll'), @('release-published', 'notifier', '/pubsub/notify'))) {
  $topic, $svc, $path = $pair
  $name = "$topic-to-$svc"
  Gc run services add-iam-policy-binding "updatenotify-$svc" --region $Region --project $Project `
    --member "serviceAccount:$sa" --role roles/run.invoker | Out-Null
  $has = & gcloud pubsub subscriptions list --project $Project --filter "name~/$name$" --format 'value(name)'
  $verb = if ($has) { 'update' } else { 'create' }
  $subArgs = @('--push-endpoint', "$($urls[$svc])$path", '--push-auth-service-account', $sa,
    '--push-auth-token-audience', $urls[$svc], '--dead-letter-topic', 'dead-letter', '--max-delivery-attempts', '5')
  if ($verb -eq 'create') { $subArgs = @('--topic', $topic) + $subArgs }
  Gc pubsub subscriptions $verb $name --project $Project @subArgs
}

Step 'Hourly sweep'
$job = 'updatenotify-sweep'
$verb = if (& gcloud scheduler jobs list --location $Region --project $Project --filter "name~/$job$" --format 'value(name)') { 'update' } else { 'create' }
Gc scheduler jobs $verb http $job --location $Region --project $Project --schedule $SweepSchedule `
  --uri "$($urls['poller'])/scheduler/sweep" --http-method POST `
  --oidc-service-account-email $sa --oidc-token-audience $urls['poller']

Step 'Done'
Write-Host "api:      $($urls['api'])"
Write-Host "poller:   $($urls['poller'])"
Write-Host "notifier: $($urls['notifier'])"
Write-Host 'Trigger a first sweep now: gcloud scheduler jobs run updatenotify-sweep --location' $Region '--project' $Project
