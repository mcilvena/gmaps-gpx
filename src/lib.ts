/**
 * gmaps-gpx library - Core functions for converting Google Maps URLs to GPX
 * This module is browser-compatible and has no Deno-specific dependencies.
 */

export interface Coordinate {
  lat: number;
  lng: number;
  name?: string;
}

export interface RouteData {
  waypoints: Coordinate[];
  routeName: string;
}

/**
 * Convert a string to a URL-friendly slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generate a timestamp string for filenames (YYYYMMDD-HHMMSS)
 */
export function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Generate output filename based on route name or default
 */
export function generateOutputFilename(routeName?: string): string {
  const timestamp = getTimestamp();
  if (routeName) {
    return `${slugify(routeName)}-${timestamp}.gpx`;
  }
  return `route-${timestamp}.gpx`;
}

/**
 * Expand a shortened Google Maps URL to its full form
 */
export async function expandUrl(shortUrl: string): Promise<string> {
  const response = await fetch(shortUrl, {
    method: "HEAD",
    redirect: "follow",
  });
  return response.url;
}

/**
 * Extract coordinates from a Google Maps URL
 */
export function parseGoogleMapsUrl(url: string): RouteData {
  const waypoints: Coordinate[] = [];
  let routeName = "Google Maps Route";

  // Handle different Google Maps URL formats
  const urlObj = new URL(url);

  // Format 1: /dir/ URLs with waypoints
  // Example: https://www.google.com/maps/dir/Start/End/@lat,lng,zoom
  // Each path segment is either a place name or a dropped pin ("lat,lng").
  const pathStops: Coordinate[] = [];
  const dirMatch = url.match(/\/maps\/dir\/([^@?]+)/);
  if (dirMatch) {
    const locations = dirMatch[1]
      .split("/")
      .filter((s) => s.trim() !== "" && !s.startsWith("data="));

    for (const loc of locations) {
      // Check if it's a coordinate pair
      const coordMatch = loc.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
      if (coordMatch) {
        pathStops.push({
          lat: parseFloat(coordMatch[1]),
          lng: parseFloat(coordMatch[2]),
        });
      } else {
        // A place name - its coordinates come from the data parameter
        pathStops.push({
          lat: NaN,
          lng: NaN,
          name: decodeURIComponent(loc.replace(/\+/g, " ")),
        });
      }
    }
  }
  const locationNames = pathStops
    .filter((s) => s.name !== undefined)
    .map((s) => s.name as string);

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

  // Data parameter contains encoded coordinates, in route order:
  // !2m2!1d[lng]!2d[lat] - coordinates of a named place
  // !1m2!1d[lng]!2d[lat] - via point (from dragging the route)
  // Dropped pins are not encoded here; they only appear in the path.
  const dataCoords: { lat: number; lng: number; via: boolean }[] = [];
  if (dataParam) {
    const coordRegex = /!(\d+)m2!1d(-?\d+\.?\d*)!2d(-?\d+\.?\d*)/g;
    let match;
    while ((match = coordRegex.exec(dataParam)) !== null) {
      dataCoords.push({
        lat: parseFloat(match[3]),
        lng: parseFloat(match[2]),
        via: match[1] !== "2",
      });
    }
  }

  const genericName = (i: number) =>
    i === 0 ? "Start" : i === dataCoords.length - 1 ? "End" : `Via ${i}`;
  const places = dataCoords.filter((c) => !c.via);
  // Only trust the path's place names if they line up one-to-one with the
  // places in the data; otherwise fall back to generic names
  const namesAligned = places.length === locationNames.length;

  if (dataCoords.length > 0) {
    // Merge path and data in route order: named places take their
    // coordinates from the data, dropped pins keep their path coordinates,
    // and via points are inserted where they occur.
    let next = 0;
    let viaCount = 0;
    const emitDroppedPins = () => {
      while (next < pathStops.length && pathStops[next].name === undefined) {
        waypoints.push(pathStops[next++]);
      }
    };

    dataCoords.forEach((coord, i) => {
      if (coord.via) {
        viaCount++;
        waypoints.push({
          lat: coord.lat,
          lng: coord.lng,
          name: namesAligned ? `Via ${viaCount}` : genericName(i),
        });
        return;
      }
      // Via points belong to the leg leaving the previous stop, so dropped
      // pins are only placed once the next named place is reached
      emitDroppedPins();
      const stop = next < pathStops.length ? pathStops[next++] : undefined;
      waypoints.push({
        lat: coord.lat,
        lng: coord.lng,
        name: namesAligned && stop ? stop.name : genericName(i),
      });
    });
    emitDroppedPins();
  } else {
    // No data parameter - only dropped pins in the path have coordinates
    waypoints.push(...pathStops.filter((s) => s.name === undefined));
  }

  // Format 2: Place URL with coordinates in path
  // Example: https://www.google.com/maps/place/.../@lat,lng,zoom
  // Skipped for /dir/ URLs, where @ is just the map viewport centre.
  const placeCoordMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (placeCoordMatch && waypoints.length === 0 && !dirMatch) {
    waypoints.push({
      lat: parseFloat(placeCoordMatch[1]),
      lng: parseFloat(placeCoordMatch[2]),
    });
  }

  // Filter out waypoints without valid coordinates
  const validWaypoints = waypoints.filter((w) => w.lat !== 0 || w.lng !== 0);

  if (validWaypoints.length === 0) {
    if (locationNames.length > 0) {
      throw new Error(
        "This URL only contains place names, not coordinates. " +
          "Open the route in Google Maps and copy the full URL from the " +
          "address bar, or use the Share link (maps.app.goo.gl).",
      );
    }
    throw new Error(
      "Could not extract coordinates from the Google Maps URL. " +
        "The URL format may not be supported or the route data is not accessible.",
    );
  }

  // Generate route name from waypoint names if available
  if (locationNames.length >= 2) {
    routeName = `${locationNames[0]} to ${
      locationNames[locationNames.length - 1]
    }`;
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
export function generateGpx(
  routeData: RouteData,
  customRouteName?: string,
): string {
  const { waypoints } = routeData;
  const routeName = customRouteName || routeData.routeName;

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
 * Convert a Google Maps URL to GPX format
 * This is the main high-level function for library consumers.
 */
export async function convertToGpx(
  googleMapsUrl: string,
  options: { routeName?: string } = {},
): Promise<{ gpx: string; routeData: RouteData; suggestedFilename: string }> {
  // Expand shortened URLs
  let fullUrl = googleMapsUrl;
  if (
    googleMapsUrl.includes("goo.gl") ||
    googleMapsUrl.includes("maps.app.goo.gl")
  ) {
    fullUrl = await expandUrl(googleMapsUrl);
  }

  // Parse the URL and extract coordinates
  const routeData = parseGoogleMapsUrl(fullUrl);

  // Generate GPX
  const gpx = generateGpx(routeData, options.routeName);

  // Generate suggested filename
  const suggestedFilename = generateOutputFilename(
    options.routeName || routeData.routeName,
  );

  return { gpx, routeData, suggestedFilename };
}
