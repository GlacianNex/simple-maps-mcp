# simple-maps-mcp

An MCP (Model Context Protocol) server that generates static map images for any address or place name. Powered by **OpenStreetMap** -- completely free, no API key required.

![MCP Compatible](https://img.shields.io/badge/MCP-compatible-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

## What It Does

Give it an address, get back a map image. That's it.

The server geocodes the address using [Nominatim](https://nominatim.openstreetmap.org/) (OpenStreetMap's geocoding service), fetches the relevant map tiles from OpenStreetMap, stitches them together using [sharp](https://sharp.pixelplumbing.com/), and returns a PNG image with an optional location marker.

## Features

- **No API key required** -- uses OpenStreetMap and Nominatim (both free and open)
- **Returns actual images** -- base64-encoded PNG delivered as an MCP image content block
- **Configurable** -- zoom level, image dimensions, and marker visibility
- **Lightweight** -- single-file server with minimal dependencies
- **Works with any MCP client** -- Claude Desktop, Claude Code, or any MCP-compatible application

## Installation

### Prerequisites

- **Node.js 18+** (uses built-in `fetch`)

### Build from Source

```bash
git clone https://github.com/GlacianNex/simple-maps-mcp.git
cd simple-maps-mcp
npm install
npm run build
```

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json` (typically at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "simple-maps-mcp": {
      "command": "node",
      "args": ["/path/to/simple-maps-mcp/dist/index.js"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add simple-maps-mcp --transport stdio -- node /path/to/simple-maps-mcp/dist/index.js
```

Or add manually to `~/.claude.json`:

```json
{
  "mcpServers": {
    "simple-maps-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/simple-maps-mcp/dist/index.js"]
    }
  }
}
```

After configuring, restart your MCP client.

## Tool Reference

### `generate_static_map`

Generate a static map image for a given address using OpenStreetMap.

#### Parameters

| Parameter | Type    | Required | Default    | Description                        |
|-----------|---------|----------|------------|------------------------------------|
| `address` | string  | Yes      | --         | Street address or place name       |
| `zoom`    | number  | No       | `15`       | Zoom level (`0`-`19`)              |
| `width`   | number  | No       | `600`      | Image width in pixels (max `1280`) |
| `height`  | number  | No       | `400`      | Image height in pixels (max `1280`)|
| `marker`  | boolean | No       | `true`     | Show a red pin at the location     |

#### Zoom Level Guide

| Zoom | View              |
|------|-------------------|
| 0-3  | Continent / World |
| 4-6  | Country           |
| 7-10 | City / Region     |
| 11-14| Neighborhood      |
| 15-17| Streets           |
| 18-19| Buildings         |

#### Response

Returns two content blocks:

1. **Image** -- PNG map image (base64-encoded)
2. **Text** -- Resolved address and coordinates, e.g. `Map of '1600 Amphitheatre Parkway, Mountain View, CA' at 37.422, -122.084`

#### Example Usage

Once configured, just ask your AI assistant:

> "Show me a map of the Eiffel Tower"

> "Generate a satellite-level map of 1600 Amphitheatre Parkway, Mountain View, CA at zoom level 17"

> "Map of Tokyo Tower with a 1280x1280 image"

## How It Works

1. **Geocoding** -- The address is sent to Nominatim (OpenStreetMap's geocoding API) to resolve latitude/longitude coordinates
2. **Tile Fetching** -- The required OpenStreetMap tiles are calculated and fetched in parallel based on the coordinates and zoom level
3. **Image Stitching** -- Tiles are composited onto a canvas using `sharp`, then cropped to the exact requested dimensions, centered on the target location
4. **Marker Rendering** -- If enabled, a red pin with a white border is drawn at the target coordinates via SVG overlay
5. **Response** -- The final PNG is base64-encoded and returned as an MCP image content block

## Rate Limiting

This server uses free OpenStreetMap services. Please respect their usage policies:

- **Nominatim**: Max 1 request per second ([usage policy](https://operations.osmfoundation.org/policies/nominatim/))
- **OSM Tiles**: Moderate usage expected ([tile usage policy](https://operations.osmfoundation.org/policies/tiles/))

For heavy usage, consider hosting your own Nominatim instance and tile server.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run directly
node dist/index.js

# Test tool listing
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```

## Tech Stack

- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) -- MCP server framework
- [sharp](https://sharp.pixelplumbing.com/) -- High-performance image processing
- [Nominatim](https://nominatim.openstreetmap.org/) -- Geocoding
- [OpenStreetMap](https://www.openstreetmap.org/) -- Map tiles

## License

MIT
