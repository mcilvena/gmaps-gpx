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

## Usage

```bash
gmaps-gpx <google-maps-url> -o <output-file>
```

### Examples

Using a full Google Maps URL:
```bash
gmaps-gpx "https://www.google.com/maps/dir/Sydney/Melbourne" -o sydney-melbourne.gpx
```

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output file path for the GPX file (required) |
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
