#!/bin/bash
set -euo pipefail

PROJECT_ID="gmaps-gpx-prod"
SERVICE_ACCOUNT="github-actions@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Setting up IAM bindings for ${SERVICE_ACCOUNT}..."

# Storage access (for deploying web assets to GCS)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/storage.objectAdmin"

# Cloud Functions deployment
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/cloudfunctions.developer"

# Cloud Run (required for gen2 Cloud Functions)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/run.developer"

# Allow acting as service accounts (needed for function deployment)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/iam.serviceAccountUser"

echo "Done."
