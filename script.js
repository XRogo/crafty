// === KONFIGURACJA ===
const TILE_SIZE = 256;
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 100;
const ZOOM_STEP = 0.1;
const CTRL_ZOOM_STEP = 1;
const MAX_TILE = 34;

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

// === FLING (rzut) ===
let isDragging = false;
let prevX = 0, prevY = 0;
let velocityX = 0, velocityY = 0;
let lastTime = 0;
const friction = 0.92;

// === BLOKUJ LOGI 404 ===
const originalError = console.error;
console.error = (...args) => {
    if (args[0] && args[0].includes && args[0].includes('Failed to load')) return;
    originalError.apply(console, args);
};

// === ŁADOWANIE TILE'A ===
function loadTile(tx, ty) {
    const key = `${tx}_${ty}`;
    if (tileCache.has(key)) return Promise.resolve(tileCache.get(key));

    if (Math.abs(tx) > MAX_TILE || Math.abs(ty) > MAX_TILE) {
        tileCache.set(key, null);
        return Promise.resolve(null);
    }

    const ext = (Math.abs(tx) <= 5 && Math.abs(ty) <= 5) ? 'png' : 'webp';
    const path = `tiles/0/${tx}_${ty}.${ext}`;

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
    const tiles = [];
    const size = TILE_SIZE * zoom;
    const minTx = Math.floor((viewX * zoom - canvas.width / 2) / size) - 1;
    const maxTx = Math.ceil((viewX * zoom + canvas.width / 2) / size) + 1;
    const minTy = Math.floor((viewY * zoom - canvas.height / 2) / size) - 1;
    const maxTy = Math.ceil((viewY * zoom + canvas.height / 2) / size) + 1;

    for (let tx = minTx; tx <= maxTx; tx++) {
        for (let ty = minTy; ty <= maxTy; ty++) {
            if (Math.abs(tx) > MAX_TILE || Math.abs(ty) > MAX_TILE) continue;
            const x = tx * TILE_SIZE;
            const z = ty * TILE_SIZE;
            tiles.push({ tx, ty, x, z });
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
        const screenX = (t.x - viewX) * zoom + canvas.width / 2;
        const screenY = (t.z - viewY) * zoom + canvas.height / 2;
        const size = TILE_SIZE * zoom;

        const img = await loadTile(t.tx, t.ty);
        if (img) {
            ctx.drawImage(img, screenX, screenY, size, size);
        }
    }

    zoomIndicator.textContent = `x${zoom.toFixed(2)}`;
}

// === ZOOM (scroll + ctrl) ===
canvas.addEventListener('wheel', e => {
    e.preventDefault(); // blokuje przewijanie strony

    const delta = e.deltaY > 0 ? -1 : 1; // w dół = -0.1, w górę = +0.1
    const step = e.ctrlKey ? CTRL_ZOOM_STEP : ZOOM_STEP;
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

    draw();
}, { passive: false });

// === PAN + FLING ===
canvas.addEventListener('mousedown', e => {
    isDragging = true;
    prevX = e.clientX;
    prevY = e.clientY;
    velocityX = 0;
    velocityY = 0;
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

    velocityX = dx / dt * 16.66; // ~60 FPS
    velocityY = dy / dt * 16.66;

    prevX = e.clientX;
    prevY = e.clientY;

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

// === FLING ANIMATION ===
function fling() {
    if (Math.abs(velocityX) < 0.5 && Math.abs(velocityY) < 0.5) {
        draw();
        return;
    }

    viewX -= velocityX / zoom;
    viewY -= velocityY / zoom;

    velocityX *= friction;
    velocityY *= friction;

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