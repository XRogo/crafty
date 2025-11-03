// === KONFIGURACJA ===
const TILE_SIZES = [256, 512, 1024, 2048];
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 100;
const MAX_TILE = 34;
const WORLD_BORDER = 10000;  // ±10 000 bloków

// === ELEMENTY ===
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const mousePosEl = document.getElementById('mousePos');
const loadingEl = document.getElementById('loading');
const zoomIndicator = document.getElementById('zoomIndicator');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// === STAN ===
let viewX = 0, viewY = 0;
let zoom = 1;
const tileCache = new Map();
let loadedCount = 0;

// === WYBIERZ POZIOM PIRAMIDY ===
function getLevel() {
    const scale = 256 * zoom;
    for (let i = 0; i < TILE_SIZES.length; i++) {
        if (scale <= TILE_SIZES[i]) return i;
    }
    return TILE_SIZES.length - 1;
}

function getTileSize() {
    return TILE_SIZES[getLevel()];
}

// === ŁADOWANIE TILE'A ===
async function loadTile(tx, ty, level) {
    const key = `${level}_${tx}_${ty}`;
    if (tileCache.has(key)) return tileCache.get(key);

    if (Math.abs(tx) > MAX_TILE || Math.abs(ty) > MAX_TILE) {
        tileCache.set(key, null);
        return null;
    }

    const ext = (Math.abs(tx) <= 1 && Math.abs(ty) <= 1) ? 'png' : 'webp';
    const path = `tiles/${level}/${tx}_${ty}.${ext}`;

    const img = new Image();
    img.src = path;

    return new Promise((resolve) => {
        img.onload = () => {
            tileCache.set(key, img);
            loadedCount++;
            if (loadedCount >= 5) {
                loadingEl.style.opacity = '0';
                setTimeout(() => loadingEl.style.display = 'none', 500);
            }
            resolve(img);
        };
        img.onerror = () => {
            tileCache.set(key, null);
            resolve(null);
        };
    });
}

// === WIDOCZNE TILE'E ===
function getVisibleTiles() {
    const level = getLevel();
    const tileSize = getTileSize();
    const scale = tileSize / 256;
    const size = tileSize * zoom / scale;

    const minTx = Math.floor((viewX * zoom - canvas.width / 2) / size) - 1;
    const maxTx = Math.ceil((viewX * zoom + canvas.width / 2) / size) + 1;
    const minTy = Math.floor((viewY * zoom - canvas.height / 2) / size) - 1;
    const maxTy = Math.ceil((viewY * zoom + canvas.height / 2) / size) + 1;

    const tiles = [];
    for (let tx = minTx; tx <= maxTx; tx++) {
        for (let ty = minTy; ty <= maxTy; ty++) {
            if (Math.abs(tx) > MAX_TILE || Math.abs(ty) > MAX_TILE) continue;
            const x = tx * 256 * scale;
            const z = ty * 256 * scale;
            tiles.push({ tx, ty, x, z, level });
        }
    }
    return tiles;
}

// === RYSOWANIE ===
async function draw() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const visible = getVisibleTiles();

    for (const t of visible) {
        const scale = TILE_SIZES[t.level] / 256;
        const screenX = (t.x - viewX) * zoom + canvas.width / 2;
        const screenY = (t.z - viewY) * zoom + canvas.height / 2;
        const size = (TILE_SIZES[t.level] * zoom) / scale;

        const img = await loadTile(t.tx, t.ty, t.level);
        if (img) {
            ctx.drawImage(img, screenX, screenY, size, size);
        }
    }

    zoomIndicator.textContent = `x${zoom.toFixed(2)}`;
}

// === ZOOM + BORDER ===
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    const step = e.ctrlKey ? 1 : 0.1;
    let newZoom = zoom + delta * step;
    newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - canvas.width / 2) / zoom + viewX;
    const wy = (my - canvas.height / 2) / zoom + viewY;

    zoom = newZoom;
    viewX = wx - (mx - canvas.width / 2) / zoom;
    viewY = wy - (my - canvas.height / 2) / zoom;

    // BORDER ±10 000
    const halfWorld = WORLD_BORDER;
    viewX = Math.max(-halfWorld, Math.min(halfWorld, viewX));
    viewY = Math.max(-halfWorld, Math.min(halfWorld, viewY));

    draw();
}, { passive: false });

// === PAN + FLING ===
let isDragging = false, prevX = 0, prevY = 0, velocityX = 0, velocityY = 0, lastTime = 0;
const friction = 0.92;

canvas.addEventListener('mousedown', e => {
    isDragging = true;
    prevX = e.clientX; prevY = e.clientY;
    velocityX = velocityY = 0;
    lastTime = performance.now();
    canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('mousemove', e => {
    if (!isDragging) {
        const rect = canvas.getBoundingClientRect();
        const x = Math.round((e.clientX - rect.left - canvas.width / 2) / zoom + viewX);
        const z = Math.round((e.clientY - rect.top - canvas.height / 2) / zoom + viewY);
        mousePosEl.textContent = `Pozycja: (${x}, ${z})`;
        return;
    }

    const now = performance.now();
    const dt = now - lastTime || 1;
    lastTime = now;

    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;

    viewX -= dx / zoom;
    viewY -= dy / zoom;

    velocityX = dx / dt * 16.66;
    velocityY = dy / dt * 16.66;

    prevX = e.clientX; prevY = e.clientY;

    // BORDER
    const halfWorld = WORLD_BORDER;
    viewX = Math.max(-halfWorld, Math.min(halfWorld, viewX));
    viewY = Math.max(-halfWorld, Math.min(halfWorld, viewY));

    draw();
});

canvas.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    canvas.style.cursor = 'grab';
    requestAnimationFrame(fling);
});

canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
});

function fling() {
    if (Math.abs(velocityX) < 0.5 && Math.abs(velocityY) < 0.5) {
        draw();
        return;
    }

    viewX -= velocityX / zoom;
    viewY -= velocityY / zoom;

    velocityX *= friction;
    velocityY *= friction;

    const halfWorld = WORLD_BORDER;
    viewX = Math.max(-halfWorld, Math.min(halfWorld, viewX));
    viewY = Math.max(-halfWorld, Math.min(halfWorld, viewY));

    draw();
    requestAnimationFrame(fling);
}

// === RESIZE ===
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
});

// === START ===
draw();