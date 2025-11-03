// === KONFIGURACJA ===
const TILE_SIZE = 128;
const REGION_SIZE = 512;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 50;
const ZOOM_STEP = 0.1;
const CTRL_ZOOM_STEP = 1;

// === ELEMENTY ===
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const mousePosEl = document.getElementById('mousePos');
const loadingEl = document.getElementById('loading');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// === STAN ===
let viewX = 0, viewY = 0;
let zoom = 1;

// === CACHE ===
const tileCache = new Map();
const loadingRegions = new Set();
let loadedCount = 0;

// === PLACEHOLDER ===
const placeholderImg = new Image();
placeholderImg.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADWSURBVHic7cExAQAAAMKg9U9tCF8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPD8KTAAAEi8L8gAAAAASUVORK5CYII=';

// === POMOCNICZE ===
function blockToRegion(b) { return Math.floor(b / REGION_SIZE); }
function worldToScreen(x, z) {
    return {
        x: (x - viewX) * zoom + canvas.width / 2,
        y: (z - viewY) * zoom + canvas.height / 2
    };
}

// === PARSER region.xaero – BEZPIECZNY, DYNAMYCZNY ===
async function parseRegionXaero(buffer) {
    if (buffer.byteLength < 4) return [];

    const view = new DataView(buffer);
    let offset = 0;
    const tiles = [];

    // Czytamy tileCount
    if (offset + 4 > buffer.byteLength) return [];
    const tileCount = view.getInt32(offset, true);
    offset += 4;

    // Czytamy nagłówki DOPÓKI SIĘ MIĘŚCI
    const headers = [];
    while (offset + 12 <= buffer.byteLength) {
        const dataOffset = view.getInt32(offset, true);
        const dataLength = view.getInt32(offset + 4, true);
        const flags = view.getInt32(offset + 8, true);
        offset += 12;

        // Pomijamy błędne
        if (dataLength <= 0 || dataOffset <= 0) continue;
        if (dataOffset >= buffer.byteLength) continue;
        if (dataOffset + dataLength > buffer.byteLength) continue;
        if (dataLength > 1024 * 1024) continue; // max 1MB na tile

        headers.push({ dataOffset, dataLength, flags });
    }

    // Przetwarzamy każdy poprawny tile
    for (const h of headers) {
        try {
            let pos = h.dataOffset;
            const end = pos + h.dataLength;

            // Paleta: 256 × 4 bajty
            const palette = [];
            for (let i = 0; i < 256 && pos + 4 <= end; i++) {
                palette.push([
                    buffer[pos++], buffer[pos++], buffer[pos++], buffer[pos++]
                ]);
            }

            // RLE
            const pixels = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
            let pi = 0;

            while (pos + 2 <= end && pi < pixels.length) {
                const run = buffer[pos++];
                const idx = buffer[pos++];
                const [r, g, b, a] = palette[idx] || [135, 206, 235, 255];

                for (let i = 0; i < run && pi < pixels.length; i++) {
                    pixels[pi++] = r; pixels[pi++] = g; pixels[pi++] = b; pixels[pi++] = a;
                }
            }

            while (pi < pixels.length) {
                pixels[pi++] = 135; pixels[pi++] = 206; pixels[pi++] = 235; pixels[pi++] = 255;
            }

            const imageData = new ImageData(TILE_SIZE, TILE_SIZE);
            imageData.data.set(pixels);
            const bitmap = await createImageBitmap(imageData);

            // Oblicz tileX/tileZ z dataOffset (przybliżenie)
            const approxIndex = Math.floor((h.dataOffset - 4 - headers.length * 12) / 1000);
            const tileX = approxIndex % 32;
            const tileZ = Math.floor(approxIndex / 32);

            tiles.push({ bitmap, tileX, tileZ });
        } catch (e) {
            continue;
        }
    }

    return tiles;
}

// === ŁADOWANIE REGIONU ===
async function loadRegion(rx, rz) {
    const key = `${rx}_${rz}`;
    if (loadingRegions.has(key)) return;
    loadingRegions.add(key);

    try {
        const response = await fetch(`tiles/${rx}_${rz}.zip`);
        if (!response.ok) {
            loadingRegions.delete(key);
            return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const file = zip.file("region.xaero");
        if (!file) {
            loadingRegions.delete(key);
            return;
        }

        const regionBuffer = await file.async("arraybuffer");
        const tiles = await parseRegionXaero(regionBuffer);

        tiles.forEach((t, i) => {
            // Poprawne tileX/tileZ – heurystyka
            const tileX = i % 4;
            const tileZ = Math.floor(i / 4);
            const worldTileX = rx * 4 + tileX;
            const worldTileZ = rz * 4 + tileZ;
            const tileKey = `${rx}_${rz}_${tileX}_${tileZ}`;
            tileCache.set(tileKey, t.bitmap);
            loadedCount++;
            loadingEl.textContent = `Ładowanie... (${loadedCount} tile'i)`;
        });

        loadingRegions.delete(key);
        draw();
    } catch (e) {
        loadingRegions.delete(key);
    }
}

// === getVisibleTiles, draw, zoom, pan, resize – bez zmian ===
function getVisibleTiles() {
    const tiles = [];
    const buffer = REGION_SIZE * 2;
    const minX = viewX - canvas.width / (2 * zoom) - buffer;
    const maxX = viewX + canvas.width / (2 * zoom) + buffer;
    const minZ = viewY - canvas.height / (2 * zoom) - buffer;
    const maxZ = viewY + canvas.height / (2 * zoom) + buffer;

    for (let rx = blockToRegion(minX); rx <= blockToRegion(maxX); rx++) {
        for (let rz = blockToRegion(minZ); rz <= blockToRegion(maxZ); rz++) {
            for (let tx = 0; tx < 4; tx++) {
                for (let tz = 0; tz < 4; tz++) {
                    const blockX = rx * REGION_SIZE + tx * TILE_SIZE;
                    const blockZ = rz * REGION_SIZE + tz * TILE_SIZE;
                    if (blockX < maxX && blockX + TILE_SIZE > minX && blockZ < maxZ && blockZ + TILE_SIZE > minZ) {
                        tiles.push({ rx, rz, tx, tz, blockX, blockZ });
                    }
                }
            }
        }
    }
    return tiles;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const visible = getVisibleTiles();

    visible.forEach(t => {
        const key = `${t.rx}_${t.rz}_${t.tx}_${t.tz}`;
        if (!tileCache.has(key)) {
            const s = worldToScreen(t.blockX, t.blockZ);
            const size = TILE_SIZE * zoom;
            ctx.drawImage(placeholderImg, s.x, s.y, size, size);
        }
    });

    tileCache.forEach((bitmap, key) => {
        const [rx, rz, tx, tz] = key.split('_').map(Number);
        const blockX = rx * REGION_SIZE + tx * TILE_SIZE;
        const blockZ = rz * REGION_SIZE + tz * TILE_SIZE;
        const s = worldToScreen(blockX, blockZ);
        const size = TILE_SIZE * zoom;
        ctx.drawImage(bitmap, s.x, s.y, size, size);
    });

    const regions = new Set();
    visible.forEach(t => regions.add(`${t.rx}_${t.rz}`));
    regions.forEach(k => {
        const [rx, rz] = k.split('_').map(Number);
        loadRegion(rx, rz);
    });

    if (loadedCount > 0) {
        loadingEl.style.opacity = '0';
        setTimeout(() => loadingEl.style.display = 'none', 500);
    }
}

// === ZOOM ===
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const step = e.ctrlKey ? CTRL_ZOOM_STEP : ZOOM_STEP;
    let newZoom = zoom * delta;
    newZoom = Math.round(newZoom / step) * step;
    newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const wx = (mx - canvas.width / 2) / zoom + viewX;
    const wy = (my - canvas.height / 2) / zoom + viewY;

    zoom = newZoom;
    viewX = wx - (mx - canvas.width / 2) / zoom;
    viewY = wy - (my - canvas.height / 2) / zoom;

    draw();
});

// === PAN ===
let dragging = false, px = 0, py = 0;
canvas.addEventListener('mousedown', e => { dragging = true; px = e.clientX; py = e.clientY; });
canvas.addEventListener('mousemove', e => {
    if (dragging) {
        viewX -= (e.clientX - px) / zoom;
        viewY -= (e.clientY - py) / zoom;
        px = e.clientX; py = e.clientY;
        draw();
    } else {
        const rect = canvas.getBoundingClientRect();
        const x = Math.round((e.clientX - rect.left - canvas.width / 2) / zoom + viewX);
        const z = Math.round((e.clientY - rect.top - canvas.height / 2) / zoom + viewY);
        mousePosEl.textContent = `Pozycja: (${x}, ${z})`;
    }
});
canvas.addEventListener('mouseup', () => dragging = false);
canvas.addEventListener('mouseleave', () => dragging = false);

// === RESIZE ===
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
});

// === START ===
draw();