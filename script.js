/* ==============================================================
   MAPA MINECRAFT v19 – PNG + WebP + WSZYSTKIE POZYCJE
   ============================================================== */

const BLOCKS_PER_TILE = { 256: 256, 512: 1024, 1024: 4096 };
const LEVELS = [
    { size: 1024, folder: 0, minZoom: 0.10, maxZoom: 0.30 },
    { size: 512,  folder: 1, minZoom: 0.30, maxZoom: 0.70 },
    { size: 256,  folder: 2, minZoom: 0.70, maxZoom: 40.00 }
];
const WORLD_SIZE = 10000;
const LONG_PRESS_DELAY = 200;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const loading = document.getElementById('loading');
const slider = document.getElementById('zoom-slider');
const zoomLabel = document.getElementById('zoom-label');
const openBtn = document.getElementById('open-editor-btn');
const editorPanel = document.getElementById('editor-panel');
const closeBtn = document.getElementById('close-editor');
const startDrawingBtn = document.getElementById('startDrawing');
const closePathToggle = document.getElementById('closePathToggle');
const codeModal = document.getElementById('code-modal');
const codeText = document.getElementById('code-text');
const copyBtn = document.getElementById('copy-btn');
const closeModalBtn = document.getElementById('close-modal');
const returnBtn = document.getElementById('return-btn');

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

// === STANY ===
let isPanning = false;
let isMouseDown = false;
let panStart = { x: 0, y: 0, viewX: 0, viewY: 0 };
let lastX = 0, lastY = 0;
let touchStartTime = 0;
let isLongPress = false;
let isDraggingPoint = false;

// === WYKRYWANIE URZĄDZENIA ===
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

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
            const isFirst = i === 0;
            const isLast = i === tempPoints.length - 1;
            ctx.beginPath();
            ctx.arc(x, z, 6/zoom, 0, Math.PI*2);
            ctx.fillStyle = (isFirst || (isLast && blink)) ? '#00ffff' : '#ff0000';
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
    }

    ctx.restore();
}

setInterval(() => { blink = !blink; if (isDrawing) draw(); }, 500);

// === RESIZE, TILES, ZOOM ===
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

/* ---------- KLUCZOWA ZMIANA: próba PNG → WebP ---------- */
function loadTile(tx, ty, level) {
    const key = `${level.folder}_${tx}_${ty}`;
    if (cache.has(key)) return cache.get(key);

    // TYLKO folder 2 (256px) ma PNG-i
    const PNG_IN_256 = new Set(['-2_2', '-2_1', '-3_1', '-4_1', '-8_1', '-9_1', '-2_0', '-3_0', '-4_0', '-8_0', '-9_0', '4_-1', '-2_-1', '-3_-1', '-4_-1', '-6_-1', '-7_-1', '-2_-3', '-3_-3', '-2_-4', '1_1', '-1_1', '1_0', '0_0', '-1_0', '1_-1', '-1_-1', '0_1', '0_-1']);

    const tryLoad = (ext) => {
        const img = new Image();
        img.src = `tiles/${level.folder}/${tx}_${ty}.${ext}`;
        const p = new Promise(r => {
            img.onload = () => {
                cache.set(key, img);

                // UKRYJ "ŁADOWANIE v9" OD RAZU PO PIERWSZYM KAFELKU
                if (!loading.style.display || loading.style.display === 'block') {
                    loading.style.opacity = '0';
                    setTimeout(() => loading.style.display = 'none', 300);
                }

                r(img);
            };
            img.onerror = () => r(null);
        });
        cache.set(key, p);
        return p;
    };

    if (level.folder === 2 && PNG_IN_256.has(`${tx}_${ty}`)) {
        const png = tryLoad('png');
        png.then(img => { if (!img) tryLoad('webp'); });
        return png;
    }

    return tryLoad('webp');
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
            } else if (!cache.has(key)) {
                loadTile(tx, ty, level);
            }
        }
    }

    ctx.restore();
    drawPolygons();

    const rect = canvas.getBoundingClientRect();
    const mx = (lastX || cx) - rect.left;
    const my = (lastY || cy) - rect.top;
    const wx = viewX + (mx - cx) / ppb;
    const wz = viewY + (my - cy) / ppb;
    info.textContent = `(${Math.round(wx)}, ${Math.round(wz)})`;
    zoomLabel.textContent = `Zoom: ${zoom.toFixed(2)}x`;
    slider.value = zoom;
}

// === ZOOM ===
let lastDist = 0;
canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
        const t1 = e.touches[0], t2 = e.touches[1];
        lastDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (lastDist === 0) return;
        const delta = (dist - lastDist) / lastDist;
        const mx = (t1.clientX + t2.clientX) / 2;
        const my = (t1.clientY + t2.clientY) / 2;
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
}, { passive: false });

// === HOVER I KLIK ===
function detectHover(x, y) {
    const [wx, wz] = screenToWorld(x, y);
    hoverPoint = -1; hoverEdge = -1; edgePoint = null;

    for (let i = 0; i < tempPoints.length; i++) {
        const [px, pz] = tempPoints[i];
        const [sx, sz] = worldToScreen(px, pz);
        if (Math.hypot(sx - x, sz - y) < 30) {
            hoverPoint = i;
            return;
        }
    }

    if (tempPoints.length > 1) {
        for (let i = 0; i < tempPoints.length - 1; i++) {
            const a = tempPoints[i];
            const b = tempPoints[i + 1];
            const { dist, x: px, z: pz } = pointDistanceToSegment(wx, wz, a[0], a[1], b[0], b[1]);
            if (dist < 15 / getPixelScale().scale) {
                hoverEdge = i;
                edgePoint = { x: px, z: pz, edge: i };
                return;
            }
        }
    }
}

function handleClick(x, y) {
    if (!isDrawing) return;

    if (hoverPoint !== -1) {
        tempPoints.splice(hoverPoint, 1);
    } else if (edgePoint) {
        tempPoints.splice(edgePoint.edge + 1, 0, [Math.round(edgePoint.x), Math.round(edgePoint.z)]);
    } else {
        const [wx, wz] = screenToWorld(x, y);
        tempPoints.push([Math.round(wx), Math.round(wz)]);
    }
    draw();
}

// === MOBILE ===
canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touch = e.touches[0];
    touchStartTime = Date.now();
    isLongPress = false;
    isPanning = false;
    isDraggingPoint = false;
    lastX = touch.clientX;
    lastY = touch.clientY;
    panStart = { x: touch.clientX, y: touch.clientY, viewX, viewY };
    if (isDrawing) detectHover(touch.clientX, touch.clientY);
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touch = e.touches[0];
    lastX = touch.clientX;
    lastY = touch.clientY;

    const elapsed = Date.now() - touchStartTime;

    if (isDrawing && hoverPoint !== -1 && elapsed > 50) {
        isDraggingPoint = true;
        const [wx, wz] = screenToWorld(touch.clientX, touch.clientY);
        tempPoints[hoverPoint] = [Math.round(wx), Math.round(wz)];
    } else if (elapsed > LONG_PRESS_DELAY && !isPanning && hoverPoint === -1) {
        isPanning = true;
    }

    if (isPanning) {
        const ppb = getPixelScale().scale;
        viewX = panStart.viewX - (touch.clientX - panStart.x) / ppb;
        viewY = panStart.viewY - (touch.clientY - panStart.y) / ppb;
        clampView();
    }

    draw();
}, { passive: false });

canvas.addEventListener('touchend', e => {
    const elapsed = Date.now() - touchStartTime;
    if (!isPanning && !isDraggingPoint && elapsed < 300) {
        handleClick(lastX, lastY);
    }
    resetStates();
});

// === PC ===
canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    isMouseDown = true;
    lastX = e.clientX;
    lastY = e.clientY;
    panStart = { x: e.clientX, y: e.clientY, viewX, viewY };
    if (isDrawing) detectHover(e.clientX, e.clientY);
});

window.addEventListener('mousemove', e => {
    lastX = e.clientX;
    lastY = e.clientY;

    if (!isMouseDown) {
        if (isDrawing) detectHover(e.clientX, e.clientY);
        draw();
        return;
    }

    if (isDrawing && hoverPoint !== -1) {
        isDraggingPoint = true;
        const [wx, wz] = screenToWorld(e.clientX, e.clientY);
        tempPoints[hoverPoint] = [Math.round(wx), Math.round(wz)];
    } else {
        isPanning = true;
        const ppb = getPixelScale().scale;
        viewX = panStart.viewX - (e.clientX - panStart.x) / ppb;
        viewY = panStart.viewY - (e.clientY - panStart.y) / ppb;
        clampView();
    }

    draw();
});

window.addEventListener('mouseup', e => {
    if (e.button !== 0) return;

    if (isMouseDown && !isPanning && !isDraggingPoint) {
        handleClick(e.clientX, e.clientY);
    }

    isMouseDown = false;
    resetStates();
});

canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (isDrawing && hoverPoint !== -1) {
        tempPoints.splice(hoverPoint, 1);
        draw();
    }
});

// === ZOOM KOŁEM ===
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

function resetStates() {
    isPanning = false;
    isLongPress = false;
    isDraggingPoint = false;
    hoverPoint = -1;
    hoverEdge = -1;
    edgePoint = null;
    canvas.style.cursor = isDrawing ? 'crosshair' : 'grab';
}

// === ZAPIS ===
function savePolygon() {
    if (tempPoints.length < 3) {
        alert("Za mało punktów! Minimum 3.");
        return;
    }
    const poly = { ...editorConfig, points: tempPoints };
    if (editorConfig.name) poly.name = editorConfig.name;

    let fullCode = '{\n';
    fullCode += '    points: ' + JSON.stringify(tempPoints) + ',\n';
    fullCode += '    lineColor: "' + poly.lineColor + '",\n';
    fullCode += '    fillColor: "' + poly.fillColor + '",\n';
    fullCode += '    closePath: ' + poly.closePath + ',\n';
    if (poly.name) fullCode += '    name: "' + poly.name + '",\n';
    fullCode += '    category: ' + poly.category + '\n';
    fullCode += '},';

    codeText.value = fullCode;
    codeModal.style.display = 'block';
    window.tempPoly = poly;
}

function finalizeSave(add = true) {
    if (add) polygons.push(window.tempPoly);
    isDrawing = false;
    tempPoints = [];
    canvas.style.cursor = 'grab';
    editorPanel.style.display = 'none';
    openBtn.style.display = 'block';
    info.textContent = 'ZAPISANO!';
    draw();
    delete window.tempPoly;
}

function clampView() {
    viewX = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewX));
    viewY = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewY));
}

// === UI ===
openBtn.addEventListener('click', () => {
    editorPanel.style.display = 'block';
    openBtn.style.display = 'none';
    startDrawingBtn.textContent = isDrawing ? 'ZAKOŃCZ RYSOWANIE' : 'ROZPOCZNIJ RYSOWANIE';
    closePathToggle.textContent = editorConfig.closePath ? 'ON' : 'OFF';
    closePathToggle.style.background = editorConfig.closePath ? '#0f0' : '#f00';
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector(`.cat-btn[data-cat="${editorConfig.category}"]`).classList.add('selected');
});

closeBtn.addEventListener('click', () => {
    if (isDrawing) {
        isDrawing = false;
        tempPoints = [];
        canvas.style.cursor = 'grab';
        draw();
    }
    editorPanel.style.display = 'none';
    openBtn.style.display = 'block';
});

document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        editorConfig.category = parseInt(btn.dataset.cat);
        if (editorConfig.category === 3) {
            editorConfig.lineColor = '#ffffff99';
            editorConfig.fillColor = '#ffffff33';
            document.getElementById('lineColor').value = '#ffffff';
            document.getElementById('lineColor').disabled = true;
        } else {
            document.getElementById('lineColor').disabled = false;
        }
        if (isDrawing) draw();
    });
});

closePathToggle.addEventListener('click', () => {
    editorConfig.closePath = !editorConfig.closePath;
    closePathToggle.textContent = editorConfig.closePath ? 'ON' : 'OFF';
    closePathToggle.style.background = editorConfig.closePath ? '#0f0' : '#f00';
    if (isDrawing) draw();
});

document.getElementById('lineColor').addEventListener('input', e => {
    const hex = e.target.value;
    editorConfig.lineColor = hex;
    editorConfig.fillColor = hex + '33';
    if (isDrawing) draw();
});

document.getElementById('polyName').addEventListener('input', e => {
    editorConfig.name = e.target.value;
    if (isDrawing) draw();
});

startDrawingBtn.addEventListener('click', () => {
    editorPanel.style.display = 'none';
    openBtn.style.display = 'block';
    if (!isDrawing) {
        isDrawing = true;
        tempPoints = [];
        canvas.style.cursor = 'crosshair';
        info.textContent = isMobile ? 'Tap=dodaj | tap punkt=usuń | przytrzymaj=przesuń' : 'Klik=dodaj | prawy=usuń | przytrzymaj=przesuń';
    } else {
        savePolygon();
    }
    draw();
});

window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isDrawing) {
        isDrawing = false;
        tempPoints = [];
        canvas.style.cursor = 'grab';
        editorPanel.style.display = 'none';
        openBtn.style.display = 'block';
        draw();
    }
});

slider.addEventListener('input', e => {
    zoom = parseFloat(e.target.value);
    draw();
});

// === MODAL ===
copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(codeText.value).then(() => alert('SKOPIOWANO!')).catch(() => prompt('WKLEJ DO pozycje.js:', codeText.value));
});

closeModalBtn.addEventListener('click', () => {
    codeModal.style.display = 'none';
    finalizeSave(true);
});

returnBtn.addEventListener('click', () => {
    codeModal.style.display = 'none';
    isDrawing = true;
    canvas.style.cursor = 'crosshair';
    draw();
});

canvas.style.cursor = 'grab';
draw();