/* ==============================================================
   MAPA MINECRAFT v21 – FINALNA WERSJA – WSZYSTKO DZIAŁA!
   ============================================================== */

// POLIGONY I STANY – NAJPIERW!
let polygons = [];
let isDrawing = false;
let tempPoints = [];
let hoverPoint = -1;
let hoverEdge = -1;
let hoverConnection = -1;
let edgePoint = null;
let blink = true;
let selectingFrom = false;
let settingIn = false;
let settingOut = false;
let inPointIndex = -1;
let outPointIndex = -1;
let connectionBlinkColor = '#ffff00'; // żółty/niebiesko
let isStartSnapped = false;
let isEndSnapped = false;
const SNAP_THRESHOLD = 10; // próg snap w blokach

if (window.polygonsData && Array.isArray(window.polygonsData)) {
    polygons = window.polygonsData.map(p => ({
        points: p.points || [],
        location: p.location || null,
        lineColor: p.lineColor || '#00ff00',
        fillColor: p.fillColor || '#00ff0033',
        closePath: p.closePath !== false,
        name: p.name || '',
        opis: p.opis || '',
        category: p.category === 1 ? 'terrain' : p.category === 3 ? 'road' : p.category || 'terrain',
        temporary: p.temporary || false,
        in: p.in || null,
        out: p.out || null,
        from: p.from || null,
        to: p.to || null
    }));
}

let editorConfig = {
    category: 'terrain',
    lineColor: '#00ff00',
    fillColor: '#00ff0033',
    name: '',
    opis: '',
    closePath: true,
    temporary: false,
    from: null,
    to: null
};

//wczytywanie mapy
const BLOCKS_PER_TILE = { 256: 256, 512: 1024, 1024: 4096 };
const LEVELS = [
    { size: 1024, folder: 0, minZoom: 0.10, maxZoom: 0.30 },
    { size: 512, folder: 1, minZoom: 0.30, maxZoom: 0.70 },
    { size: 256, folder: 2, minZoom: 0.70, maxZoom: 40.00 }
];
const WORLD_SIZE = 10000;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const loading = document.getElementById('loading');
const slider = document.getElementById('zoom-slider');
const zoomLabel = document.getElementById('zoom-label');
const openBtn = document.getElementById('open-editor-btn');
const openRailBtn = document.getElementById('open-rail-btn');
const editModeBtn = document.getElementById('edit-mode-btn');
const railPanel = document.getElementById('rail-mode-panel');
const closeRail = document.getElementById('close-rail');
const editorPanel = document.getElementById('editor-panel');
const closeBtn = document.getElementById('close-editor');
const startDrawingBtn = document.getElementById('startDrawing');
const closePathToggle = document.getElementById('closePathToggle');
const temporaryToggle = document.getElementById('temporaryToggle');
const codeModal = document.getElementById('code-modal');
const codeText = document.getElementById('code-text');
const copyBtn = document.getElementById('copy-btn');
const closeModalBtn = document.getElementById('close-modal');
const returnBtn = document.getElementById('return-btn');
const railInfo = document.getElementById('rail-info');
const railEditorPanel = document.getElementById('rail-editor-panel');
const closeRailEditor = document.getElementById('close-rail-editor');
const railCategory = document.getElementById('rail-category');
const railTemporaryToggle = document.getElementById('rail-temporaryToggle');
const railLineColor = document.getElementById('rail-lineColor');
const railPolyName = document.getElementById('rail-polyName');
const railPolyDesc = document.getElementById('rail-polyDesc');
const railOpisSection = document.getElementById('rail-opis-section');
const railStationButtons = document.getElementById('rail-station-buttons');
const railAddInBtn = document.getElementById('rail-add-in-btn');
const railAddOutBtn = document.getElementById('rail-add-out-btn');
const railStartDrawing = document.getElementById('rail-startDrawing');
const catSelection = document.getElementById('cat-selection');

let zoom = 1;
let viewX = 0, viewY = 0;
let pixelRatio = 1;
const cache = new Map();
let isPanning = false;
let panStart = { x: 0, y: 0, viewX: 0, viewY: 0 };
let lastX = 0, lastY = 0;
let isDraggingPoint = false;
let draggedPointIndex = -1;
let clickStartTime = 0;
let clickStartX = 0, clickStartY = 0;
let clickWasOnPoint = false;
let clickWasOnEdge = false;

// Widoczność
window.visibleCategories = {
    'terrain': true,
    'road': true,
    'station': true,
    'intersection': true,
    'rail': true
};
window.visibleTemporary = false;

//wczytywanie mapy – resize i skalowanie
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

//wczytywanie mapy – ładowanie kafelków
function loadTile(tx, ty, level) {
    const key = `${level.folder}_${tx}_${ty}`;
    if (cache.has(key)) return cache.get(key);
    const PNG_IN_256 = new Set(['-2_2', '-2_1', '-3_1', '-4_1', '-8_1', '-9_1', '-2_0', '-3_0', '-4_0', '-8_0', '-9_0', '4_-1', '-2_-1', '-3_-1', '-4_-1', '-6_-1', '-7_-1', '-2_-3', '-3_-3', '-2_-4', '1_1', '-1_1', '1_0', '0_0', '-1_0', '1_-1', '-1_-1', '0_1', '0_-1']);
    const tryLoad = (ext) => {
        const img = new Image();
        img.src = `tiles/${level.folder}/${tx}_${ty}.${ext}`;
        const p = new Promise(r => {
            img.onload = () => {
                cache.set(key, img);
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

function drawTiles() {
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
}

//informacje o pozycji i zoomie
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

slider.addEventListener('input', e => {
    zoom = parseFloat(e.target.value);
    draw();
});

function updateInfo() {
    const rect = canvas.getBoundingClientRect();
    const mx = (lastX || innerWidth/2) - rect.left;
    const my = (lastY || innerHeight/2) - rect.top;
    const [wx, wz] = screenToWorld(mx + rect.left, my + rect.top);
    info.textContent = `(${Math.round(wx)}, ${Math.round(wz)})`;
    zoomLabel.textContent = `Zoom: ${zoom.toFixed(2)}x`;
    slider.value = zoom;
}

//wyświetlanie poligonów – pomocnicze
function calculateCentroid(points) {
    if (!points.length) return [0, 0];
    let x = 0, z = 0;
    points.forEach(p => { x += p[0]; z += p[1]; });
    return [x / points.length, z / points.length];
}

function drawTextAlongPath(text, points, offset = 0, color = 'white') {
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
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const segLen = Math.hypot(dx, dz);
        if (travelled + segLen >= target) {
            const ratio = (target - travelled) / segLen;
            const x = a[0] + dx * ratio;
            const z = a[1] + dz * ratio;
            const angle = Math.atan2(dz, dx);
            ctx.save();
            ctx.translate(x, z);
            ctx.rotate(angle);
            ctx.font = `${14 / zoom}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2 / zoom;
            ctx.strokeText(text, 0, 0);
            ctx.fillStyle = color;
            ctx.fillText(text, 0, 0);
            ctx.restore();
            return;
        }
        travelled += segLen;
    }
}

//wyświetlanie poligonów – RYSOWANIE (Z RESTORE!)
function drawPolygons() {
    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);
    const { scale: ppb } = getPixelScale();
    const cx = innerWidth / 2, cy = innerHeight / 2;
    ctx.translate(cx, cy);
    ctx.scale(ppb, ppb);
    ctx.translate(-viewX, -viewY);

    polygons.forEach((p) => {
        if (!window.visibleCategories[p.category]) return;
        if (p.temporary && !window.visibleTemporary) return;
        let points = p.points || [];
        if (p.category === 'intersection' && p.location) {
            const [cx, cz] = p.location[0];
            const size = 1.5;
            points = [
                [cx - size, cz - size],
                [cx + size, cz - size],
                [cx + size, cz + size],
                [cx - size, cz + size]
            ];
        }
        if (!points?.length) return;
        const { lineColor, fillColor, closePath, name, category, temporary } = p;

        ctx.beginPath();
        points.forEach(([x, z], i) => i === 0 ? ctx.moveTo(x, z) : ctx.lineTo(x, z));
        if (closePath) ctx.closePath();

        ctx.fillStyle = (['terrain', 'station', 'intersection'].includes(category) ? fillColor : 'transparent');
        ctx.fill();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = (['terrain', 'station', 'intersection'].includes(category) ? 2.5 / zoom : 6 / zoom);
        ctx.stroke();

        if (name && (['terrain', 'station', 'intersection'].includes(category) || zoom > 3)) {
            ctx.font = `${14 / zoom}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (['terrain', 'station', 'intersection'].includes(category)) {
                const [cx, cz] = calculateCentroid(points);
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 1.5 / zoom;
                ctx.strokeText(name, cx, cz);
                ctx.fillStyle = 'white';
                ctx.fillText(name, cx, cz);
            } else {
                drawTextAlongPath(name, points, 0, 'white');
            }
        }
    });
    ctx.restore(); // NAPRAWIONE!
}

//rysowanie i edytowanie – tymczasowy poligon
function drawTempPolygon() {
    if (!isDrawing || tempPoints.length === 0) return;
    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);
    const { scale: ppb } = getPixelScale();
    const cx = innerWidth / 2, cy = innerHeight / 2;
    ctx.translate(cx, cy);
    ctx.scale(ppb, ppb);
    ctx.translate(-viewX, -viewY);

    let points = tempPoints;
    if (editorConfig.category === 'intersection' && tempPoints.length === 1) {
        const [cx, cz] = tempPoints[0];
        const size = 1.5;
        points = [
            [cx - size, cz - size],
            [cx + size, cz - size],
            [cx + size, cz + size],
            [cx - size, cz + size]
        ];
    }
    ctx.beginPath();
    points.forEach(([x, z], i) => i === 0 ? ctx.moveTo(x, z) : ctx.lineTo(x, z));
    if (editorConfig.closePath && points.length > 2) ctx.closePath();
    ctx.fillStyle = (['terrain', 'station', 'intersection'].includes(editorConfig.category) ? editorConfig.fillColor : 'transparent');
    ctx.fill();
    ctx.strokeStyle = editorConfig.lineColor;
    ctx.lineWidth = (['terrain', 'station', 'intersection'].includes(editorConfig.category) ? 3/zoom : 6/zoom);
    ctx.stroke();

    const drawPoints = editorConfig.category === 'intersection' ? (tempPoints.length ? [tempPoints[0]] : []) : tempPoints;
    drawPoints.forEach(([x, z], i) => {
        const isFirst = i === 0;
        const isLast = i === drawPoints.length - 1;
        ctx.beginPath();
        ctx.arc(x, z, 6 / zoom, 0, Math.PI*2);
        let fill = (isFirst || (isLast && blink)) ? '#00ffff' : '#ff0000';
        if (editorConfig.category === 'station') {
            if (i === inPointIndex) fill = '#00ff00';
            if (i === outPointIndex) fill = '#ff00ff';
        }
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
    });

    if (edgePoint) {
        ctx.beginPath();
        ctx.arc(edgePoint.x, edgePoint.z, 7 / zoom, 0, Math.PI*2);
        ctx.fillStyle = '#00ff00';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
    }
    ctx.restore();
}

//miganie punktu
setInterval(() => { 
    blink = !blink; 
    connectionBlinkColor = blink ? '#ffff00' : '#0000ff';
    if (isDrawing) draw(); 
}, 500);

//rysowanie i edytowanie – wykrywanie
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

function getConnectionPoints() {
    let points = [];
    polygons.forEach(p => {
        if (p.category === 'station') {
            if (p.in) points.push({ pos: p.in[0], name: `${p.name}[in]`, category: p.category });
            if (p.out) points.push({ pos: p.out[0], name: `${p.name}[out]`, category: p.category });
        } else if (p.category === 'intersection' && p.location) {
            points.push({ pos: p.location[0], name: p.name, category: p.category });
        }
    });
    return points;
}

function findNearestConnection(wx, wz) {
    const conn = getConnectionPoints();
    let nearest = null;
    let minDist = SNAP_THRESHOLD;
    conn.forEach(c => {
        const dist = Math.hypot(c.pos[0] - wx, c.pos[1] - wz);
        if (dist < minDist) {
            minDist = dist;
            nearest = c;
        }
    });
    return nearest;
}

function detectHover(x, y) {
    hoverPoint = -1; hoverEdge = -1; edgePoint = null; hoverConnection = -1;
    const [wx, wz] = screenToWorld(x, y);
    if (isDrawing && editorConfig.category === 'rail' && selectingFrom) {
        const conn = getConnectionPoints();
        for (let i = 0; i < conn.length; i++) {
            const [px, pz] = conn[i].pos;
            const [sx, sz] = worldToScreen(px, pz);
            if (Math.hypot(sx - x, sz - y) < 30) {
                hoverConnection = i;
                return;
            }
        }
    }
    const drawPoints = editorConfig.category === 'intersection' ? (tempPoints.length ? [tempPoints[0]] : []) : tempPoints;
    for (let i = 0; i < drawPoints.length; i++) {
        const [px, pz] = drawPoints[i];
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

//obsługa myszy i dotyku
canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    lastX = e.clientX; lastY = e.clientY;
    clickStartTime = Date.now();
    clickStartX = e.clientX; clickStartY = e.clientY;
    clickWasOnPoint = false;
    clickWasOnEdge = false;

    if (isDrawing) {
        detectHover(e.clientX, e.clientY);
        if (hoverPoint !== -1) {
            clickWasOnPoint = true;
            isDraggingPoint = true;
            draggedPointIndex = hoverPoint;
            canvas.setPointerCapture(e.pointerId);
            return;
        }
        if (hoverEdge !== -1 && edgePoint) {
            clickWasOnEdge = true;
            canvas.setPointerCapture(e.pointerId);
            return;
        }
    }

    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY, viewX, viewY };
    canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', e => {
    lastX = e.clientX; lastY = e.clientY;
    if (isDraggingPoint && draggedPointIndex !== -1) {
        let [wx, wz] = screenToWorld(e.clientX, e.clientY);
        if (editorConfig.category === 'rail' && (draggedPointIndex === 0 || draggedPointIndex === tempPoints.length - 1)) {
            const nearest = findNearestConnection(wx, wz);
            if (nearest) {
                wx = nearest.pos[0];
                wz = nearest.pos[1];
                if (draggedPointIndex === 0) {
                    editorConfig.from = nearest.name;
                    isStartSnapped = true;
                } else {
                    editorConfig.to = nearest.name;
                    isEndSnapped = true;
                }
            } else {
                if (draggedPointIndex === 0) {
                    editorConfig.from = null;
                    isStartSnapped = false;
                } else {
                    editorConfig.to = null;
                    isEndSnapped = false;
                }
            }
        }
        if (editorConfig.category === 'intersection') {
            tempPoints[draggedPointIndex] = [Math.round(wx), Math.round(wz)];
        } else {
            tempPoints[draggedPointIndex] = [Math.round(wx), Math.round(wz)];
        }
        updateRailInfo();
        draw();
        return;
    }

    if (isPanning) {
        const ppb = getPixelScale().scale;
        viewX = panStart.viewX - (e.clientX - panStart.x) / ppb;
        viewY = panStart.viewY - (e.clientY - panStart.y) / ppb;
        clampView();
        draw();
    }

    if (isDrawing) {
        detectHover(e.clientX, e.clientY);
        draw();
    }
});

canvas.addEventListener('pointerup', e => {
    const elapsed = Date.now() - clickStartTime;
    const dist = Math.hypot(e.clientX - clickStartX, e.clientY - clickStartY);

    // Zawsze kończymy przeciąganie
    if (isDraggingPoint) {
        isDraggingPoint = false;
        draggedPointIndex = -1;
        canvas.releasePointerCapture(e.pointerId);
    }

    // Zakończ panoramowanie
    if (isPanning) {
        isPanning = false;
        canvas.releasePointerCapture(e.pointerId);
    }

    // Rysowanie – bez zmian
    if (elapsed <= 200 && dist < 20 && isDrawing) {
        let [wx, wz] = screenToWorld(e.clientX, e.clientY);
        detectHover(e.clientX, e.clientY);

        if (editorConfig.category === 'station' && (settingIn || settingOut) && hoverPoint !== -1) {
            if (settingIn) {
                inPointIndex = hoverPoint;
                railAddInBtn.textContent = `[${tempPoints[inPointIndex][0]}, ${tempPoints[inPointIndex][1]}] IN`;
                railAddInBtn.style.background = '#00ff00';
            }
            if (settingOut) {
                outPointIndex = hoverPoint;
                railAddOutBtn.textContent = `[${tempPoints[outPointIndex][0]}, ${tempPoints[outPointIndex][1]}] OUT`;
                railAddOutBtn.style.background = '#ff00ff';
            }
            settingIn = false;
            settingOut = false;
            canvas.style.cursor = 'crosshair';
            draw();
            return;
        }

        if (editorConfig.category === 'rail' && selectingFrom && hoverConnection !== -1) {
            const conn = getConnectionPoints();
            editorConfig.from = conn[hoverConnection].name;
            tempPoints = [[...conn[hoverConnection].pos]];
            selectingFrom = false;
            isStartSnapped = true;
            updateRailInfo();
            draw();
            return;
        }

        if (editorConfig.category === 'intersection' && tempPoints.length > 0) return; // Tylko jeden punkt

        if (clickWasOnPoint && hoverPoint !== -1) {
            tempPoints.splice(hoverPoint, 1);
            updateRailInfo();
        } else if (clickWasOnEdge && hoverEdge !== -1 && edgePoint) {
            tempPoints.splice(hoverEdge + 1, 0, [Math.round(edgePoint.x), Math.round(edgePoint.z)]);
            updateRailInfo();
        } else {
            if (editorConfig.category === 'intersection') {
                if (tempPoints.length === 0) tempPoints.push([Math.round(wx), Math.round(wz)]);
            } else if (editorConfig.category === 'rail' && !selectingFrom) {
                if (isEndSnapped) return; // nie dodawaj jeśli koniec snapped
                const nearest = findNearestConnection(wx, wz);
                if (nearest) {
                    wx = nearest.pos[0];
                    wz = nearest.pos[1];
                    editorConfig.to = nearest.name;
                    isEndSnapped = true;
                }
                tempPoints.push([wx, wz]);
                updateRailInfo();
            } else {
                tempPoints.push([Math.round(wx), Math.round(wz)]);
                updateRailInfo();
            }
        }
        draw();
    }

    clickWasOnPoint = false;
    clickWasOnEdge = false;
});

//zoom kołem i dotykiem
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

//pomocnicze
function clampView() {
    viewX = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewX));
    viewY = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewY));
}

function generateNextName(used) {
    for (let i = 1; i <= 9; i++) if (!used.has('' + i)) return '' + i;
    for (let l = 0; l < 26; l++) for (let n = 1; n <= 9; n++) {
        let nm = String.fromCharCode(65 + l) + n;
        if (!used.has(nm)) return nm;
    }
    for (let l1 = 0; l1 < 26; l1++) for (let l2 = 0; l2 < 26; l2++) {
        let nm = String.fromCharCode(65 + l1) + String.fromCharCode(65 + l2);
        if (!used.has(nm)) return nm;
    }
    return 'NO_NAME';
}

function updateRailInfo() {
    if (editorConfig.category !== 'rail' || tempPoints.length === 0) return;
    const conn = getConnectionPoints();
    const start = tempPoints[0];
    const end = tempPoints[tempPoints.length - 1];
    let fromLabel = editorConfig.from || `[${start[0]}, ${start[1]}]`;
    let toLabel = editorConfig.to || `[${end[0]}, ${end[1]}]`;
    railInfo.textContent = `${fromLabel} <=> ${toLabel}`;
}

//zapis
function savePolygon() {
    let minPoints = editorConfig.closePath ? 3 : 2;
    if (editorConfig.category === 'intersection') minPoints = 1;
    if (tempPoints.length < minPoints) {
        alert("Za mało punktów! Minimum " + minPoints + ".");
        return;
    }
    const usedNames = new Set(polygons.map(p => p.name).filter(n => n));
    if (editorConfig.name && usedNames.has(editorConfig.name)) {
        alert('Nazwa istnieje!');
        return;
    }
    if (editorConfig.category === 'station' && !editorConfig.name) {
        alert('Nazwa obowiązkowa!');
        return;
    }
    if (editorConfig.category === 'intersection' && !editorConfig.name) {
        editorConfig.name = generateNextName(usedNames);
    }
    const poly = { ...editorConfig, points: tempPoints };
    if (editorConfig.category === 'intersection') {
        poly.location = [tempPoints[0]];
        delete poly.points;
    }
    if (editorConfig.category === 'station') {
        if (inPointIndex !== -1) poly.in = [tempPoints[inPointIndex]];
        if (outPointIndex !== -1) poly.out = [tempPoints[outPointIndex]];
    }
    if (editorConfig.category === 'rail') {
        poly.from = editorConfig.from;
        poly.to = editorConfig.to;
        poly.fillColor = editorConfig.lineColor + '33';
    }
    if (editorConfig.name) poly.name = editorConfig.name;
    if (editorConfig.opis) poly.opis = editorConfig.opis;
    let fullCode = '{\n';
    if (poly.location) {
        fullCode += ' location: ' + JSON.stringify(poly.location) + ',\n';
    } else {
        fullCode += ' points: ' + JSON.stringify(tempPoints) + ',\n';
    }
    fullCode += ' lineColor: "' + poly.lineColor + '",\n';
    fullCode += ' fillColor: "' + poly.fillColor + '",\n';
    fullCode += ' closePath: ' + poly.closePath + ',\n';
    if (poly.name) fullCode += ' name: "' + poly.name + '",\n';
    if (poly.opis) fullCode += ' opis: "' + poly.opis.replace(/"/g, '\\"') + '",\n';
    fullCode += ' category: "' + poly.category + '",\n';
    if (poly.temporary) fullCode += ' temporary: ' + poly.temporary + ',\n';
    if (poly.in) fullCode += ' in: ' + JSON.stringify(poly.in) + ',\n';
    if (poly.out) fullCode += ' out: ' + JSON.stringify(poly.out) + ',\n';
    if (poly.from) fullCode += ' from: "' + poly.from + '",\n';
    if (poly.to) fullCode += ' to: "' + poly.to + '",\n';
    fullCode += '},';
    codeText.value = fullCode;
    codeModal.style.display = 'block';
    window.tempPoly = poly;
}

function finalizeSave(add = true) {
    if (add) {
        polygons.push(window.tempPoly);
    }
    isDrawing = false;
    tempPoints = [];
    selectingFrom = false;
    settingIn = false;
    settingOut = false;
    inPointIndex = -1;
    outPointIndex = -1;
    isStartSnapped = false;
    isEndSnapped = false;
    railStationButtons.style.display = 'none';
    railInfo.style.display = 'none';
    canvas.style.cursor = 'grab';
    editorPanel.style.display = 'none';
    railEditorPanel.style.display = 'none';
    openBtn.style.display = 'block';
    openRailBtn.style.display = 'block';
    editModeBtn.style.display = 'none';
    info.textContent = 'ZAPISANO!';
    draw();
    delete window.tempPoly;
}

//UI
openBtn.addEventListener('click', () => {
    editorPanel.style.display = 'block';
    openBtn.style.display = 'none';
    openRailBtn.style.display = 'none';
    catSelection.style.display = 'block';
    startDrawingBtn.textContent = isDrawing ? 'ZAKOŃCZ RYSOWANIE' : 'ROZPOCZNIJ RYSOWANIE';
    closePathToggle.textContent = editorConfig.closePath ? 'ON' : 'OFF';
    closePathToggle.style.background = editorConfig.closePath ? '#0f0' : '#f00';
    temporaryToggle.textContent = editorConfig.temporary ? 'ON' : 'OFF';
    temporaryToggle.style.background = editorConfig.temporary ? '#0f0' : '#f00';
    document.querySelectorAll('#editor-panel .cat-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector(`#editor-panel .cat-btn[data-cat="${editorConfig.category}"]`).classList.add('selected');
    closePathToggle.style.display = 'block';
    document.getElementById('lineColor').disabled = false;
    document.getElementById('lineColor').value = editorConfig.lineColor;
    document.getElementById('polyName').value = editorConfig.name;
    document.getElementById('polyDesc').value = editorConfig.opis;
});

openRailBtn.addEventListener('click', () => {
    railPanel.style.display = 'block';
    openRailBtn.style.display = 'none';
    openBtn.style.display = 'none';
});

closeRail.addEventListener('click', () => {
    railPanel.style.display = 'none';
    openRailBtn.style.display = 'block';
    openBtn.style.display = 'block';
});

closeBtn.addEventListener('click', () => {
    if (isDrawing) {
        finalizeSave(false);
    } else {
        editorPanel.style.display = 'none';
        openBtn.style.display = 'block';
        openRailBtn.style.display = 'block';
    }
});

closeRailEditor.addEventListener('click', () => {
    if (isDrawing) {
        finalizeSave(false);
    } else {
        railEditorPanel.style.display = 'none';
        openBtn.style.display = 'block';
        openRailBtn.style.display = 'block';
    }
});

document.querySelectorAll('#editor-panel .cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#editor-panel .cat-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        editorConfig.category = btn.dataset.cat;
        if (editorConfig.category === 'road') {
            editorConfig.lineColor = '#ffffff';
            editorConfig.fillColor = 'transparent';
            document.getElementById('lineColor').value = '#ffffff';
            document.getElementById('lineColor').disabled = false;
            editorConfig.closePath = false;
            closePathToggle.style.display = 'none';
        } else {
            editorConfig.lineColor = '#00ff00';
            editorConfig.fillColor = '#00ff0033';
            document.getElementById('lineColor').value = '#00ff00';
            document.getElementById('lineColor').disabled = false;
            closePathToggle.style.display = 'block';
        }
        if (isDrawing) draw();
    });
});

document.querySelectorAll('#rail-mode-panel .cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#rail-mode-panel .cat-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        editorConfig.category = btn.dataset.mode;
        railPanel.style.display = 'none';
        railEditorPanel.style.display = 'block';
        railCategory.textContent = btn.textContent.toUpperCase();
        railOpisSection.style.display = editorConfig.category !== 'rail' ? 'block' : 'none';
        railStationButtons.style.display = editorConfig.category === 'station' ? 'block' : 'none';
        if (editorConfig.category === 'station') {
            editorConfig.lineColor = '#df6501';
            editorConfig.fillColor = editorConfig.lineColor + '33';
            editorConfig.closePath = true;
        } else if (editorConfig.category === 'intersection') {
            editorConfig.lineColor = '#102457';
            editorConfig.fillColor = editorConfig.lineColor + '33';
            editorConfig.closePath = true;
        } else if (editorConfig.category === 'rail') {
            editorConfig.lineColor = '#102457';
            editorConfig.fillColor = editorConfig.lineColor + '33';
            editorConfig.closePath = false;
        }
        railLineColor.value = editorConfig.lineColor;
        railTemporaryToggle.textContent = editorConfig.temporary ? 'ON' : 'OFF';
        railTemporaryToggle.style.background = editorConfig.temporary ? '#0f0' : '#f00';
        railAddInBtn.textContent = 'DODAJ IN';
        railAddInBtn.style.background = '#00ff00';
        railAddOutBtn.textContent = 'DODAJ OUT';
        railAddOutBtn.style.background = '#ff00ff';
        railPolyName.value = editorConfig.name;
        railPolyDesc.value = editorConfig.opis;
    });
});

closePathToggle.addEventListener('click', () => {
    editorConfig.closePath = !editorConfig.closePath;
    closePathToggle.textContent = editorConfig.closePath ? 'ON' : 'OFF';
    closePathToggle.style.background = editorConfig.closePath ? '#0f0' : '#f00';
    if (isDrawing) draw();
});

temporaryToggle.addEventListener('click', () => {
    editorConfig.temporary = !editorConfig.temporary;
    temporaryToggle.textContent = editorConfig.temporary ? 'ON' : 'OFF';
    temporaryToggle.style.background = editorConfig.temporary ? '#0f0' : '#f00';
    if (isDrawing) draw();
});

railTemporaryToggle.addEventListener('click', () => {
    editorConfig.temporary = !editorConfig.temporary;
    railTemporaryToggle.textContent = editorConfig.temporary ? 'ON' : 'OFF';
    railTemporaryToggle.style.background = editorConfig.temporary ? '#0f0' : '#f00';
    if (isDrawing) draw();
});

document.getElementById('lineColor').addEventListener('input', e => {
    const hex = e.target.value;
    editorConfig.lineColor = hex;
    editorConfig.fillColor = (['terrain', 'station', 'intersection'].includes(editorConfig.category) ? hex + '33' : 'transparent');
    if (isDrawing) draw();
});

railLineColor.addEventListener('input', e => {
    const hex = e.target.value;
    editorConfig.lineColor = hex;
    editorConfig.fillColor = (['terrain', 'station', 'intersection'].includes(editorConfig.category) ? hex + '33' : 'transparent');
    if (isDrawing) draw();
});

document.getElementById('polyName').addEventListener('input', e => {
    editorConfig.name = e.target.value;
    if (isDrawing) draw();
});

railPolyName.addEventListener('input', e => {
    editorConfig.name = e.target.value;
    if (isDrawing) draw();
});

document.getElementById('polyDesc').addEventListener('input', e => {
    editorConfig.opis = e.target.value;
});

railPolyDesc.addEventListener('input', e => {
    editorConfig.opis = e.target.value;
});

startDrawingBtn.addEventListener('click', () => {
    editorPanel.style.display = 'none';
    if (!isDrawing) {
        isDrawing = true;
        tempPoints = [];
        inPointIndex = -1;
        outPointIndex = -1;
        canvas.style.cursor = 'crosshair';
        info.textContent = 'Klik=dodaj | klik punkt=usuń | przytrzymaj=przesuń';
        openBtn.style.display = 'none';
        openRailBtn.style.display = 'none';
        editModeBtn.style.display = 'block';
    } else {
        savePolygon();
    }
    draw();
});

railStartDrawing.addEventListener('click', () => {
    railEditorPanel.style.display = 'none';
    if (!isDrawing) {
        isDrawing = true;
        tempPoints = [];
        inPointIndex = -1;
        outPointIndex = -1;
        if (editorConfig.category === 'rail') {
            selectingFrom = true;
            railInfo.textContent = '[?] <=> [?]';
            railInfo.style.display = 'block';
        }
        canvas.style.cursor = 'crosshair';
        info.textContent = 'Klik=dodaj | klik punkt=usuń | przytrzymaj=przesuń';
        openBtn.style.display = 'none';
        openRailBtn.style.display = 'none';
        editModeBtn.style.display = 'block';
    } else {
        savePolygon();
    }
    draw();
});

editModeBtn.addEventListener('click', () => {
    if (['terrain', 'road'].includes(editorConfig.category)) {
        editorPanel.style.display = 'block';
        startDrawingBtn.textContent = 'ZAKOŃCZ RYSOWANIE';
    } else {
        railEditorPanel.style.display = 'block';
        railStartDrawing.textContent = 'ZAKOŃCZ RYSOWANIE';
    }
});

railAddInBtn.addEventListener('click', () => {
    settingIn = true;
    settingOut = false;
    canvas.style.cursor = 'pointer';
});

railAddOutBtn.addEventListener('click', () => {
    settingIn = false;
    settingOut = true;
    canvas.style.cursor = 'pointer';
});

window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isDrawing) {
        finalizeSave(false);
    }
});

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

// Przełączniki widoczności
document.querySelectorAll('#category-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.dataset.cat) {
            const cat = btn.dataset.cat;
            window.visibleCategories[cat] = !window.visibleCategories[cat];
        } else if (btn.dataset.type === 'projects') {
            window.visibleTemporary = !window.visibleTemporary;
        }
        btn.classList.toggle('off');
        draw();
    });
});

canvas.style.cursor = 'grab';

//główne rysowanie
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawTiles();
    drawPolygons();
    drawTempPolygon();
    if (isDrawing && editorConfig.category === 'rail') {
        ctx.save();
        ctx.scale(pixelRatio, pixelRatio);
        const { scale: ppb } = getPixelScale();
        const cx = innerWidth / 2, cy = innerHeight / 2;
        ctx.translate(cx, cy);
        ctx.scale(ppb, ppb);
        ctx.translate(-viewX, -viewY);
        const conn = getConnectionPoints();
        conn.forEach(c => {
            const [x, z] = c.pos;
            ctx.beginPath();
            ctx.arc(x, z, 10 / zoom, 0, Math.PI * 2);
            ctx.fillStyle = connectionBlinkColor;
            ctx.fill();
        });
        ctx.restore();
    }
    updateInfo();
}

draw();