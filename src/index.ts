#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import sharp from "sharp";
import { z } from "zod";

const TILE_SIZE = 256;
const USER_AGENT = "simple-maps-mcp/1.0.0";

interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Geocoding request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No results found for "${address}"`);
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    formattedAddress: data[0].display_name,
  };
}

function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const xTile = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yTile = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { xTile, yTile };
}

async function fetchTile(x: number, y: number, zoom: number): Promise<Buffer> {
  const url = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Tile fetch failed: ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function buildStaticMap(
  lat: number,
  lng: number,
  zoom: number,
  width: number,
  height: number,
  marker: boolean
): Promise<string> {
  const { xTile, yTile } = latLngToTile(lat, lng, zoom);

  // How many tiles we need in each direction from center
  const tilesX = Math.ceil(width / TILE_SIZE) + 1;
  const tilesY = Math.ceil(height / TILE_SIZE) + 1;

  const centerTileX = Math.floor(xTile);
  const centerTileY = Math.floor(yTile);

  // Pixel offset of the center point within its tile
  const offsetX = Math.round((xTile - centerTileX) * TILE_SIZE);
  const offsetY = Math.round((yTile - centerTileY) * TILE_SIZE);

  const halfTilesX = Math.floor(tilesX / 2);
  const halfTilesY = Math.floor(tilesY / 2);

  // Fetch all needed tiles
  const tilePromises: { x: number; y: number; promise: Promise<Buffer> }[] = [];
  for (let dy = -halfTilesY; dy <= halfTilesY; dy++) {
    for (let dx = -halfTilesX; dx <= halfTilesX; dx++) {
      const tx = centerTileX + dx;
      const ty = centerTileY + dy;
      tilePromises.push({ x: dx, y: dy, promise: fetchTile(tx, ty, zoom) });
    }
  }

  const compositeWidth = (halfTilesX * 2 + 1) * TILE_SIZE;
  const compositeHeight = (halfTilesY * 2 + 1) * TILE_SIZE;

  // Composite all tiles onto a large canvas
  const composites = await Promise.all(
    tilePromises.map(async ({ x, y, promise }) => ({
      input: await promise,
      left: (x + halfTilesX) * TILE_SIZE,
      top: (y + halfTilesY) * TILE_SIZE,
    }))
  );

  let image = sharp({
    create: {
      width: compositeWidth,
      height: compositeHeight,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  })
    .composite(composites)
    .png();

  // Calculate where the center point is in the composite image
  const centerPixelX = halfTilesX * TILE_SIZE + offsetX;
  const centerPixelY = halfTilesY * TILE_SIZE + offsetY;

  // Crop to the requested size, centered on the target location
  const cropLeft = Math.max(0, Math.min(centerPixelX - Math.floor(width / 2), compositeWidth - width));
  const cropTop = Math.max(0, Math.min(centerPixelY - Math.floor(height / 2), compositeHeight - height));

  let cropped = sharp(await image.toBuffer()).extract({
    left: cropLeft,
    top: cropTop,
    width,
    height,
  });

  // Draw a red marker dot at center
  if (marker) {
    const markerX = centerPixelX - cropLeft;
    const markerY = centerPixelY - cropTop;
    const r = 8;
    const svg = `<svg width="${width}" height="${height}">
      <circle cx="${markerX}" cy="${markerY}" r="${r}" fill="red" stroke="white" stroke-width="2"/>
      <circle cx="${markerX}" cy="${markerY}" r="3" fill="white"/>
    </svg>`;
    cropped = sharp(await cropped.toBuffer()).composite([
      { input: Buffer.from(svg), top: 0, left: 0 },
    ]);
  }

  const pngBuffer = await cropped.png().toBuffer();
  return pngBuffer.toString("base64");
}

const server = new McpServer({
  name: "simple-maps-mcp",
  version: "1.0.0",
});

server.tool(
  "generate_static_map",
  "Generate a static map image for a given address using OpenStreetMap",
  {
    address: z.string().describe("Street address or place name to map"),
    zoom: z.number().min(0).max(19).default(15).describe("Zoom level (0-19)"),
    width: z.number().min(1).max(1280).default(600).describe("Image width in pixels"),
    height: z.number().min(1).max(1280).default(400).describe("Image height in pixels"),
    marker: z.boolean().default(true).describe("Show a red pin at the location"),
  },
  async ({ address, zoom, width, height, marker }) => {
    try {
      const { lat, lng, formattedAddress } = await geocodeAddress(address);
      const base64Png = await buildStaticMap(lat, lng, zoom, width, height, marker);

      return {
        content: [
          { type: "image" as const, data: base64Png, mimeType: "image/png" as const },
          { type: "text" as const, text: `Map of '${formattedAddress}' at ${lat}, ${lng}` },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Error: ${message}` }],
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
