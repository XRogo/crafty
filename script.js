/* ==============================================================
   MAPA MINECRAFT v9 – DZIAŁA LOKALNIE + POLIGONY NA COORDACH
   - kafelki się ładują
   - poligony dokładnie na koordynatach (jak w info na górze!)
   - rysowanie nowych (dwuklik → klikaj → Enter)
   - zero błędów CORS
   ============================================================== */

const BLOCKS_PER_TILE = { 256: 256, 512: 1024, 1024: 4096 };
const LEVELS = [
    { size: 1024, folder: 0, minZoom: 0.10, maxZoom: 0.30 },
    { size: 512,  folder: 1, minZoom: 0.30, maxZoom: 0.70 },
    { size: 256,  folder: 2, minZoom: 0.70, maxZoom: 40.00 }
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

// === POLIGONY Z POZYCJE.JS ===
const polygons = (window.polygonsData && window.polygonsData.length > 0) 
    ? window.polygonsData 
    : [];

// === GLOBALNE DO RYSOWANIA ===
window.visibleCategories = { 1: true, 2: true };
window.isDrawing = false;
window.tempPolygon = { points: [] };

// === FUNKCJE POMOCNICZE ===
function calculateCentroid(points) {
    let xSum = 0, zSum = 0;
    points.forEach(([x, z]) => { xSum += x; zSum += z; });
    const count = points.length;
    return count > 0 ? [xSum / count, zSum / count] : [0, 0];
}

function drawTextAlongPath(text, points, offset = 0) {
    if (points.length < 2) return;

    const totalLength = points.reduce((len, p, i) => {
        if (i === 0) return 0;
        const dx = p[0] - points[i - 1][0];
        const dz = p[1] - points[i - 1][1];
        return len + Math.hypot(dx, dz);
    }, 0);

    let target = totalLength / 2 + offset;
    let travelled = 0;

    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (travelled + segLen >= target) {
            const ratio = (target - travelled) / segLen;
            const x = a[0] + (b[0] - a[0]) * ratio;
            const z = a[1] + (b[1] - a[1]) * ratio;
            const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);

            ctx.save();
            ctx.translate(x, z);
            ctx.rotate(angle);
            ctx.font = `${14 / zoom}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2 / zoom;
            ctx.strokeText(text, 0, 0);
            ctx.fillStyle = 'white';
            ctx.fillText(text, 0, 0);
            ctx.restore();
            return;
        }
        travelled += segLen;
    }
}

// === RYSOWANIE POLIGONÓW (NA WŁAŚCIWYCH COORDACH!) ===
function drawPolygons() {
    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);

    const { scale: ppb } = getPixelScale();
    const centerX = innerWidth / 2;
    const centerY = innerHeight / 2;

    // Przeskaluj i przesuń canvas – tak jak kafelki
    ctx.translate(centerX, centerY);
    ctx.scale(ppb, ppb);
    ctx.translate(-viewX, -viewY);

    // === STAŁE POLIGONY ===
    polygons.forEach(polygon => {
        if (!window.visibleCategories[polygon.category]) return;
        if (!polygon.points || polygon.points.length === 0) return;
        if (polygon.category === 2 && zoom <= 3) return;

        const { points, lineColor, fillColor, closePath, name, category } = polygon;

        ctx.beginPath();
        points.forEach((p, i) => {
            const [x, z] = p;
            if (i === 0) ctx.moveTo(x, z);
            else ctx.lineTo(x, z);
        });
        if (closePath && category === 1) ctx.closePath();

        ctx.fillStyle = category === 1 ? fillColor : 'rgba(0,0,0,0)';
        ctx.fill();

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = category === 1 ? 2 / zoom : (category === 2 ? 6 / zoom : 3 / zoom);
        ctx.stroke();

        if (name && (category === 1 || zoom > 3)) {
            ctx.font = `${14 / zoom}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (category === 1) {
                const [cx, cz] = calculateCentroid(points);
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 1.5 / zoom;
                ctx.strokeText(name, cx, cz);
                ctx.fillStyle = 'white';
                ctx.fillText(name, cx, cz);
            } else {
                drawTextAlongPath(name, points, 0);
            }
        }
    });

    // === TEMPORALNY POLIGON ===
    if (window.isDrawing && window.tempPolygon.points.length > 0) {
        const pts = window.tempPolygon.points;
        ctx.beginPath();
        pts.forEach((p, i) => {
            const [x, z] = p;
            if (i === 0) ctx.moveTo(x, z);
            else ctx.lineTo(x, z);
        });
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();

        pts.forEach(([x, z]) => {
            ctx.beginPath();
            ctx.arc(x, z, 3 / zoom, 0, Math.PI * 2);
            ctx.fillStyle = 'red';
            ctx.fill();
        });
    }

    ctx.restore();
}

// === WYŁĄCZ ROZMYCIE ===
function disableSmoothing() {
    ctx.imageSmoothingEnabled = false;
}
disableSmoothing();

// === RESIZE ===
function resize() {
    pixelRatio = window.devicePixelRatio || 1;
    canvas.width = innerWidth * pixelRatio;
    canvas.height = innerHeight * pixelRatio;
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
    return zoom < 0.6 ? LEVELS[0] : zoom < 0.9 ? LEVELS[1] : LEVELS[2];
}

function getPixelScale() {
    const lvl = getLevel();
    const blocksPerTile = BLOCKS_PER_TILE[lvl.size];
    const tilePixelSize = Math.round(zoom * blocksPerTile);
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

    // === RYSUJ POLIGONY (na coordach!) ===
    drawPolygons();

    // === INFO ===
    const rect = canvas.getBoundingClientRect();
    const mx = (window.lastMouseX || innerWidth / 2) - rect.left;
    const my = (window.lastMouseY || innerHeight / 2) - rect.top;
    const worldX = viewX + (mx - centerX) / ppb;
    const worldZ = viewY + (my - centerY) / ppb;

    info.textContent = `(${Math.round(worldX)}, ${Math.round(worldZ)})`;
    zoomLabel.textContent = `Zoom: ${zoom.toFixed(2)}x`;
    slider.value = zoom;
}

// === ZOOM ===
slider.addEventListener('input', e => {
    zoom = parseFloat(e.target.value);
    draw();
});

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldPpb = getPixelScale().scale;
    const worldX = viewX + (mx - innerWidth/2) / oldPpb;
    const worldZ = viewY + (my - innerHeight/2) / oldPpb;

    zoom = Math.max(0.1, Math.min(40, zoom + (e.deltaY > 0 ? -0.1 : 0.1)));
    slider.value = zoom;

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
window.addEventListener('mouseup', () => { isDragging = false; canvas.style.cursor = 'grab'; });
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

// === MOBILE ===
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

// === CLAMP ===
function clampView() {
    viewX = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewX));
    viewY = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewY));
}

// === RYSOWANIE NOWYCH POLIGONÓW ===
canvas.addEventListener('dblclick', () => {
    window.isDrawing = true;
    window.tempPolygon.points = [];
    info.textContent = 'Rysuj poligon... (klikaj, Enter = zapisz, Esc = anuluj)';
    draw();
});

canvas.addEventListener('click', e => {
    if (!window.isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ppb = getPixelScale().scale;
    const centerX = innerWidth / 2;
    const centerY = innerHeight / 2;

    const worldX = viewX + (mx - centerX) / ppb;
    const worldZ = viewY + (my - centerY) / ppb;

    window.tempPolygon.points.push([Math.round(worldX), Math.round(worldZ)]);
    draw();
});

window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && window.isDrawing) {
        window.isDrawing = false;
        window.tempPolygon.points = [];
        info.textContent = 'Anulowano';
        draw();
    }
    if (e.key === 'Enter' && window.isDrawing && window.tempPolygon.points.length > 2) {
        const name = prompt('Nazwa poligonu:', 'Nowy teren') || 'Bez nazwy';
        const newPoly = {
            points: window.tempPolygon.points,
            lineColor: 'rgba(0, 255, 0, 1)',
            fillColor: 'rgba(0, 255, 0, 0.2)',
            closePath: true,
            name: name,
            category: 1
        };
        polygons.push(newPoly);
        console.log('%cDODAJ DO pozycje.js:', 'color: lime; font-weight: bold;');
        console.log(JSON.stringify(newPoly, null, 4));
        window.isDrawing = false;
        window.tempPolygon.points = [];
        info.textContent = `Zapisano: ${name}`;
        draw();
    }
});

// === START ===
canvas.style.cursor = 'grab';
slider.value = zoom;
draw();