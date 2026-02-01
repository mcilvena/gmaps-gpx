# GCP and GitHub Actions Setup Guide

This guide explains how to configure Google Cloud Platform (GCP) and GitHub
Actions for automated deployments.

## Overview

The deployment pipeline uses **Workload Identity Federation** to authenticate
GitHub Actions with GCP. This is the recommended approach as it eliminates the
need for long-lived service account keys.

## Prerequisites

- A GCP project with billing enabled
- `gcloud` CLI installed and authenticated
- Admin access to the GitHub repository

## GCP Setup

### 1. Set Environment Variables

```bash
export PROJECT_ID="your-gcp-project-id"
export GITHUB_REPO="your-username/your-repo"
```

### 2. Create a Service Account

```bash
gcloud iam service-accounts create github-actions \
    --project="$PROJECT_ID" \
    --display-name="GitHub Actions"
```

### 3. Grant IAM Roles

Grant the service account the necessary permissions:

```bash
SERVICE_ACCOUNT="github-actions@${PROJECT_ID}.iam.gserviceaccount.com"

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
```

### 4. Create Workload Identity Pool

```bash
gcloud iam workload-identity-pools create github-pool \
    --project="$PROJECT_ID" \
    --location="global" \
    --display-name="GitHub Actions Pool"
```

### 5. Create Workload Identity Provider

```bash
gcloud iam workload-identity-pools providers create-oidc github-provider \
    --project="$PROJECT_ID" \
    --location="global" \
    --workload-identity-pool="github-pool" \
    --display-name="GitHub Provider" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${GITHUB_REPO}'"
```

The `attribute-condition` restricts authentication to only your repository.

### 6. Allow GitHub to Impersonate the Service Account

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")

gcloud iam service-accounts add-iam-policy-binding \
    "github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project="$PROJECT_ID" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${GITHUB_REPO}"
```

### 7. Get the Workload Identity Provider String

```bash
echo "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
```

Save this output—you'll need it for GitHub configuration.

## GitHub Setup

### 1. Add Repository Variables

Go to your repository: **Settings → Secrets and variables → Actions → Variables
tab**

Click **New repository variable** and add:

| Variable                         | Value                                                    |
| -------------------------------- | -------------------------------------------------------- |
| `GCP_PROJECT_ID`                 | Your GCP project ID                                      |
| `GCP_SERVICE_ACCOUNT`            | `github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | The provider string from step 7 above                    |
| `GCS_BUCKET`                     | Your Cloud Storage bucket name                           |
| `GCP_REGION`                     | Your preferred region (e.g., `us-central1`)              |

### 2. Workflow Configuration

The workflow must include these permissions for Workload Identity Federation to
work:

```yaml
permissions:
  contents: read
  id-token: write
```

Authentication step:

```yaml
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}
    service_account: ${{ vars.GCP_SERVICE_ACCOUNT }}
```

## Verification

### Check Service Account

```bash
gcloud iam service-accounts describe \
    github-actions@${PROJECT_ID}.iam.gserviceaccount.com \
    --project="$PROJECT_ID"
```

### Check Workload Identity Pool

```bash
gcloud iam workload-identity-pools describe github-pool \
    --location=global \
    --project="$PROJECT_ID"
```

### Check Workload Identity Provider

```bash
gcloud iam workload-identity-pools providers describe github-provider \
    --workload-identity-pool=github-pool \
    --location=global \
    --project="$PROJECT_ID"
```

### Check IAM Roles

```bash
gcloud projects get-iam-policy "$PROJECT_ID" \
    --flatten="bindings[].members" \
    --filter="bindings.members:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
    --format="table(bindings.role)"
```

Expected roles:

- `roles/cloudfunctions.developer`
- `roles/iam.serviceAccountUser`
- `roles/run.developer`
- `roles/storage.objectAdmin`

## Troubleshooting

### "Unable to acquire access token"

- Verify the `GCP_WORKLOAD_IDENTITY_PROVIDER` variable matches the output from
  step 7
- Check that the repository name in `attribute-condition` matches exactly
  (case-sensitive)
- Ensure the workflow has `id-token: write` permission

### "Permission denied" errors

- Verify the service account has the required IAM roles
- Check that the service account email in `GCP_SERVICE_ACCOUNT` is correct

### "Workload Identity Pool does not exist"

- Ensure the pool was created in the `global` location
- Verify the project ID is correct

## Additional Resources

- [Workload Identity Federation documentation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [google-github-actions/auth](https://github.com/google-github-actions/auth)
