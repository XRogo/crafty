const placeholderCanvas = document.createElement('canvas');
placeholderCanvas.width = TILE_SIZE;
placeholderCanvas.height = TILE_SIZE;
const pctx = placeholderCanvas.getContext('2d');
pctx.fillStyle = '#cccccc';
pctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
pctx.strokeStyle = '#999';
pctx.lineWidth = 1;
pctx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
const placeholderBitmap = placeholderCanvas.transferToImageBitmap();
// === KONFIGURACJA ===
const TILE_SIZE = 128;        // 1 tile = 128x128 bloków (z Xaero)
const REGION_SIZE = 512;      // 1 region = 512x512 bloków = 4x4 tile'i
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
let viewX = 0, viewY = 0;  // centrum widoku (bloki)
let zoom = 1;

// === CACHE ===
const tileCache = new Map();     // key: "rx_rz_tx_ty" → ImageBitmap
const loadingRegions = new Set(); // unikamy duplikatów
let loadedCount = 0;

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

    const tileCount = view.getInt32(offset, true); // little-endian
    offset += 4;

    const tiles = [];

    // Czytamy nagłówki
    for (let i = 0; i < tileCount; i++) {
        const dataOffset = view.getInt32(offset, true);
        const dataLength = view.getInt32(offset + 4, true);
        const flags = view.getInt32(offset + 8, true);
        offset += 12;

        if (dataLength === 0) continue;

        const tileX = i % REGION_TILES;
        const tileZ = Math.floor(i / REGION_TILES);

        // Wyciągamy dane pikseli
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
         return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const file = zip.file("region.xaero");
        if (!file) throw new Error("No region.xaero");

        const regionBuffer = await file.async("arraybuffer");
        const tiles = await parseRegionXaero(regionBuffer);

        // Cache'ujemy każdy tile
        tiles.forEach(t => {
            const worldTileX = rx * 4 + t.tileX;  // 4 tile'e na region w X
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

// === RYSOWANIE ===
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const visible = getVisibleRegions();
    visible.forEach(r => loadRegion(r.rx, r.rz));

// Rysuj placeholder dla widocznych, ale niezaładowanych tile'i
 const visibleTiles = getVisibleTiles(); // dodamy tę funkcję niżej
 visibleTiles.forEach(tile => {
    const key = `${tile.rx}_${tile.rz}_${tile.tx}_${tile.tz}`;
    if (!tileCache.has(key)) {
        const screen = worldToScreen(tile.blockX, tile.blockZ);
        const size = TILE_SIZE * zoom;
        ctx.drawImage(placeholderCanvas, screen.x, screen.y, size, size);
    }
});

    // Rysujemy tylko zcache'owane tile'e
    tileCache.forEach((bitmap, key) => {
        const [rx, rz, tx, tz] = key.split('_').map(Number);
        const blockX = rx * REGION_SIZE + tx * TILE_SIZE;
        const blockZ = rz * REGION_SIZE + tz * TILE_SIZE;

        const screen = worldToScreen(blockX, blockZ);
        const size = TILE_SIZE * zoom;

        ctx.drawImage(bitmap, screen.x, screen.y, size, size);
    });

    // Ukryj loading, jeśli coś jest
    if (loadedCount > 0) {
        loadingEl.style.opacity = '0';
        setTimeout(() => loadingEl.style.display = 'none', 500);
    }
}

function getVisibleRegions() {
    const buffer = 1; // ładuj +1 region poza ekranem
    const left = viewX - canvas.width / (2 * zoom) - buffer * REGION_SIZE;
    const right = viewX + canvas.width / (2 * zoom) + buffer * REGION_SIZE;
    const top = viewY - canvas.height / (2 * zoom) - buffer * REGION_SIZE;
    const bottom = viewY + canvas.height / (2 * zoom) + buffer * REGION_SIZE;

    const regions = [];
    const minRx = blockToRegion(left), maxRx = blockToRegion(right);
    const minRz = blockToRegion(top), maxRz = blockToRegion(bottom);

    for (let rx = minRx; rx <= maxRx; rx++) {
        for (let rz = minRz; rz <= maxRz; rz++) {
            regions.push({ rx, rz });
        }
    }
    return regions;
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

function getVisibleTiles() {
    const tiles = [];
    const minX = viewX - canvas.width / (2 * zoom);
    const maxX = viewX + canvas.width / (2 * zoom);
    const minZ = viewY - canvas.height / (2 * zoom);
    const maxZ = viewY + canvas.height / (2 * zoom);

    const startRx = blockToRegion(minX - REGION_SIZE);
    const endRx = blockToRegion(maxX + REGION_SIZE);
    const startRz = blockToRegion(minZ - REGION_SIZE);
    const endRz = blockToRegion(maxZ + REGION_SIZE);

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

// === START ===
draw(); // inicjalne rysowanie (puste + loading)