// === KONFIGURACJA (na samej górze!) ===
const TILE_SIZE = 128;        // 1 tile = 128x128 bloków
const REGION_SIZE = 512;      // 1 region = 512x512 bloków
const REGION_TILES = 32;      // 32x32 tile'i w region.xaero
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

// === STAN MAPY ===
let viewX = 0, viewY = 0;
let zoom = 1;

// === CACHE ===
const tileCache = new Map();
const loadingRegions = new Set();
let loadedCount = 0;

// === PLACEHOLDER (szary kafelek) ===
const placeholderCanvas = document.createElement('canvas');
placeholderCanvas.width = TILE_SIZE;
placeholderCanvas.height = TILE_SIZE;
const pctx = placeholderCanvas.getContext('2d');
pctx.fillStyle = '#cccccc';
pctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
pctx.strokeStyle = '#999999';
pctx.lineWidth = 1;
pctx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
const placeholderBitmap = placeholderCanvas.transferToImageBitmap();

// === FUNKCJE POMOCNICZE ===
function blockToRegion(block) { return Math.floor(block / REGION_SIZE); }
function blockToTile(block) { return Math.floor((block % REGION_SIZE) / TILE_SIZE); }

function worldToScreen(x, z) {
    return {
        x: (x - viewX) * zoom + canvas.width / 2,
        y: (z - viewY) * zoom + canvas.height / 2
    };
}

// === PARSER region.xaero ===
async function parseRegionXaero(buffer) {
    const view = new DataView(buffer);
    let offset = 0;

    const tileCount = view.getInt32(offset, true);
    offset += 4;

    const tiles = [];

    for (let i = 0; i < tileCount; i++) {
        const dataOffset = view.getInt32(offset, true);
        const dataLength = view.getInt32(offset + 4, true);
        const flags = view.getInt32(offset + 8, true);
        offset += 12;

        if (dataLength === 0) continue;

        const tileX = i % REGION_TILES;
        const tileZ = Math.floor(i / REGION_TILES);

        // RGBA data
        const pixelData = new Uint8ClampedArray(buffer, dataOffset, dataLength);
        const imageData = new ImageData(TILE_SIZE, TILE_SIZE);
        imageData.data.set(pixelData);

        const bitmap = await createImageBitmap(imageData);
        tiles.push({ bitmap, tileX, tileZ });
    }

    return tiles;
}

// === ŁADOWANIE REGIONU ===
async function loadRegion(rx, rz) {
    const key = `${rx}_${rz}`;
    if (loadingRegions.has(key) || tileCache.has(key)) return;
    loadingRegions.add(key);

    try {
        const response = await fetch(`tiles/${rx}_${rz}.zip`);
        if (!response.ok) {
            console.warn(`Brak pliku: tiles/${rx}_${rz}.zip`);
            loadingRegions.delete(key);
            return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const file = zip.file("region.xaero");
        if (!file) {
            console.warn(`Brak region.xaero w ${rx}_${rz}.zip`);
            loadingRegions.delete(key);
            return;
        }

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
        console.warn(`Błąd ładowania regionu ${rx}_${rz}:`, e);
        loadingRegions.delete(key);
    }
}

// === WIDOCZNE TILE'E (dla placeholderów) ===
function getVisibleTiles() {
    const tiles = [];
    const minX = viewX - canvas.width / (2 * zoom) - REGION_SIZE;
    const maxX = viewX + canvas.width / (2 * zoom) + REGION_SIZE;
    const minZ = viewY - canvas.height / (2 * zoom) - REGION_SIZE;
    const maxZ = viewY + canvas.height / (2 * zoom) + REGION_SIZE;

    const startRx = blockToRegion(minX);
    const endRx = blockToRegion(maxX);
    const startRz = blockToRegion(minZ);
    const endRz = blockToRegion(maxZ);

    for (let rx = startRx; rx <= endRx; rx++) {
        for (let rz = startRz; rz <= endRz; rz++) {
            for (let tx = 0; tx < 4; tx++) {
                for (let tz = 0; tz < 4; tz++) {
                    const blockX = rx * REGION_SIZE + tx * TILE_SIZE;
                    const blockZ = rz * REGION_SIZE + tz * TILE_SIZE;
                    if (blockX + TILE_SIZE > minX && blockX < maxX && blockZ + TILE_SIZE > minZ && blockZ < maxZ) {
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

    const visibleTiles = getVisibleTiles();

    // Placeholder dla niezaładowanych
    visibleTiles.forEach(tile => {
        const key = `${tile.rx}_${tile.rz}_${tile.tx}_${tile.tz}`;
        if (!tileCache.has(key)) {
            const screen = worldToScreen(tile.blockX, tile.blockZ);
            const size = TILE_SIZE * zoom;
            ctx.drawImage(placeholderCanvas, screen.x, screen.y, size, size);
        }
    });

    // Rysuj załadowane tile'e
    tileCache.forEach((bitmap, key) => {
        const [rx, rz, tx, tz] = key.split('_').map(Number);
        const blockX = rx * REGION_SIZE + tx * TILE_SIZE;
        const blockZ = rz * REGION_SIZE + tz * TILE_SIZE;

        const screen = worldToScreen(blockX, blockZ);
        const size = TILE_SIZE * zoom;

        ctx.drawImage(bitmap, screen.x, screen.y, size, size);
    });

    // Ładuj regiony w tle
    const regions = new Set();
    visibleTiles.forEach(t => regions.add(`${t.rx}_${t.rz}`));
    regions.forEach(key => {
        const [rx, rz] = key.split('_').map(Number);
        loadRegion(rx, rz);
    });

    // Ukryj loading po chwili
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
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldBeforeX = (mouseX - canvas.width / 2) / zoom + viewX;
    const worldBeforeY = (mouseY - canvas.height / 2) / zoom + viewY;

    zoom = newZoom;

    const worldAfterX = (mouseX - canvas.width / 2) / zoom + viewX;
    const worldAfterY = (mouseY - canvas.height / 2) / zoom + viewY;

    viewX += worldBeforeX - worldAfterX;
    viewY += worldBeforeY - worldAfterY;

    draw();
});

// === PAN ===
let isDragging = false, lastX, lastY;
canvas.addEventListener('mousedown', e => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
canvas.addEventListener('mousemove', e => {
    if (isDragging) {
        const dx = (e.clientX - lastX) / zoom;
        const dy = (e.clientY - lastY) / zoom;
        viewX -= dx;
        viewY -= dy;
        lastX = e.clientX; lastY = e.clientY;
        draw();
    } else {
        const rect = canvas.getBoundingClientRect();
        const mx = Math.round((e.clientX - rect.left - canvas.width / 2) / zoom + viewX);
        const mz = Math.round((e.clientY - rect.top - canvas.height / 2) / zoom + viewY);
        mousePosEl.textContent = `Pozycja: (${mx}, ${mz})`;
    }
});
canvas.addEventListener('mouseup', () => isDragging = false);
canvas.addEventListener('mouseleave', () => isDragging = false);

// === RESIZE ===
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
});

// === START ===
draw(); // inicjalne rysowanie