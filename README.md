# gmaps-gpx

A command-line tool that converts Google Maps route URLs to GPX format. Plan your routes in Google Maps, then export them for use in dedicated navigation apps.

## Motivation

Google Maps is excellent for planning routes with its intuitive interface, traffic data, and extensive POI database. However, many navigation apps (especially for motorcycles, cycling, and hiking) don't integrate with Google Maps directly and instead require GPX files for route import.

This tool bridges that gap by converting Google Maps route URLs (including shortened `maps.app.goo.gl` links) into standard GPX files that can be imported into virtually any navigation app.

## Features

- Expands shortened Google Maps URLs automatically
- Extracts all waypoints from routes (start, via points, end)
- Preserves location names from the original route
- Outputs standard GPX 1.1 format
- Single standalone executable with no runtime dependencies

## Installation

### Pre-built Binary

Download the latest release for your platform from the [Releases](releases) page.

### Build from Source

Requires [Deno](https://deno.land/) 2.0 or later.

```bash
# Clone the repository
git clone https://github.com/yourusername/gmaps-gpx.git
cd gmaps-gpx

# Compile for your current platform
deno compile --allow-net --allow-write --output gmaps-gpx src/main.ts
```

#### Cross-compilation

Build for different platforms:

```bash
# Windows
deno compile --allow-net --allow-write --target x86_64-pc-windows-msvc --output gmaps-gpx.exe src/main.ts

# Linux
deno compile --allow-net --allow-write --target x86_64-unknown-linux-gnu --output gmaps-gpx-linux src/main.ts

# macOS (Intel)
deno compile --allow-net --allow-write --target x86_64-apple-darwin --output gmaps-gpx-macos src/main.ts

# macOS (Apple Silicon)
deno compile --allow-net --allow-write --target aarch64-apple-darwin --output gmaps-gpx-macos-arm src/main.ts
```

### Web Library

A browser-compatible JavaScript bundle is available for use in web applications. Download `gmaps-gpx-web.zip` from the [Releases](releases) page.

**Using ES Modules:**
```html
<script type="module">
  import { convertToGpx, parseGoogleMapsUrl, generateGpx } from './gmaps-gpx.esm.min.js';

  const result = await convertToGpx('https://www.google.com/maps/dir/Sydney/Melbourne', {
    routeName: 'My Trip'
  });
  console.log(result.gpx);
  console.log(result.suggestedFilename);
</script>
```

**Using script tag (IIFE):**
```html
<script src="gmaps-gpx.iife.min.js"></script>
<script>
  GmapsGpx.convertToGpx('https://www.google.com/maps/dir/Sydney/Melbourne')
    .then(result => {
      console.log(result.gpx);
    });
</script>
```

#### Building Web Bundle

```bash
# Install esbuild
npm install -g esbuild

# Build ESM bundle
esbuild src/lib.ts --bundle --format=esm --minify --outfile=dist/gmaps-gpx.esm.min.js

# Build IIFE bundle (for script tags)
esbuild src/lib.ts --bundle --format=iife --global-name=GmapsGpx --minify --outfile=dist/gmaps-gpx.iife.min.js
```

### Web App

A ready-to-use web interface is included in the `web/` directory.

```bash
# Build and serve locally
make serve

# Deploy to GCP Cloud Storage
make create-bucket GCS_BUCKET=my-gpx-converter
make deploy GCS_BUCKET=my-gpx-converter

# Deploy Cloud Function for shortened URL support
make deploy-function GCP_REGION=us-central1
# Then update web/config.js with the function URL
```

The web app files:
- `index.html` - The single-page application
- `config.js` - Configuration (Cloud Function URL)
- `gmaps-gpx.iife.min.js` - The conversion library

## Usage

```bash
gmaps-gpx <google-maps-url> [options]
```

### Examples

```bash
# Basic usage (outputs to route-<timestamp>.gpx)
gmaps-gpx "https://www.google.com/maps/dir/Sydney/Melbourne"

# With custom route name (outputs to weekend-trip-<timestamp>.gpx)
gmaps-gpx "https://www.google.com/maps/dir/Sydney/Melbourne" -n "Weekend Trip"

# With explicit output file
gmaps-gpx "https://www.google.com/maps/dir/Sydney/Melbourne" -o sydney-melbourne.gpx
```

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output file path (default: `route-<timestamp>.gpx`) |
| `-n, --name <name>` | Set the route name in the GPX file. Also sets output filename to `<name-slug>-<timestamp>.gpx` |
| `-h, --help` | Show help message |

## Compatible Applications

This tool was originally created for use with **BMW Motorrad Connected App** navigation, but the generated GPX files are compatible with many popular navigation apps:

### Motorcycle Navigation
- **BMW Motorrad Connected** - The official BMW motorcycle navigation app
- **Scenic** - Popular motorcycle touring app with offline maps
- **Rever** - Motorcycle route planning and tracking
- **Garmin Zumo series** - Dedicated motorcycle GPS units
- **TomTom Rider** - Motorcycle-specific GPS navigation

### Cycling
- **Komoot** - Route planning with turn-by-turn navigation
- **Strava** - Popular fitness tracking with route import
- **Ride with GPS** - Cycling computer with navigation
- **BikeGPX** - Free cycling navigation app
- **Wahoo ELEMNT** - Cycling GPS computers

### Hiking & Outdoor
- **Gaia GPS** - Comprehensive outdoor navigation
- **AllTrails** - Hiking and trail navigation
- **OsmAnd** - Offline maps with GPX support
- **Locus Map** - Advanced outdoor navigation for Android

### General Navigation
- **HERE WeGo** - Free offline navigation
- **GPX Viewer 2** - Universal GPX file viewer
- **Garmin Connect** - Import routes to Garmin devices
- **Basecamp** - Garmin's desktop route planning software

## How It Works

1. The tool fetches the Google Maps URL (expanding shortened URLs if needed)
2. Parses the URL to extract embedded coordinate data
3. Identifies waypoints including start, via points, and destination
4. Generates a GPX file with track points (`<trkpt>`) in a track segment

## Dependencies

- **Runtime**: None (standalone compiled binary)
- **Build**: [Deno](https://deno.land/) 2.0+

### Deno Installation

**Windows (PowerShell)**:
```powershell
irm https://deno.land/install.ps1 | iex
```

**macOS/Linux**:
```bash
curl -fsSL https://deno.land/install.sh | sh
```

## Limitations

- Only extracts waypoints that are embedded in the URL data parameter
- Does not include the actual turn-by-turn route geometry (only waypoints)
- Some very long routes may have truncated coordinate data in the URL

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
