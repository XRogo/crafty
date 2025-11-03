// === SKALA MAPY ===
const BLOCKS_PER_TILE = {
    256: 256,    // 256px = 256 bloków
    512: 1024,   // 512px = 1024 bloki
    1024: 4096   // 1024px = 4096 bloków
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
let lastX, lastY;
const cache = new Map();
let loaded = 0;

// Resize
function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    draw();
}
window.addEventListener('resize', resize);
resize();

// Aktualny poziom
function getLevel() {
    for (const lvl of LEVELS) {
        if (zoom >= lvl.minZoom && zoom <= lvl.maxZoom) return lvl;
    }
    return zoom < 0.4 ? LEVELS[0] : LEVELS[2];
}

// Skala: ile bloków na piksel
function getBlocksPerPixel() {
    const level = getLevel();
    const blocks = BLOCKS_PER_TILE[level.size];
    const pixels = level.size;
    return blocks / pixels / zoom;
}

// Ładuj kafelek
function loadTile(tx, ty, level) {
    const key = `${level.folder}_${tx}_${ty}`;
    if (cache.has(key)) return cache.get(key);

    const ext = (Math.abs(tx) <= 1 && Math.abs(ty) <= 1) ? 'png' : 'webp';
    const img = new Image();
    img.src = `tiles/${level.folder}/${tx}_${ty}.${ext}`;

    const promise = new Promise(resolve => {
        img.onload = () => {
            cache.set(key, img);
            loaded++;
            if (loaded > 8) {
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

// Rysowanie – BEZ PRZESKOKÓW!
async function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const level = getLevel();
    const tileSize = level.size;
    const blocksPerTile = BLOCKS_PER_TILE[tileSize];
    const pixelsPerBlock = zoom * (tileSize / blocksPerTile);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const leftBlock = viewX - centerX / pixelsPerBlock;
    const topBlock = viewY - centerY / pixelsPerBlock;
    const rightBlock = viewX + centerX / pixelsPerBlock;
    const bottomBlock = viewY + centerY / pixelsPerBlock;

    const startTx = Math.floor(leftBlock / blocksPerTile);
    const endTx = Math.ceil(rightBlock / blocksPerTile);
    const startTy = Math.floor(topBlock / blocksPerTile);
    const endTy = Math.ceil(bottomBlock / blocksPerTile);

    for (let tx = startTx - 1; tx <= endTx + 1; tx++) {
        for (let ty = startTy - 1; ty <= endTy + 1; ty++) {
            if (Math.abs(tx) > 50 || Math.abs(ty) > 50) continue;

            const blockX = tx * blocksPerTile;
            const blockZ = ty * blocksPerTile;
            const screenX = centerX + (blockX - viewX) * pixelsPerBlock;
            const screenY = centerY + (blockZ - viewY) * pixelsPerBlock;
            const screenSize = blocksPerTile * pixelsPerBlock;

            const key = `${level.folder}_${tx}_${ty}`;
            const cached = cache.get(key);

            if (cached instanceof Promise) {
                const img = await cached;
                if (img) ctx.drawImage(img, screenX, screenY, screenSize, screenSize);
            } else if (cached) {
                ctx.drawImage(cached, screenX, screenY, screenSize, screenSize);
            } else {
                loadTile(tx, ty, level);
            }
        }
    }

    info.textContent = `Zoom: ${zoom.toFixed(2)}x | (${Math.round(viewX)}, ${Math.round(viewY)})`;
}

// Zoom – płynny!
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.11;
    const oldZoom = zoom;
    zoom = Math.max(0.1, Math.min(2, zoom * delta));

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const wx = viewX + (mx - canvas.width/2) * (1/pixelsPerBlock(oldZoom) - 1/pixelsPerBlock(zoom));
    const wy = viewY + (my - canvas.height/2) * (1/pixelsPerBlock(oldZoom) - 1/pixelsPerBlock(zoom));

    viewX = wx;
    viewY = wy;

    clampView();
    draw();
}, { passive: false });

// Pomocnicza funkcja do starego zoomu
function pixelsPerBlock(z) {
    const level = getLevel();
    const tileSize = level.size;
    const blocksPerTile = BLOCKS_PER_TILE[tileSize];
    return z * (tileSize / blocksPerTile);
}

// Przeciąganie
let startX, startY, startViewX, startViewY;
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
        const bpp = pixelsPerBlock(zoom);
        const wx = viewX + (e.clientX - canvas.width/2) / bpp;
        const wz = viewY + (e.clientY - canvas.height/2) / bpp;
        info.textContent = `Zoom: ${zoom.toFixed(2)}x | (${Math.round(wx)}, ${Math.round(wz)})`;
        return;
    }

    const dx = (e.clientX - startX) / pixelsPerBlock(zoom);
    const dy = (e.clientY - startY) / pixelsPerBlock(zoom);
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

// START
canvas.style.cursor = 'grab';
draw();