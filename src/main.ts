#!/usr/bin/env -S deno run --allow-net --allow-write

import { parseArgs } from "jsr:@std/cli@1/parse-args";

interface Coordinate {
  lat: number;
  lng: number;
  name?: string;
}

interface RouteData {
  waypoints: Coordinate[];
  routeName: string;
}

/**
 * Expand a shortened Google Maps URL to its full form
 */
async function expandUrl(shortUrl: string): Promise<string> {
  const response = await fetch(shortUrl, {
    method: "HEAD",
    redirect: "follow",
  });
  return response.url;
}

/**
 * Extract coordinates from a Google Maps URL
 */
function parseGoogleMapsUrl(url: string): RouteData {
  const waypoints: Coordinate[] = [];
  let routeName = "Google Maps Route";
  const locationNames: string[] = [];

  // Handle different Google Maps URL formats
  const urlObj = new URL(url);

  // Format 1: /dir/ URLs with waypoints
  // Example: https://www.google.com/maps/dir/Start/End/@lat,lng,zoom
  const dirMatch = url.match(/\/maps\/dir\/([^@]+)/);
  if (dirMatch) {
    const pathPart = dirMatch[1];
    const locations = pathPart.split("/").filter((s) => s.trim() !== "");

    for (const loc of locations) {
      // Check if it's a coordinate pair
      const coordMatch = loc.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
      if (coordMatch) {
        waypoints.push({
          lat: parseFloat(coordMatch[1]),
          lng: parseFloat(coordMatch[2]),
        });
      } else {
        // It's a place name - save it for later
        locationNames.push(decodeURIComponent(loc.replace(/\+/g, " ")));
      }
    }
  }

  // Try to extract coordinates from the data parameter (contains encoded route info)
  // The data can be in the query string OR in the URL path as /data=...
  let dataParam = urlObj.searchParams.get("data");

  // Check if data is in the path (e.g., /data=!3m1!4b1...)
  if (!dataParam) {
    const dataPathMatch = url.match(/\/data=([^?]+)/);
    if (dataPathMatch) {
      dataParam = decodeURIComponent(dataPathMatch[1]);
    }
  }

  if (dataParam) {
    // Data parameter contains encoded waypoint coordinates in various formats:
    // !2m2!1d[lng]!2d[lat] - destination/waypoint coordinates
    // !1m2!1d[lng]!2d[lat] - via point coordinates
    // The pattern is always !1d[lng]!2d[lat] for the actual numbers

    // Find all !1d[lng]!2d[lat] patterns
    const coordRegex = /!1d(-?\d+\.?\d*)!2d(-?\d+\.?\d*)/g;
    let match;
    const dataCoords: Coordinate[] = [];
    while ((match = coordRegex.exec(dataParam)) !== null) {
      dataCoords.push({
        lat: parseFloat(match[2]),
        lng: parseFloat(match[1]),
      });
    }

    if (dataCoords.length > 0) {
      // Clear any waypoints from the @ coordinate since we have better data
      waypoints.length = 0;

      // Use all coordinates from the data parameter
      // The first and last are typically start/end, middle ones are via points
      for (let i = 0; i < dataCoords.length; i++) {
        const name = i < locationNames.length ? locationNames[i] :
                     (i === 0 ? "Start" :
                      i === dataCoords.length - 1 ? "End" : `Via ${i}`);
        waypoints.push({
          lat: dataCoords[i].lat,
          lng: dataCoords[i].lng,
          name: name,
        });
      }
    }
  }

  // Format 2: Place URL with coordinates in path
  // Example: https://www.google.com/maps/place/.../@lat,lng,zoom
  const placeCoordMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (placeCoordMatch && waypoints.length === 0) {
    waypoints.push({
      lat: parseFloat(placeCoordMatch[1]),
      lng: parseFloat(placeCoordMatch[2]),
    });
  }

  // Filter out waypoints without valid coordinates
  const validWaypoints = waypoints.filter((w) => w.lat !== 0 || w.lng !== 0);

  if (validWaypoints.length === 0) {
    throw new Error(
      "Could not extract coordinates from the Google Maps URL. " +
        "The URL format may not be supported or the route data is not accessible."
    );
  }

  // Generate route name from waypoint names if available
  if (locationNames.length >= 2) {
    routeName = `${locationNames[0]} to ${locationNames[locationNames.length - 1]}`;
  } else if (validWaypoints.length >= 2) {
    const first = validWaypoints[0].name || "Start";
    const last = validWaypoints[validWaypoints.length - 1].name || "End";
    routeName = `${first} to ${last}`;
  }

  return { waypoints: validWaypoints, routeName };
}

/**
 * Generate GPX XML from route data
 */
function generateGpx(routeData: RouteData): string {
  const { waypoints, routeName } = routeData;
  const timestamp = new Date().toISOString();

  const escapeXml = (str: string): string => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="gmaps-gpx"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <trk>
    <name>${escapeXml(routeName)}</name>
    <trkseg>
`;
  waypoints.forEach((wp, index) => {
    const name = wp.name || `Waypoint ${index + 1}`;
    gpx += `      <trkpt lat="${wp.lat}" lon="${wp.lng}">
        <name>${escapeXml(name)}</name>
      </trkpt>
`;
  });
  gpx += `    </trkseg>
  </trk>
</gpx>
`;

  return gpx;
}

/**
 * Display usage information
 */
function printUsage(): void {
  console.log(`
gmaps-gpx - Convert Google Maps route URLs to GPX format

USAGE:
  gmaps-gpx <google-maps-url> -o <output-file>

OPTIONS:
  -o, --output <path>   Output file path for the GPX file (required)
  -h, --help            Show this help message

EXAMPLES:
  gmaps-gpx "https://www.google.com/maps/dir/Sydney/Melbourne" -o route.gpx
  gmaps-gpx "https://www.google.com/maps/dir/..." --output my-route.gpx
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs(Deno.args, {
    string: ["output", "o"],
    boolean: ["help", "h"],
    alias: {
      o: "output",
      h: "help",
    },
  });

  if (args.help || args.h) {
    printUsage();
    Deno.exit(0);
  }

  const url = args._[0] as string | undefined;
  const outputPath = args.output || args.o;

  if (!url) {
    console.error("Error: No Google Maps URL provided.");
    printUsage();
    Deno.exit(1);
  }

  if (!outputPath) {
    console.error("Error: No output file specified. Use -o <path> to specify output file.");
    printUsage();
    Deno.exit(1);
  }

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

    // Generate GPX
    const gpxContent = generateGpx(routeData);

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
