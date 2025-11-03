/* ==============================================================
   MAPA MINECRAFT v7 – RAZOR SHARP PIXEL EDITION
   - 100% ostre piksele na każdym ekranie
   - zero subpikseli, zero blur
   - devicePixelRatio + pixel-perfect + crisp-edges
   ============================================================== */

const BLOCKS_PER_TILE = { 256: 256, 512: 1024, 1024: 4096 };
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
let pixelRatio = 1;

const cache = new Map();
let loadedTiles = 0;

// === 1. WYŁĄCZ WSZYSTKO CO ROZMYWA ===
function disableSmoothing() {
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.imageSmoothingQuality = 'low';
}
disableSmoothing();

// === 2. RESIZE Z PIXEL RATIO ===
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

// === 3. POZIOM ZOOMU ===
function getLevel() {
    for (const lvl of LEVELS) {
        if (zoom >= lvl.minZoom && zoom <= lvl.maxZoom) return lvl;
    }
    return zoom < 0.4 ? LEVELS[0] : LEVELS[2];
}

// === 4. SKALOWANIE TYLKO CAŁKOWITE ===
function getPixelScale() {
    const lvl = getLevel();
    const blocksPerTile = BLOCKS_PER_TILE[lvl.size];
    const ideal = zoom * (lvl.size / blocksPerTile);
    const tilePixelSize = Math.round(ideal * blocksPerTile);
    const scale = tilePixelSize / blocksPerTile;
    return { scale, tilePixelSize };
}

// === 5. ŁADOWANIE KAFELKÓW ===
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

// === 6. RYSOWANIE – RAZOR SHARP ===
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

                // PIXEL-PERFECT POZYCJA
                const rawX = centerX + (blockX - viewX) * ppb;
                const rawY = centerY + (blockZ - viewY) * ppb;

                const screenX = Math.round(rawX * 10) / 10;
                const screenY = Math.round(rawY * 10) / 10;

                // RYSUJ Z ZAOKRĄGLONYMI ROZMIARAMI
                const drawW = Math.round(tilePixelSize * 10) / 10;
                const drawH = drawW;

                ctx.drawImage(cached, screenX, screenY, drawW, drawH);
            } else if (!cached) {
                loadTile(tx, ty, level);
            }
        }
    }

    // PRELOAD
    const PRELOAD = 2;
    for (let tx = startTx - PRELOAD; tx <= endTx + PRELOAD; tx++) {
        for (let ty = startTy - PRELOAD; ty <= endTy + PRELOAD; ty++) {
            if (Math.abs(tx) > 55 || Math.abs(ty) > 55) continue;
            const key = `${level.folder}_${tx}_${ty}`;
            if (!cache.has(key)) loadTile(tx, ty, level);
        }
    }

    ctx.restore();

    // INFO
    const mx = innerWidth / 2;
    const my = innerHeight / 2;
    const wx = viewX + (mx - mx) / ppb;
    const wz = viewY + (my - my) / ppb;
    info.textContent = `Zoom: ${zoom.toFixed(2)}x | (${Math.round(wx)}, ${Math.round(wz)}) | DPI: ${pixelRatio.toFixed(2)}`;
}

// === ZOOM ===
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldPpb = getPixelScale().scale;
    const worldX = viewX + (mx - innerWidth/2) / oldPpb;
    const worldZ = viewY + (my - innerHeight/2) / oldPpb;

    let newZoom = e.ctrlKey
        ? zoom + (e.deltaY > 0 ? -1 : 1)
        : Math.round(zoom * 10 + (e.deltaY > 0 ? -1 : 1)) / 10;

    newZoom = Math.max(0.1, Math.min(50, newZoom));
    zoom = newZoom;

    const newPpb = getPixelScale().scale;
    viewX = worldX - (mx - innerWidth/2) / newPpb;
    viewY = worldZ - (my - innerHeight/2) / newPpb;

    clampView();
    draw();
}, { passive: false });

// === DRAG ===
canvas.addEventListener('mousedown', e => {
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    startViewX = viewX; startViewY = viewY;
    canvas.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', e => {
    if (isDragging) {
        const ppb = getPixelScale().scale;
        const dx = (e.clientX - startX) / ppb;
        const dy = (e.clientY - startY) / ppb;
        viewX = startViewX - dx;
        viewY = startViewY - dy;
        clampView();
        draw();
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
});

function clampView() {
    viewX = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewX));
    viewY = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewY));
}

// === START ===
canvas.style.cursor = 'grab';
draw();
// === REKSU MOBILE MODE ===
canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startViewX = viewX; startViewY = viewY;
        canvas.style.cursor = 'grabbing';
    } else if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        window.lastPinchDist = dist;
        window.lastPinchZoom = zoom;
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
    } else if (e.touches.length === 2) {
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const centerX = (t1.clientX + t2.clientX) / 2;
        const centerY = (t1.clientY + t2.clientY) / 2;
        
        const delta = dist / window.lastPinchDist;
        const newZoom = window.lastPinchZoom * delta;
        zoom = Math.max(0.3, Math.min(30, newZoom));
        
        // Zoom w stronę palców
        const oldPpb = getPixelScale().scale;
        const worldX = viewX + (centerX - innerWidth/2) / oldPpb;
        const worldZ = viewY + (centerY - innerHeight/2) / oldPpb;
        const newPpb = getPixelScale().scale;
        viewX = worldX - (centerX - innerWidth/2) / newPpb;
        viewY = worldZ - (centerY - innerHeight/2) / newPpb;
        
        clampView();
        draw();
        window.lastPinchDist = dist;
    }
}, { passive: false });

canvas.addEventListener('touchend', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
});