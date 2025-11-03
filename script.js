/* ==============================================================
   MAPA MINECRAFT – wersja 6
   - 100% ostre piksele (bez rozmycia)
   - skalowanie tylko całkowitymi liczbami
   - brak migania + preload
   ============================================================== */

const BLOCKS_PER_TILE = {
    256: 256,
    512: 1024,
    1024: 4096
};

const LEVELS = [
    { size: 1024, folder: 0, minZoom: 0.10, maxZoom: 0.50 },
    { size: 512,  folder: 1, minZoom: 0.40, maxZoom: 0.60 },
    { size: 256,  folder: 2, minZoom: 0.60, maxZoom: 2.00 }
];

const WORLD_SIZE = 10000;
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const loading = document.getElementById('loading');

let zoom = 1;
let viewX = 0, viewY = 0;
let isDragging = false;
let startX, startY, startViewX, startViewY;

const cache = new Map();
let loadedTiles = 0;

// === 1. WYŁĄCZ INTERPOLACJĘ NA 100% ===
ctx.imageSmoothingEnabled = false;
canvas.style.imageRendering = 'pixelated';

// === 2. Resize ===
function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    draw();
}
window.addEventListener('resize', resize);
resize();

// === 3. Poziom zoomu ===
function getLevel() {
    for (const lvl of LEVELS) {
        if (zoom >= lvl.minZoom && zoom <= lvl.maxZoom) return lvl;
    }
    return zoom < 0.4 ? LEVELS[0] : LEVELS[2];
}

// === 4. Skalowanie TYLKO całkowitymi pikselami ===
function getPixelScale() {
    const lvl = getLevel();
    const baseScale = zoom * (lvl.size / BLOCKS_PER_TILE[lvl.size]); // ile px na blok
    const tilePixelSize = BLOCKS_PER_TILE[lvl.size] * baseScale;   // rozmiar kafelka w px

    // Zaokrąglij do najbliższej potęgi 2 lub całkowitej liczby
    const scale = Math.round(tilePixelSize) / BLOCKS_PER_TILE[lvl.size];
    return { scale, tilePixelSize: Math.round(tilePixelSize) };
}

// === 5. Ładuj kafelek ===
function loadTile(tx, ty, level) {
    const key = `${level.folder}_${tx}_${ty}`;
    if (cache.has(key)) return cache.get(key);

    const ext = (Math.abs(tx) <= 1 && Math.abs(ty) <= 1) ? 'png' : 'webp';
    const img = new Image();
    img.src = `tiles/${level.folder}/${tx}_${ty}.${ext}`;

    const promise = new Promise(resolve => {
        img.onload = () => {
            cache.set(key, img);
            loadedTiles++;
            if (loadedTiles > 8) {
                loading.style.opacity = '0';
                setTimeout(() => loading.style.display = 'none', 300);
            }
            resolve(img);
        };
        img.onerror = () => {
            cache.set(key, null);
            resolve(null);
        };
    });

    cache.set(key, promise);
    return promise;
}

// === 6. RYSOWANIE – OSTRE, BEZ ROZMYCIA ===
function draw() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const level = getLevel();
    const blocksPerTile = BLOCKS_PER_TILE[level.size];
    const { scale: ppb, tilePixelSize } = getPixelScale(); // ppb = pixels per block

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Widoczny obszar w blokach
    const leftBlock   = viewX - centerX / ppb;
    const topBlock    = viewY - centerY / ppb;
    const rightBlock  = viewX + centerX / ppb;
    const bottomBlock = viewY + centerY / ppb;

    const startTx = Math.floor(leftBlock / blocksPerTile);
    const endTx   = Math.ceil(rightBlock / blocksPerTile);
    const startTy = Math.floor(topBlock / blocksPerTile);
    const endTy   = Math.ceil(bottomBlock / blocksPerTile);

    // Rysuj tylko gotowe kafelki
    for (let tx = startTx - 1; tx <= endTx + 1; tx++) {
        for (let ty = startTy - 1; ty <= endTy + 1; ty++) {
            if (Math.abs(tx) > 50 || Math.abs(ty) > 50) continue;

            const key = `${level.folder}_${tx}_${ty}`;
            const cached = cache.get(key);

            if (cached && !(cached instanceof Promise) && cached) {
                const blockX = tx * blocksPerTile;
                const blockZ = ty * blocksPerTile;

                // Pozycja na ekranie – zaokrąglona do piksela
                const screenX = Math.round(centerX + (blockX - viewX) * ppb);
                const screenY = Math.round(centerY + (blockZ - viewY) * ppb);

                // Rozmiar kafelka – całkowita liczba pikseli
                ctx.drawImage(cached, screenX, screenY, tilePixelSize, tilePixelSize);
            } else if (!cached) {
                loadTile(tx, ty, level);
            }
        }
    }

    // Preload
    const PRELOAD = 2;
    for (let tx = startTx - PRELOAD; tx <= endTx + PRELOAD; tx++) {
        for (let ty = startTy - PRELOAD; ty <= endTy + PRELOAD; ty++) {
            if (Math.abs(tx) > 55 || Math.abs(ty) > 55) continue;
            const key = `${level.folder}_${tx}_${ty}`;
            if (!cache.has(key)) loadTile(tx, ty, level);
        }
    }

    // Info
    info.textContent = `Zoom: ${zoom.toFixed(2)}x | (${Math.round(viewX)}, ${Math.round(viewY)})`;
}

// === 7. ZOOM – z zachowaniem ostrości ===
canvas.addEventListener('wheel', e => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldScale = getPixelScale();
    const oldPpb = oldScale.scale;

    const worldX = viewX + (mx - canvas.width/2) / oldPpb;
    const worldZ = viewY + (my - canvas.height/2) / oldPpb;

    let newZoom;
    if (e.ctrlKey) {
        newZoom = zoom + (e.deltaY > 0 ? -1 : 1);
    } else {
        const dir = e.deltaY > 0 ? -1 : 1;
        newZoom = Math.round(zoom * 10 + dir) / 10;
    }

    newZoom = Math.max(0.1, Math.min(50, newZoom));
    zoom = newZoom;

    const newScale = getPixelScale();
    viewX = worldX - (mx - canvas.width/2) / newScale.scale;
    viewY = worldZ - (my - canvas.height/2) / newScale.scale;

    clampView();
    draw();
}, { passive: false });

// === 8. DRAG ===
canvas.addEventListener('mousedown', e => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startViewX = viewX;
    startViewY = viewY;
    canvas.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', e => {
    if (!isDragging) {
        const scale = getPixelScale().scale;
        const wx = viewX + (e.clientX - canvas.width/2) / scale;
        const wz = viewY + (e.clientY - canvas.height/2) / scale;
        info.textContent = `Zoom: ${zoom.toFixed(2)}x | (${Math.round(wx)}, ${Math.round(wz)})`;
        return;
    }

    const scale = getPixelScale().scale;
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;
    viewX = startViewX - dx;
    viewY = startViewY - dy;
    clampView();
    draw();
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
});

function clampView() {
    viewX = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewX));
    viewY = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewY));
}

// === 9. START ===
canvas.style.cursor = 'grab';
draw();