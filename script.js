/* ==============================================================
   MAPA MINECRAFT v9 – EDYTOR 4.0
   - PRZESUWANIE MAPY PODCZAS RYSOWANIA (scroll)
   - ZOOM DZIAŁA
   - + ZAPISUJE
   - KROPKA NA LINII
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
const editorPanel = document.getElementById('editor-panel');

// === STANY ===
let polygons = (window.polygonsData && window.polygonsData.length > 0) ? [...window.polygonsData] : [];
let isDrawing = false;
let tempPoints = [];
let selectedPoint = -1;
let hoverPoint = -1;
let hoverEdge = -1;
let edgePoint = null;
let blink = true;

// === CONFIG ===
let editorConfig = {
    category: 1,
    lineColor: '#00ff00',
    fillColor: '#00ff0033',
    name: '',
    closePath: true
};

// === ZOOM I POZYCJA ===
let zoom = 1;
let viewX = 0, viewY = 0;
let isDragging = false;
let startX, startY, startViewX, startViewY;
let pixelRatio = 1;

// === CACHE ===
const cache = new Map();
let loadedTiles = 0;

// === FUNKCJE ===
function worldToScreen(x, z) {
    const { scale: ppb } = getPixelScale();
    const cx = innerWidth / 2, cy = innerHeight / 2;
    return [cx + (x - viewX) * ppb, cy + (z - viewY) * ppb];
}

function screenToWorld(mx, my) {
    const rect = canvas.getBoundingClientRect();
    const x = mx - rect.left;
    const y = my - rect.top;
    const { scale: ppb } = getPixelScale();
    const cx = innerWidth / 2, cy = innerHeight / 2;
    return [viewX + (x - cx) / ppb, viewY + (y - cy) / ppb];
}

function pointDistanceToSegment(px, pz, x1, z1, x2, z2) {
    const A = px - x1, B = pz - z1, C = x2 - x1, D = z2 - z1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = lenSq !== 0 ? dot / lenSq : -1;
    param = Math.max(0, Math.min(1, param));
    const xx = x1 + param * C;
    const zz = z1 + param * D;
    return { dist: Math.hypot(px - xx, pz - zz), x: xx, z: zz, param };
}

function calculateCentroid(points) {
    let x = 0, z = 0;
    points.forEach(p => { x += p[0]; z += p[1]; });
    return [x / points.length, z / points.length];
}

// === RYSOWANIE ===
function drawPolygons() {
    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);
    const { scale: ppb } = getPixelScale();
    const cx = innerWidth / 2, cy = innerHeight / 2;
    ctx.translate(cx, cy);
    ctx.scale(ppb, ppb);
    ctx.translate(-viewX, -viewY);

    // Stałe poligony
    polygons.forEach(p => {
        if (!window.visibleCategories?.[p.category]) return;
        const { points, lineColor, fillColor, closePath, name } = p;
        ctx.beginPath();
        points.forEach(([x, z], i) => i === 0 ? ctx.moveTo(x, z) : ctx.lineTo(x, z));
        if (closePath) ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.5 / zoom;
        ctx.stroke();
        if (name && zoom > 2) {
            const [cx, cz] = calculateCentroid(points);
            ctx.font = `${14/zoom}px Arial`;
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2/zoom;
            ctx.strokeText(name, cx, cz);
            ctx.fillText(name, cx, cz);
        }
    });

    // Temp poligon
    if (isDrawing && tempPoints.length > 0) {
        ctx.beginPath();
        tempPoints.forEach(([x, z], i) => i === 0 ? ctx.moveTo(x, z) : ctx.lineTo(x, z));
        if (editorConfig.closePath && tempPoints.length > 2) ctx.closePath();
        ctx.fillStyle = editorConfig.fillColor;
        ctx.fill();
        ctx.strokeStyle = editorConfig.lineColor;
        ctx.lineWidth = 3/zoom;
        ctx.stroke();

        // Punkty
        tempPoints.forEach(([x, z], i) => {
            const isLast = i === tempPoints.length - 1;
            const isHover = i === hoverPoint;
            const isSel = i === selectedPoint;
            ctx.beginPath();
            ctx.arc(x, z, 6/zoom, 0, Math.PI*2);
            ctx.fillStyle = isSel ? '#ffff00' : isHover ? '#ff00ff' : '#ff0000';
            if (isLast && blink) ctx.fillStyle = '#00ffff';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2/zoom;
            ctx.stroke();
        });

        // Kropka na linii
        if (edgePoint) {
            ctx.beginPath();
            ctx.arc(edgePoint.x, edgePoint.z, 7/zoom, 0, Math.PI*2);
            ctx.fillStyle = '#00ff00';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2/zoom;
            ctx.stroke();
        }

        // Linia do myszy
        if (tempPoints.length > 0) {
            const [lx, lz] = tempPoints[tempPoints.length - 1];
            const [mx, mz] = screenToWorld(window.lastMouseX, window.lastMouseY);
            ctx.beginPath();
            ctx.moveTo(lx, lz);
            ctx.lineTo(mx, mz);
            ctx.strokeStyle = '#ffffff88';
            ctx.lineWidth = 1.5/zoom;
            ctx.stroke();
        }
    }

    ctx.restore();

    // + w lewym górnym rogu
    if (isDrawing) {
        ctx.fillStyle = '#0f0';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.font = 'bold 42px Arial';
        ctx.strokeText('+', 12, 58);
        ctx.fillText('+', 12, 58);
    }
}

// === MRUGANIE ===
setInterval(() => { blink = !blink; if (isDrawing) draw(); }, 500);

// === RESIZE ===
function resize() {
    pixelRatio = window.devicePixelRatio || 1;
    canvas.width = innerWidth * pixelRatio;
    canvas.height = innerHeight * pixelRatio;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.imageSmoothingEnabled = false;
    draw();
}
window.addEventListener('resize', resize);
resize();

// === POZIOM ZOOMU ===
function getLevel() {
    for (const lvl of LEVELS) if (zoom >= lvl.minZoom && zoom <= lvl.maxZoom) return lvl;
    return zoom < 0.6 ? LEVELS[0] : zoom < 0.9 ? LEVELS[1] : LEVELS[2];
}

function getPixelScale() {
    const lvl = getLevel();
    const bpt = BLOCKS_PER_TILE[lvl.size];
    const tps = Math.round(zoom * bpt);
    return { scale: tps / bpt, tilePixelSize: tps };
}

// === KAFELKI ===
function loadTile(tx, ty, level) {
    const key = `${level.folder}_${tx}_${ty}`;
    if (cache.has(key)) return cache.get(key);
    const ext = (Math.abs(tx) <= 1 && Math.abs(ty) <= 1) ? 'png' : 'webp';
    const img = new Image();
    img.src = `tiles/${level.folder}/${tx}_${ty}.${ext}`;
    const p = new Promise(r => {
        img.onload = () => { cache.set(key, img); loadedTiles++; if (loadedTiles > 8) { loading.style.opacity = '0'; setTimeout(() => loading.style.display = 'none', 500); } r(img); };
        img.onerror = () => { cache.set(key, null); r(null); };
    });
    cache.set(key, p);
    return p;
}

// === RYSOWANIE CAŁEJ MAPY ===
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);

    const level = getLevel();
    const bpt = BLOCKS_PER_TILE[level.size];
    const { scale: ppb, tilePixelSize } = getPixelScale();
    const cx = innerWidth / 2, cy = innerHeight / 2;

    const startTx = Math.floor((viewX - cx/ppb) / bpt);
    const endTx = Math.ceil((viewX + cx/ppb) / bpt);
    const startTy = Math.floor((viewY - cy/ppb) / bpt);
    const endTy = Math.ceil((viewY + cy/ppb) / bpt);

    for (let tx = startTx - 1; tx <= endTx + 1; tx++) {
        for (let ty = startTy - 1; ty <= endTy + 1; ty++) {
            if (Math.abs(tx) > 50 || Math.abs(ty) > 50) continue;
            const key = `${level.folder}_${tx}_${ty}`;
            const img = cache.get(key);
            if (img && !(img instanceof Promise) && img) {
                const bx = tx * bpt;
                const bz = ty * bpt;
                const rx = cx + (bx - viewX) * ppb;
                const ry = cy + (bz - viewY) * ppb;
                ctx.drawImage(img, Math.round(rx*10)/10, Math.round(ry*10)/10, Math.round(tilePixelSize*10)/10, Math.round(tilePixelSize*10)/10);
            } else if (!cache.has(key)) loadTile(tx, ty, level);
        }
    }

    ctx.restore();
    drawPolygons();

    const rect = canvas.getBoundingClientRect();
    const mx = (window.lastMouseX || cx) - rect.left;
    const my = (window.lastMouseY || cy) - rect.top;
    const wx = viewX + (mx - cx) / ppb;
    const wz = viewY + (my - cy) / ppb;
    info.textContent = `(${Math.round(wx)}, ${Math.round(wz)})`;
    zoomLabel.textContent = `Zoom: ${zoom.toFixed(2)}x`;
    slider.value = zoom;
}

// === ZOOM KOŁEM ===
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldPpb = getPixelScale().scale;
    const worldX = viewX + (mx - innerWidth/2) / oldPpb;
    const worldZ = viewY + (my - innerHeight/2) / oldPpb;

    zoom = Math.max(0.1, Math.min(40, zoom + (e.deltaY > 0 ? -0.15 : 0.15)));
    slider.value = zoom;

    const newPpb = getPixelScale().scale;
    viewX = worldX - (mx - innerWidth/2) / newPpb;
    viewY = worldZ - (my - innerHeight/2) / newPpb;
    clampView();
    draw();
}, { passive: false });

// === PRZESUWANIE (ZAWSZE) ===
canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;

    // Klik na +
    if (isDrawing && e.clientX < 70 && e.clientY < 80) {
        savePolygon();
        return;
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startViewX = viewX;
    startViewY = viewY;
    canvas.style.cursor = 'grabbing';

    if (isDrawing) {
        if (edgePoint) {
            tempPoints.splice(edgePoint.edge + 1, 0, [Math.round(edgePoint.x), Math.round(edgePoint.z)]);
            selectedPoint = edgePoint.edge + 1;
        } else if (hoverPoint !== -1) {
            selectedPoint = hoverPoint;
        } else {
            const [wx, wz] = screenToWorld(e.clientX, e.clientY);
            tempPoints.push([Math.round(wx), Math.round(wz)]);
        }
    }
    draw();
});

window.addEventListener('mousemove', e => {
    window.lastMouseX = e.clientX;
    window.lastMouseY = e.clientY;

    if (isDragging) {
        const ppb = getPixelScale().scale;
        viewX = startViewX - (e.clientX - startX) / ppb;
        viewY = startViewY - (e.clientY - startY) / ppb;
        clampView();
    }

    if (isDrawing && !isDragging) {
        const [wx, wz] = screenToWorld(e.clientX, e.clientY);
        hoverPoint = -1;
        hoverEdge = -1;
        edgePoint = null;

        for (let i = 0; i < tempPoints.length; i++) {
            const [px, pz] = tempPoints[i];
            const [sx, sz] = worldToScreen(px, pz);
            if (Math.hypot(sx - e.clientX, sz - e.clientY) < 15) {
                hoverPoint = i;
                break;
            }
        }

        if (hoverPoint === -1 && tempPoints.length > 1) {
            for (let i = 0; i < tempPoints.length - 1; i++) {
                const a = tempPoints[i];
                const b = tempPoints[i + 1];
                const { dist, x, z } = pointDistanceToSegment(wx, wz, a[0], a[1], b[0], b[1]);
                if (dist < 12 / ppb) {
                    hoverEdge = i;
                    edgePoint = { x, z, edge: i };
                    break;
                }
            }
        }

        if (selectedPoint !== -1) {
            tempPoints[selectedPoint] = [Math.round(wx), Math.round(wz)];
        }
    }
    draw();
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    selectedPoint = -1;
    canvas.style.cursor = isDrawing ? 'crosshair' : 'grab';
});

canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (isDrawing && hoverPoint !== -1) {
        tempPoints.splice(hoverPoint, 1);
        draw();
    }
});

function clampView() {
    viewX = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewX));
    viewY = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewY));
}

// === ZAPIS ===
function savePolygon() {
    if (tempPoints.length < 3) return;
    const poly = {
        points: tempPoints,
        lineColor: editorConfig.lineColor,
        fillColor: editorConfig.fillColor,
        closePath: editorConfig.closePath,
        name: editorConfig.name || 'Nowy',
        category: editorConfig.category
    };
    polygons.push(poly);
    const code = `{
    points: ${JSON.stringify(poly.points)},
    lineColor: '${poly.lineColor}',
    fillColor: '${poly.fillColor}',
    closePath: ${poly.closePath},
    name: '${poly.name}',
    category: ${poly.category}
},`;
    navigator.clipboard.writeText(code).then(() => {
        alert('SKOPIOWANO! Wklej do pozycje.js');
    }).catch(() => prompt('SKOPIUJ:', code));
    isDrawing = false;
    tempPoints = [];
    edgePoint = null;
    canvas.style.cursor = 'grab';
    editorPanel.style.display = 'block';
    info.textContent = 'Zapisano!';
    draw();
}

// === START EDYTORA ===
document.getElementById('startDrawing').addEventListener('click', () => {
    editorPanel.style.display = 'none';
    isDrawing = true;
    tempPoints = [];
    hoverPoint = hoverEdge = -1;
    edgePoint = null;
    canvas.style.cursor = 'crosshair';
    info.textContent = 'Rysuj: klik = punkt | najedź na linię = nowy | scroll = przesuń | + = zapisz';
    draw();
});

window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isDrawing) {
        isDrawing = false;
        tempPoints = [];
        edgePoint = null;
        canvas.style.cursor = 'grab';
        editorPanel.style.display = 'block';
        draw();
    }
});

// === INICJALIZACJA ===
slider.addEventListener('input', e => { zoom = parseFloat(e.target.value); draw(); });
canvas.style.cursor = 'grab';
setTimeout(() => { editorPanel.style.display = 'block'; }, 1000);
draw();