/* ==============================================================
   MAPA MINECRAFT v9 – SUWAK ZOOMU + ZERO SKOKÓW
   - slider na dole (1/3 ekranu)
   - zoom 0.8 → 0.9 = PŁYNNIE
   - coordy GÓRA, zoom DOŁU
   ============================================================== */

const BLOCKS_PER_TILE = { 256: 256, 512: 1024, 1024: 4096 };

// SUPER PŁYNNE PRZEJŚCIA
const LEVELS = [
    { size: 1024, folder: 0, minZoom: 0.10, maxZoom: 0.70 },
    { size: 512,  folder: 1, minZoom: 0.55, maxZoom: 1.00 },
    { size: 256,  folder: 2, minZoom: 0.85, maxZoom: 4.00 }
];

const WORLD_SIZE = 10000;
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const loading = document.getElementById('loading');
const slider = document.getElementById('zoom-slider');
const zoomLabel = document.getElementById('zoom-label');

let zoom = 1;
let viewX = 0, viewY = 0;
let isDragging = false;
let startX, startY, startViewX, startViewY;
let pixelRatio = 1;

const cache = new Map();
let loadedTiles = 0;

// === WYŁĄCZ ROZMYCIE ===
function disableSmoothing() {
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.imageSmoothingQuality = 'low';
}
disableSmoothing();

// === RESIZE ===
function resize() {
    pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * pixelRatio);
    canvas.height = Math.round(innerHeight * pixelRatio);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    disableSmoothing();
    draw();
}
window.addEventListener('resize', resize);
resize();

// === POZIOM ZOOMU ===
function getLevel() {
    for (const lvl of LEVELS) {
        if (zoom >= lvl.minZoom && zoom <= lvl.maxZoom) return lvl;
    }
    if (zoom < 0.6) return LEVELS[0];
    if (zoom < 0.9) return LEVELS[1];
    return LEVELS[2];
}

// === PŁYNNE SKALOWANIE (zero skoków!) ===
function getPixelScale() {
    const lvl = getLevel();
    const blocksPerTile = BLOCKS_PER_TILE[lvl.size];
    let ideal = zoom * (lvl.size / blocksPerTile);

    const idx = LEVELS.indexOf(lvl);
    const next = LEVELS[idx + 1];
    if (next && zoom > lvl.maxZoom * 0.85) {
        const progress = (zoom - lvl.maxZoom * 0.85) / (lvl.maxZoom * 0.15);
        const nextIdeal = zoom * (next.size / BLOCKS_PER_TILE[next.size]);
        ideal = ideal * (1 - progress) + nextIdeal * progress;
    }

    const tilePixelSize = Math.round(ideal * blocksPerTile);
    const scale = tilePixelSize / blocksPerTile;
    return { scale, tilePixelSize };
}

// === ŁADOWANIE KAFELKÓW ===
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
                setTimeout(() => loading.style.display = 'none', 500);
            }
            resolve(img);
        };
        img.onerror = () => { cache.set(key, null); resolve(null); };
    });
    cache.set(key, promise);
    return promise;
}

// === RYSOWANIE ===
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);

    const level = getLevel();
    const blocksPerTile = BLOCKS_PER_TILE[level.size];
    const { scale: ppb, tilePixelSize } = getPixelScale();

    const centerX = innerWidth / 2;
    const centerY = innerHeight / 2;

    const leftBlock   = viewX - centerX / ppb;
    const topBlock    = viewY - centerY / ppb;
    const rightBlock  = viewX + centerX / ppb;
    const bottomBlock = viewY + centerY / ppb;

    const startTx = Math.floor(leftBlock / blocksPerTile);
    const endTx   = Math.ceil(rightBlock / blocksPerTile);
    const startTy = Math.floor(topBlock / blocksPerTile);
    const endTy   = Math.ceil(bottomBlock / blocksPerTile);

    for (let tx = startTx - 1; tx <= endTx + 1; tx++) {
        for (let ty = startTy - 1; ty <= endTy + 1; ty++) {
            if (Math.abs(tx) > 50 || Math.abs(ty) > 50) continue;
            const key = `${level.folder}_${tx}_${ty}`;
            const cached = cache.get(key);

            if (cached && !(cached instanceof Promise) && cached) {
                const blockX = tx * blocksPerTile;
                const blockZ = ty * blocksPerTile;

                const rawX = centerX + (blockX - viewX) * ppb;
                const rawY = centerY + (blockZ - viewY) * ppb;

                const screenX = Math.round(rawX * 10) / 10;
                const screenY = Math.round(rawY * 10) / 10;
                const drawW = Math.round(tilePixelSize * 10) / 10;

                ctx.drawImage(cached, screenX, screenY, drawW, drawW);
            } else if (!cached) {
                loadTile(tx, ty, level);
            }
        }
    }

    ctx.restore();

    // COORDY POD KURSOREM (góra)
    const rect = canvas.getBoundingClientRect();
    const mx = (window.lastMouseX || innerWidth / 2) - rect.left;
    const my = (window.lastMouseY || innerHeight / 2) - rect.top;
    const worldX = viewX + (mx - centerX) / ppb;
    const worldZ = viewY + (my - centerY) / ppb;

    info.textContent = `(${Math.round(worldX)}, ${Math.round(worldZ)})`;

    // ZOOM NA DOLE
    zoomLabel.textContent = `Zoom: ${zoom.toFixed(2)}x`;
    slider.value = zoom;
}

// === ZOOM SLIDER ===
slider.addEventListener('input', e => {
    const newZoom = parseFloat(e.target.value);
    const oldPpb = getPixelScale().scale;
    const centerX = innerWidth / 2;
    const centerY = innerHeight / 2;

    const worldX = viewX + (centerX - centerX) / oldPpb;
    const worldZ = viewY + (centerY - centerY) / oldPpb;

    zoom = newZoom;
    const newPpb = getPixelScale().scale;

    viewX = worldX;
    viewY = worldZ;

    draw();
});

// === ZOOM KOŁEM (z sliderem) ===
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldPpb = getPixelScale().scale;
    const worldX = viewX + (mx - innerWidth/2) / oldPpb;
    const worldZ = viewY + (my - innerHeight/2) / oldPpb;

    let newZoom = Math.round(zoom * 10 + (e.deltaY > 0 ? -1 : 1)) / 10;
    newZoom = Math.max(0.1, Math.min(4, newZoom));
    zoom = newZoom;
    slider.value = zoom;

    const newPpb = getPixelScale().scale;
    viewX = worldX - (mx - innerWidth/2) / newPpb;
    viewY = worldZ - (my - innerHeight/2) / newPpb;

    clampView();
    draw();
}, { passive: false });

// === DRAG + MOBILE ===
canvas.addEventListener('mousedown', e => {
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    startViewX = viewX; startViewY = viewY;
    canvas.style.cursor = 'grabbing';
});
window.addEventListener('mouseup', () => { isDragging = false; canvas.style.cursor = 'grab'; });

canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startViewX = viewX; startViewY = viewY;
    }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
        const ppb = getPixelScale().scale;
        const dx = (e.touches[0].clientX - startX) / ppb;
        const dy = (e.touches[0].clientY - startY) / ppb;
        viewX = startViewX - dx;
        viewY = startViewY - dy;
        clampView();
        draw();
    }
}, { passive: false });

canvas.addEventListener('touchend', () => { isDragging = false; });

// === COORDY POD KURSOREM ===
window.addEventListener('mousemove', e => {
    window.lastMouseX = e.clientX;
    window.lastMouseY = e.clientY;
    if (isDragging) {
        const ppb = getPixelScale().scale;
        const dx = (e.clientX - startX) / ppb;
        const dy = (e.clientY - startY) / ppb;
        viewX = startViewX - dx;
        viewY = startViewY - dy;
        clampView();
    }
    draw();
});

// === CLAMP ===
function clampView() {
    viewX = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewX));
    viewY = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewY));
}

// === START ===
canvas.style.cursor = 'grab';
slider.value = zoom;
draw();