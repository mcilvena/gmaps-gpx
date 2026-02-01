.PHONY: all build build-cli build-web serve deploy deploy-function setup-gcp setup-gcp-apis create-bucket clean help

# Configuration (override with: make deploy GCS_BUCKET=your-bucket)
GCS_BUCKET ?= your-bucket-name
FUNCTION_NAME ?= gmaps-gpx-expand-url
GCP_REGION ?= us-central1
GCP_PROJECT ?= $(shell gcloud config get-value project 2>/dev/null)

# Directories
DIST_DIR := dist
WEB_DIR := web
FUNCTION_DIR := lambda/expand-url

all: build

# Build everything
build: build-cli build-web

# Build CLI binary for current platform
build-cli:
	deno compile --allow-net --allow-write --output gmaps-gpx src/main.ts

# Build web bundles
build-web: $(WEB_DIR)/gmaps-gpx.iife.min.js $(DIST_DIR)/gmaps-gpx.esm.min.js

$(WEB_DIR)/gmaps-gpx.iife.min.js: src/lib.ts
	npx esbuild src/lib.ts --bundle --format=iife --global-name=GmapsGpx --minify --outfile=$@

$(DIST_DIR)/gmaps-gpx.esm.min.js: src/lib.ts
	@mkdir -p $(DIST_DIR)
	npx esbuild src/lib.ts --bundle --format=esm --minify --outfile=$@

# Build all web bundle variants
build-web-all: src/lib.ts
	@mkdir -p $(DIST_DIR)
	npx esbuild src/lib.ts --bundle --format=esm --outfile=$(DIST_DIR)/gmaps-gpx.esm.js
	npx esbuild src/lib.ts --bundle --format=esm --minify --outfile=$(DIST_DIR)/gmaps-gpx.esm.min.js
	npx esbuild src/lib.ts --bundle --format=iife --global-name=GmapsGpx --outfile=$(DIST_DIR)/gmaps-gpx.iife.js
	npx esbuild src/lib.ts --bundle --format=iife --global-name=GmapsGpx --minify --outfile=$(DIST_DIR)/gmaps-gpx.iife.min.js
	cp $(DIST_DIR)/gmaps-gpx.iife.min.js $(WEB_DIR)/

# Serve web app locally for development
serve: $(WEB_DIR)/gmaps-gpx.iife.min.js
	@echo "Serving at http://localhost:8000"
	python3 -m http.server -d $(WEB_DIR) 8000

# Deploy web app to Cloud Storage
deploy: $(WEB_DIR)/gmaps-gpx.iife.min.js
	gsutil -m rsync -d -r $(WEB_DIR)/ gs://$(GCS_BUCKET)
	gsutil web set -m index.html gs://$(GCS_BUCKET)
	gsutil iam ch allUsers:objectViewer gs://$(GCS_BUCKET)
	@echo ""
	@echo "Deployed to: https://storage.googleapis.com/$(GCS_BUCKET)/index.html"
	@echo "Or configure a custom domain with Cloud CDN / Load Balancer"

# Initial GCP project setup (run once)
setup-gcp:
	@echo "Creating GCP project: $(GCP_PROJECT)"
	gcloud projects create $(GCP_PROJECT) --name="gmaps-gpx" || true
	@echo ""
	@echo "Link billing account with:"
	@echo "  gcloud billing accounts list"
	@echo "  gcloud billing projects link $(GCP_PROJECT) --billing-account=BILLING_ACCOUNT_ID"
	@echo ""
	@echo "Then run: make setup-gcp-apis"

setup-gcp-apis:
	gcloud config set project $(GCP_PROJECT)
	gcloud services enable cloudfunctions.googleapis.com
	gcloud services enable cloudbuild.googleapis.com
	gcloud services enable run.googleapis.com
	gcloud services enable storage.googleapis.com
	@echo "APIs enabled for $(GCP_PROJECT)"

# Create Cloud Storage bucket for static hosting
create-bucket:
	gsutil mb -l $(GCP_REGION) gs://$(GCS_BUCKET)
	gsutil web set -m index.html gs://$(GCS_BUCKET)
	gsutil iam ch allUsers:objectViewer gs://$(GCS_BUCKET)
	@echo "Bucket created: gs://$(GCS_BUCKET)"

# Deploy Cloud Function for URL expansion
deploy-function:
	@echo "Deploying Cloud Function..."
	gcloud functions deploy $(FUNCTION_NAME) \
		--gen2 \
		--region=$(GCP_REGION) \
		--runtime=nodejs20 \
		--source=$(FUNCTION_DIR) \
		--entry-point=expandUrl \
		--trigger-http \
		--allow-unauthenticated \
		--project=$(GCP_PROJECT)
	@echo ""
	@echo "Function URL:"
	@gcloud functions describe $(FUNCTION_NAME) --region=$(GCP_REGION) --project=$(GCP_PROJECT) --format='value(serviceConfig.uri)'
	@echo ""
	@echo "Update web/config.js with this URL"

# Get Cloud Function URL
function-url:
	@gcloud functions describe $(FUNCTION_NAME) --region=$(GCP_REGION) --project=$(GCP_PROJECT) --format='value(serviceConfig.uri)'

# Delete Cloud Function
delete-function:
	gcloud functions delete $(FUNCTION_NAME) --region=$(GCP_REGION) --project=$(GCP_PROJECT) --quiet

# Clean build artifacts
clean:
	rm -rf $(DIST_DIR)
	rm -f $(WEB_DIR)/gmaps-gpx.iife.min.js
	rm -f gmaps-gpx gmaps-gpx.exe

# Show help
help:
	@echo "gmaps-gpx Makefile"
	@echo ""
	@echo "Usage:"
	@echo "  make                 Build everything (CLI + web)"
	@echo "  make build-cli       Build CLI binary for current platform"
	@echo "  make build-web       Build web library (minified IIFE + ESM)"
	@echo "  make build-web-all   Build all web bundle variants"
	@echo "  make serve           Serve web app locally at http://localhost:8000"
	@echo ""
	@echo "GCP Setup (run once):"
	@echo "  make setup-gcp       Create isolated GCP project"
	@echo "  make setup-gcp-apis  Enable required APIs (after linking billing)"
	@echo ""
	@echo "Deployment:"
	@echo "  make create-bucket   Create GCS bucket for static hosting"
	@echo "  make deploy          Deploy web app to Cloud Storage"
	@echo "  make deploy-function Deploy Cloud Function for URL expansion"
	@echo "  make function-url    Show Cloud Function URL"
	@echo "  make delete-function Delete Cloud Function"
	@echo "  make clean           Remove build artifacts"
	@echo ""
	@echo "Options:"
	@echo "  GCS_BUCKET=name       Cloud Storage bucket (default: your-bucket-name)"
	@echo "  FUNCTION_NAME=name    Cloud Function name (default: gmaps-gpx-expand-url)"
	@echo "  GCP_REGION=region     GCP region (default: us-central1)"
	@echo "  GCP_PROJECT=project   GCP project (default: current gcloud config)"
	@echo ""
	@echo "Examples:"
	@echo "  make serve"
	@echo "  make deploy-function GCP_REGION=australia-southeast1"
	@echo "  make deploy GCS_BUCKET=my-gpx-converter"
