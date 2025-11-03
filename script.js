// === KONFIGURACJA ===
const TILE_SIZE = 256;
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 100;
const ZOOM_STEP = 0.1;
const CTRL_ZOOM_STEP = 1;

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
const tileCache = new Map();  // null = nie ma pliku
let loadedCount = 0;

// === ŁADOWANIE TILE'A (proste, bez HEAD) ===
function loadTile(tx, ty) {
    const key = `${tx}_${ty}`;
    if (tileCache.has(key)) return Promise.resolve(tileCache.get(key));

    const ext = (Math.abs(tx) <= 5 && Math.abs(ty) <= 5) ? 'png' : 'webp';
    const path = `tiles/0/${tx}_${ty}.${ext}`;

    const img = new Image();
    img.src = path;

    return new Promise((resolve) => {
        img.onload = () => {
            tileCache.set(key, img);
            loadedCount++;
            loadingEl.textContent = `Ładowanie... (${loadedCount} tile'i)`;
            resolve(img);
        };
        img.onerror = () => {
            tileCache.set(key, null);  // nie ma pliku
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
            const x = tx * TILE_SIZE;
            const z = ty * TILE_SIZE;
            tiles.push({ tx, ty, x, z });
        }
    }
    return tiles;
}

// === RYSOWANIE (CZARNA DZIURA, ZERO MRUGANIA) ===
async function draw() {
    ctx.imageSmoothingEnabled = false;

    // Czyścimy TYLKO obszar z tile'ami (nie całe tło!)
    const visible = getVisibleTiles();
    const buffer = TILE_SIZE * zoom * 2;
    const minX = viewX * zoom - canvas.width / 2 - buffer + canvas.width / 2;
    const maxX = viewX * zoom + canvas.width / 2 + buffer + canvas.width / 2;
    const minY = viewY * zoom - canvas.height / 2 - buffer + canvas.height / 2;
    const maxY = viewY * zoom + canvas.height / 2 + buffer + canvas.height / 2;

    ctx.clearRect(
        Math.max(0, minX),
        Math.max(0, minY),
        Math.min(canvas.width, maxX - minX),
        Math.min(canvas.height, maxY - minY)
    );

    for (const t of visible) {
        const screenX = (t.x - viewX) * zoom + canvas.width / 2;
        const screenY = (t.z - viewY) * zoom + canvas.height / 2;
        const size = TILE_SIZE * zoom;

        const img = await loadTile(t.tx, t.ty);
        if (img) {
            ctx.drawImage(img, screenX, screenY, size, size);
        }
        // else → CZARNA DZIURA (nic nie rysujemy)
    }

    zoomIndicator.textContent = `x${zoom.toFixed(2)}`;

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
    viewY = wy - (my - canvas.height, canvas.height / 2) / zoom;

    draw();
});

// === PAN + POZYCJA ===
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