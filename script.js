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

// === FUNKCJE ===
function blockToRegion(b) { return Math.floor(b / REGION_SIZE); }
function worldToScreen(x, z) {
    return {
        x: (x - viewX) * zoom + canvas.width / 2,
        y: (z - viewY) * zoom + canvas.height / 2
    };
}

// === POPRAWNY PARSER region.xaero ===
async function parseRegionXaero(buffer) {
    const view = new DataView(buffer);
    let offset = 0;

    const tileCount = view.getInt32(offset, true);
    offset += 4;

    const headers = [];
    for (let i = 0; i < tileCount; i++) {
        const dataOffset = view.getInt32(offset, true);
        const dataLength = view.getInt32(offset + 4, true);
        const flags = view.getInt32(offset + 8, true);
        offset += 12;

        if (dataLength === 0 || dataOffset === 0) continue;
        if (dataLength > 2 * 1024 * 1024) continue; // zabezpieczenie

        headers.push({ dataOffset, dataLength, flags, index: i });
    }

    const tiles = [];
    for (const h of headers) {
        const tileX = h.index % 32;
        const tileZ = Math.floor(h.index / 32);

        let pos = h.dataOffset;
        const end = pos + h.dataLength;

        // Paleta
        const palette = [];
        for (let i = 0; i < 256 && pos + 4 <= end; i++) {
            palette.push([buffer[pos++], buffer[pos++], buffer[pos++], buffer[pos++]]);
        }

        // RLE
        const pixels = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
        let pi = 0;

        while (pos < end && pi < pixels.length) {
            const run = buffer[pos++];
            const idx = buffer[pos++];
            const [r, g, b, a] = palette[idx] || [135, 206, 235, 255]; // niebo

            for (let i = 0; i < run && pi < pixels.length; i++) {
                pixels[pi++] = r; pixels[pi++] = g; pixels[pi++] = b; pixels[pi++] = a;
            }
        }

        // Uzupełnij
        while (pi < pixels.length) {
            pixels[pi++] = 135; pixels[pi++] = 206; pixels[pi++] = 235; pixels[pi++] = 255;
        }

        const imageData = new ImageData(TILE_SIZE, TILE_SIZE);
        imageData.data.set(pixels);
        const bitmap = await createImageBitmap(imageData);
        tiles.push({ bitmap, tileX, tileZ });
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
            console.warn(`Brak: tiles/${rx}_${rz}.zip`);
            loadingRegions.delete(key);
            return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const file = zip.file("region.xaero");
        if (!file) throw new Error("No region.xaero");

        const regionBuffer = await file.async("arraybuffer");
        const tiles = await parseRegionXaero(regionBuffer);

        tiles.forEach(t => {
            const worldTileX = rx * 4 + t.tileX;
            const worldTileZ = rz * 4 + t.tileZ;
            const tileKey = `${rx}_${rz}_${t.tileX}_${t.tileZ}`;
            tileCache.set(tileKey, t.bitmap);
            loadedCount++;
            loadingEl.textContent = `Ładowanie... (${loadedCount} tile'i)`;
        });

        loadingRegions.delete(key);
        draw();
    } catch (e) {
        console.warn(`Błąd regionu ${rx}_${rz}:`, e);
        loadingRegions.delete(key);
    }
}

// === getVisibleTiles, draw, zoom, pan, resize – bez zmian ===

// === WIDOCZNE TILE'E ===
function getVisibleTiles() {
    const tiles = [];
    const buffer = REGION_SIZE;
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

// === RYSOWANIE ===
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const visible = getVisibleTiles();

    // Placeholder
    visible.forEach(t => {
        const key = `${t.rx}_${t.rz}_${t.tx}_${t.tz}`;
        if (!tileCache.has(key)) {
            const s = worldToScreen(t.blockX, t.blockZ);
            const size = TILE_SIZE * zoom;
            ctx.drawImage(placeholderImg, s.x, s.y, size, size);
        }
    });

    // Rzeczywiste tile'e
    tileCache.forEach((bitmap, key) => {
        const [rx, rz, tx, tz] = key.split('_').map(Number);
        const blockX = rx * REGION_SIZE + tx * TILE_SIZE;
        const blockZ = rz * REGION_SIZE + tz * TILE_SIZE;
        const s = worldToScreen(blockX, blockZ);
        const size = TILE_SIZE * zoom;
        ctx.drawImage(bitmap, s.x, s.y, size, size);
    });

    // Ładuj regiony w tle
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