#!/usr/bin/env -S deno run --allow-net --allow-write

import { parseArgs } from "@std/cli/parse-args";
import {
  expandUrl,
  generateGpx,
  generateOutputFilename,
  parseGoogleMapsUrl,
} from "./lib.ts";

/**
 * Display usage information
 */
function printUsage(): void {
  console.log(`
gmaps-gpx - Convert Google Maps route URLs to GPX format

USAGE:
  gmaps-gpx <google-maps-url> [options]

OPTIONS:
  -o, --output <path>   Output file path (default: route-<timestamp>.gpx)
  -n, --name <name>     Set the route name in the GPX file
                        Also sets output filename to <name-slug>-<timestamp>.gpx
  -h, --help            Show this help message

EXAMPLES:
  gmaps-gpx "https://www.google.com/maps/dir/Sydney/Melbourne"
  gmaps-gpx "https://maps.app.goo.gl/..." -n "Weekend Trip"
  gmaps-gpx "https://maps.app.goo.gl/..." -o custom-output.gpx
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs(Deno.args, {
    string: ["output", "o", "name", "n"],
    boolean: ["help", "h"],
    alias: {
      o: "output",
      h: "help",
      n: "name",
    },
  });

  if (args.help || args.h) {
    printUsage();
    Deno.exit(0);
  }

  const url = args._[0] as string | undefined;
  const customOutput = args.output || args.o;
  const routeName = args.name || args.n;

  if (!url) {
    console.error("Error: No Google Maps URL provided.");
    printUsage();
    Deno.exit(1);
  }

  // Generate output path: use custom if provided, otherwise generate from name or default
  const outputPath = customOutput || generateOutputFilename(routeName);

  try {
    console.log("Fetching route data...");

    // Expand shortened URLs
    let fullUrl = url;
    if (url.includes("goo.gl") || url.includes("maps.app.goo.gl")) {
      console.log("Expanding shortened URL...");
      fullUrl = await expandUrl(url);
      console.log(`Expanded URL: ${fullUrl}`);
    }

    // Parse the URL and extract coordinates
    const routeData = parseGoogleMapsUrl(fullUrl);
    console.log(`Found ${routeData.waypoints.length} waypoint(s)`);

    // Generate GPX (use custom route name if provided)
    const gpxContent = generateGpx(routeData, routeName);

    // Write to file
    await Deno.writeTextFile(outputPath, gpxContent);
    console.log(`GPX file saved to: ${outputPath}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unexpected error occurred.");
    }
    Deno.exit(1);
  }
}

main();
