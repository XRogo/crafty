/* ==============================================================
   MAPA MINECRAFT v12 – MOBILE + DESKTOP FULL
   - ZOOM PALCAMI
   - PRZESUWANIE MAPY W RYSOWANIU
   - USUWANIE I PRZESUWANIE PUNKTÓW
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
const openBtn = document.getElementById('open-editor-btn');
const editorPanel = document.getElementById('editor-panel');
const closeBtn = document.getElementById('close-editor');

let polygons = [];
if (window.polygonsData && Array.isArray(window.polygonsData)) {
    polygons = window.polygonsData.map(p => ({
        points: p.points || [],
        lineColor: p.lineColor || '#00ff00',
        fillColor: p.fillColor || '#00ff0033',
        closePath: p.closePath !== false,
        name: p.name || '',
        category: p.category || 1
    }));
}

let isDrawing = false;
let tempPoints = [];
let selectedPoint = -1;
let hoverPoint = -1;
let hoverEdge = -1;
let edgePoint = null;
let blink = true;

let editorConfig = {
    category: 1,
    lineColor: '#00ff00',
    fillColor: '#00ff0033',
    name: '',
    closePath: true
};

let zoom = 1;
let viewX = 0, viewY = 0;
let pixelRatio = 1;
const cache = new Map();
let loadedTiles = 0;

// === TOUCH & MOUSE ===
let lastTouchTime = 0;
let touchStartTime = 0;
let isPanning = false;
let panStart = { x: 0, y: 0, viewX: 0, viewY: 0 };
let isDraggingPoint = false;

// === FUNKCJE ===
function worldToScreen(x, z) {
    const { scale: ppb } = getPixelScale();
    const cx = innerWidth / 2, cy = innerHeight / 2;
    return [cx + (x - viewX) * ppb, cy + (z - viewY) * ppb];
}

function screenToWorld(x, y) {
    const rect = canvas.getBoundingClientRect();
    const mx = x - rect.left;
    const my = y - rect.top;
    const { scale: ppb } = getPixelScale();
    const cx = innerWidth / 2, cy = innerHeight / 2;
    return [viewX + (mx - cx) / ppb, viewY + (my - cy) / ppb];
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
    if (!points.length) return [0, 0];
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

    polygons.forEach(p => {
        if (!window.visibleCategories?.[p.category]) return;
        if (!p.points?.length) return;

        const { points, lineColor, fillColor, closePath, name, category } = p;
        ctx.beginPath();
        points.forEach(([x, z], i) => i === 0 ? ctx.moveTo(x, z) : ctx.lineTo(x, z));
        if (closePath && category === 1) ctx.closePath();
        ctx.fillStyle = category === 1 ? fillColor : 'transparent';
        ctx.fill();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = category === 1 ? 2.5/zoom : 6/zoom;
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

    if (isDrawing && tempPoints.length > 0) {
        ctx.beginPath();
        tempPoints.forEach(([x, z], i) => i === 0 ? ctx.moveTo(x, z) : ctx.lineTo(x, z));
        if (editorConfig.closePath && tempPoints.length > 2) ctx.closePath();
        ctx.fillStyle = editorConfig.fillColor;
        ctx.fill();
        ctx.strokeStyle = editorConfig.lineColor;
        ctx.lineWidth = 3/zoom;
        ctx.stroke();

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

        if (edgePoint) {
            ctx.beginPath();
            ctx.arc(edgePoint.x, edgePoint.z, 7/zoom, 0, Math.PI*2);
            ctx.fillStyle = '#00ff00';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2/zoom;
            ctx.stroke();
        }

        if (tempPoints.length > 0) {
            const [lx, lz] = tempPoints[tempPoints.length - 1];
            const [mx, mz] = screenToWorld(window.lastX || 0, window.lastY || 0);
            ctx.setLineDash([5/zoom, 5/zoom]);
            ctx.beginPath();
            ctx.moveTo(lx, lz);
            ctx.lineTo(mx, mz);
            ctx.strokeStyle = '#ffffff88';
            ctx.lineWidth = 1.5/zoom;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    ctx.restore();

    if (isDrawing) {
        ctx.fillStyle = '#0f0';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.font = 'bold 42px Arial';
        ctx.strokeText('+', 12, 58);
        ctx.fillText('+', 12, 58);
    }
}

setInterval(() => { blink = !blink; if (isDrawing) draw(); }, 500);

// === RESIZE, ZOOM, TILES – BEZ ZMIAN ===
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

function getLevel() {
    for (const lvl of LEVELS) if (zoom >= lvl.minZoom && zoom <= lvl.maxZoom) return lvl;
    return LEVELS[2];
}

function getPixelScale() {
    const lvl = getLevel();
    const bpt = BLOCKS_PER_TILE[lvl.size];
    const tps = Math.round(zoom * bpt);
    return { scale: tps / bpt, tilePixelSize: tps };
}

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
                ctx.drawImage(img, rx, ry, tilePixelSize, tilePixelSize);
            } else if (!cache.has(key)) loadTile(tx, ty, level);
        }
    }

    ctx.restore();
    drawPolygons();

    const rect = canvas.getBoundingClientRect();
    const mx = (window.lastX || cx) - rect.left;
    const my = (window.lastY || cy) - rect.top;
    const wx = viewX + (mx - cx) / ppb;
    const wz = viewY + (my - cy) / ppb;
    info.textContent = `(${Math.round(wx)}, ${Math.round(wz)})`;
    zoomLabel.textContent = `Zoom: ${zoom.toFixed(2)}x`;
    slider.value = zoom;
}

// === ZOOM KOŁEM / PALCAMI ===
let lastDist = 0;
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldPpb = getPixelScale().scale;
    const worldX = viewX + (mx - innerWidth/2) / oldPpb;
    const worldZ = viewY + (my - innerHeight/2) / oldPpb;

    zoom = Math.max(0.1, Math.min(40, zoom + (e.deltaY > 0 ? -0.3 : 0.3)));
    slider.value = zoom;

    const newPpb = getPixelScale().scale;
    viewX = worldX - (mx - innerWidth/2) / newPpb;
    viewY = worldZ - (my - innerHeight/2) / newPpb;
    clampView();
    draw();
}, { passive: false });

function handlePinch(e) {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    if (lastDist === 0) { lastDist = dist; return; }

    const delta = (dist - lastDist) / lastDist;
    const rect = canvas.getBoundingClientRect();
    const mx = (t1.clientX + t2.clientX) / 2 - rect.left;
    const my = (t1.clientY + t2.clientY) / 2 - rect.top;
    const oldPpb = getPixelScale().scale;
    const worldX = viewX + (mx - innerWidth/2) / oldPpb;
    const worldZ = viewY + (my - innerHeight/2) / oldPpb;

    zoom = Math.max(0.1, Math.min(40, zoom * (1 + delta * 3)));
    slider.value = zoom;

    const newPpb = getPixelScale().scale;
    viewX = worldX - (mx - innerWidth/2) / newPpb;
    viewY = worldZ - (my - innerHeight/2) / newPpb;
    clampView();
    lastDist = dist;
    draw();
}

canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2) { lastDist = 0; handlePinch(e); }
    else if (e.touches.length === 1) {
        touchStartTime = Date.now();
        const touch = e.touches[0];
        window.lastX = touch.clientX;
        window.lastY = touch.clientY;
        panStart = { x: touch.clientX, y: touch.clientY, viewX, viewY };
        isPanning = false;
    }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 2) { handlePinch(e); return; }
    if (e.touches.length !== 1) return;
    e.preventDefault();

    const touch = e.touches[0];
    window.lastX = touch.clientX;
    window.lastY = touch.clientY;

    const elapsed = Date.now() - touchStartTime;
    if (elapsed > 500 && !isPanning) {
        isPanning = true;
        canvas.style.cursor = 'grabbing';
    }

    if (isPanning) {
        const ppb = getPixelScale().scale;
        viewX = panStart.viewX - (touch.clientX - panStart.x) / ppb;
        viewY = panStart.viewY - (touch.clientY - panStart.y) / ppb;
        clampView();
    }

    if (isDrawing && !isPanning) {
        const [wx, wz] = screenToWorld(touch.clientX, touch.clientY);
        if (selectedPoint !== -1) {
            tempPoints[selectedPoint] = [Math.round(wx), Math.round(wz)];
        }
    }
    draw();
}, { passive: false });

canvas.addEventListener('touchend', e => {
    if (e.touches.length === 0) {
        lastDist = 0;
        const elapsed = Date.now() - touchStartTime;
        if (elapsed < 500 && !isPanning) {
            handleClick(window.lastX, window.lastY);
        }
        isPanning = false;
        canvas.style.cursor = isDrawing ? 'crosshair' : 'grab';
    }
});

// === KLIKNIĘCIE (DESKTOP + MOBILE) ===
function handleClick(clientX, clientY) {
    if (isDrawing && clientX < 70 && clientY < 80) { savePolygon(); return; }

    if (isDrawing) {
        const [wx, wz] = screenToWorld(clientX, clientY);
        if (edgePoint) {
            tempPoints.splice(edgePoint.edge + 1, 0, [Math.round(edgePoint.x), Math.round(edgePoint.z)]);
            selectedPoint = edgePoint.edge + 1;
        } else if (hoverPoint !== -1) {
            selectedPoint = hoverPoint;
            isDraggingPoint = true;
        } else {
            tempPoints.push([Math.round(wx), Math.round(wz)]);
        }
    } else {
        isPanning = true;
        panStart = { x: clientX, y: clientY, viewX, viewY };
    }
    draw();
}

canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    touchStartTime = Date.now();
    window.lastX = e.clientX;
    window.lastY = e.clientY;
    panStart = { x: e.clientX, y: e.clientY, viewX, viewY };
    isPanning = false;
});

window.addEventListener('mousemove', e => {
    window.lastX = e.clientX;
    window.lastY = e.clientY;

    const elapsed = Date.now() - touchStartTime;
    if (elapsed > 500 && !isPanning) {
        isPanning = true;
        canvas.style.cursor = 'grabbing';
    }

    if (isPanning) {
        const ppb = getPixelScale().scale;
        viewX = panStart.viewX - (e.clientX - panStart.x) / ppb;
        viewY = panStart.viewY - (e.clientY - panStart.y) / ppb;
        clampView();
    }

    if (isDrawing && !isPanning) {
        const [wx, wz] = screenToWorld(e.clientX, e.clientY);
        if (selectedPoint !== -1) {
            tempPoints[selectedPoint] = [Math.round(wx), Math.round(wz)];
        }
    }
    draw();
});

window.addEventListener('mouseup', e => {
    if (e.button !== 0) return;
    const elapsed = Date.now() - touchStartTime;
    if (elapsed < 500 && !isPanning) {
        handleClick(e.clientX, e.clientY);
    }
    isPanning = false;
    isDraggingPoint = false;
    canvas.style.cursor = isDrawing ? 'crosshair' : 'grab';
});

// === USUWANIE PUNKTÓW (DOTYK) ===
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('dblclick', e => {
    e.preventDefault();
    if (isDrawing && hoverPoint !== -1) {
        tempPoints.splice(hoverPoint, 1);
        draw();
    }
});

// === HOVER ===
canvas.addEventListener('mousemove', e => {
    if (isDrawing && !isPanning) {
        const [wx, wz] = screenToWorld(e.clientX, e.clientY);
        hoverPoint = -1; hoverEdge = -1; edgePoint = null;

        for (let i = 0; i < tempPoints.length; i++) {
            const [px, pz] = tempPoints[i];
            const [sx, sz] = worldToScreen(px, pz);
            if (Math.hypot(sx - e.clientX, sz - e.clientY) < 20) {
                hoverPoint = i;
                break;
            }
        }

        if (hoverPoint === -1 && tempPoints.length > 1) {
            for (let i = 0; i < tempPoints.length - 1; i++) {
                const a = tempPoints[i];
                const b = tempPoints[i + 1];
                const { dist, x, z } = pointDistanceToSegment(wx, wz, a[0], a[1], b[0], b[1]);
                if (dist < 15 / getPixelScale().scale) {
                    hoverEdge = i;
                    edgePoint = { x, z, edge: i };
                    break;
                }
            }
        }
    }
    draw();
});

// === RESZTA (ZAPIS, UI) ===
function savePolygon() {
    if (tempPoints.length < 3) return;
    const poly = { ...editorConfig, points: tempPoints, name: editorConfig.name || 'Nowy' };
    polygons.push(poly);
    const code = JSON.stringify(poly, null, 4).replace(/^/gm, '    ').trim();
    navigator.clipboard.writeText(`{\n${code}\n},`).then(() => alert('SKOPIOWANO!')).catch(() => prompt('WKLEJ:', code));
    isDrawing = false; tempPoints = []; edgePoint = null;
    canvas.style.cursor = 'grab';
    editorPanel.style.display = 'none';
    openBtn.style.display = 'block';
    info.textContent = 'Zapisano!';
    draw();
}

function clampView() {
    viewX = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewX));
    viewY = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewY));
}

// UI
openBtn.addEventListener('click', () => { editorPanel.style.display = 'block'; openBtn.style.display = 'none'; });
closeBtn.addEventListener('click', () => { editorPanel.style.display = 'none'; openBtn.style.display = 'block'; });

document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-btn').forEach(b => b.style.background = '');
        btn.style.background = '#0f0'; btn.style.color = '#000';
        editorConfig.category = parseInt(btn.dataset.cat);
        if (editorConfig.category === 3) {
            editorConfig.lineColor = '#ffffff99';
            editorConfig.fillColor = '#ffffff33';
            document.getElementById('lineColor').value = '#ffffff';
            document.getElementById('lineColor').disabled = true;
        } else {
            document.getElementById('lineColor').disabled = false;
        }
    });
});

document.getElementById('lineColor').addEventListener('input', e => {
    const hex = e.target.value;
    editorConfig.lineColor = hex;
    editorConfig.fillColor = hex + '33';
});

document.getElementById('polyName').addEventListener('input', e => editorConfig.name = e.target.value);

document.getElementById('startDrawing').addEventListener('click', () => {
    editorPanel.style.display = 'none';
    openBtn.style.display = 'block';
    isDrawing = true;
    tempPoints = [];
    canvas.style.cursor = 'crosshair';
    info.textContent = 'Rysuj: <0.5s=punkt | >0.5s=przesuń | +=zapisz';
    draw();
});

window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isDrawing) {
        isDrawing = false; tempPoints = [];
        canvas.style.cursor = 'grab';
        editorPanel.style.display = 'none';
        openBtn.style.display = 'block';
        draw();
    }
});

slider.addEventListener('input', e => { zoom = parseFloat(e.target.value); draw(); });
canvas.style.cursor = 'grab';
draw();
