/* ==============================================================
   MAPA MINECRAFT v21 – FINALNA WERSJA – WSZYSTKO DZIAŁA!
   Klikanie na poligon: 100% | Miganie: OK | Edytor: OK | Zoom: OK
   ============================================================== */

// POLIGONY I STANY – NAJPIERW!
let polygons = [];
let isDrawing = false;
let tempPoints = [];
let hoverPoint = -1;
let hoverEdge = -1;
let edgePoint = null;
let blink = true;
let hoveredPoly = -1;
let selectedPoly = null;

if (window.polygonsData && Array.isArray(window.polygonsData)) {
    polygons = window.polygonsData.map(p => ({
        points: p.points || [],
        lineColor: p.lineColor || '#00ff00',
        fillColor: p.fillColor || '#00ff0033',
        closePath: p.closePath !== false,
        name: p.name || '',
        opis: p.opis || '',
        category: p.category || 1
    }));
}

let editorConfig = {
    category: 1,
    lineColor: '#00ff00',
    fillColor: '#00ff0033',
    name: '',
    opis: '',
    closePath: true
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
const editorPanel = document.getElementById('editor-panel');
const closeBtn = document.getElementById('close-editor');
const startDrawingBtn = document.getElementById('startDrawing');
const closePathToggle = document.getElementById('closePathToggle');
const codeModal = document.getElementById('code-modal');
const codeText = document.getElementById('code-text');
const copyBtn = document.getElementById('copy-btn');
const closeModalBtn = document.getElementById('close-modal');
const returnBtn = document.getElementById('return-btn');
const editModal = document.getElementById('edit-modal');

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
//linia 60

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
//linia 80

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
//linia 100

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
//linia 120

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
//linia 140

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
//linia 160

//wyświetlanie poligonów – RYSOWANIE (Z RESTORE!)
function drawPolygons() {
    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);
    const { scale: ppb } = getPixelScale();
    const cx = innerWidth / 2, cy = innerHeight / 2;
    ctx.translate(cx, cy);
    ctx.scale(ppb, ppb);
    ctx.translate(-viewX, -viewY);

    polygons.forEach((p, i) => {
        if (!window.visibleCategories?.[p.category]) return;
        if (!p.points?.length) return;
        const isHovered = i === hoveredPoly;
        const { points, lineColor, fillColor, closePath, name, category } = p;

        ctx.beginPath();
        points.forEach(([x, z], i) => i === 0 ? ctx.moveTo(x, z) : ctx.lineTo(x, z));
        if (closePath && category === 1) ctx.closePath();

        ctx.fillStyle = category === 1 ? fillColor : 'transparent';
        ctx.fill();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = isHovered ? 5 / zoom : (category === 1 ? 2.5 / zoom : 6 / zoom);
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
                ctx.fillStyle = isHovered ? '#0f0' : 'white';
                ctx.fillText(name, cx, cz);
            } else {
                drawTextAlongPath(name, points, 0, isHovered ? '#0f0' : 'white');
            }
        }
    });
    ctx.restore(); // NAPRAWIONE!
}
//linia 180

//wyświetlanie poligonów – KLIKANIE (CUSTOM DETEKCJA BEZ CANVAS – FIX PRECYZJI)
function isPointInPolygon(x, z, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i][0], zi = points[i][1];
        const xj = points[j][0], zj = points[j][1];
        const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function pointToLineDistance(px, pz, x1, z1, x2, z2) {
    const A = px - x1, B = pz - z1, C = x2 - x1, D = z2 - z1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, zz;
    if (param < 0) {
        xx = x1;
        zz = z1;
    } else if (param > 1) {
        xx = x2;
        zz = z2;
    } else {
        xx = x1 + param * C;
        zz = z1 + param * D;
    }
    return Math.hypot(px - xx, pz - zz);
}

function findHoveredPoly(wx, wz) {
    for (let i = polygons.length - 1; i >= 0; i--) {
        const p = polygons[i];
        if (!window.visibleCategories?.[p.category]) continue;
        if (!p.points?.length) continue;

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        p.points.forEach(([x,z]) => {
            minX = Math.min(minX,x); maxX = Math.max(maxX,x);
            minZ = Math.min(minZ,z); maxZ = Math.max(maxZ,z);
        });
        if (wx < minX - 50 || wx > maxX + 50 || wz < minZ - 50 || wz > maxZ + 50) continue;

        if (p.category === 1 && p.closePath) {
            if (isPointInPolygon(wx, wz, p.points)) return i;
        } else {
            for (let j = 0; j < p.points.length - 1; j++) {
                const [x1, z1] = p.points[j];
                const [x2, z2] = p.points[j + 1];
                const dist = pointToLineDistance(wx, wz, x1, z1, x2, z2);
                const tolerance = 10 / zoom;  // Tolerancja klikania na linię
                if (dist <= tolerance) return i;
            }
        }
    }
    return -1;
}
//linia 200

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
        ctx.arc(x, z, 6 / zoom, 0, Math.PI*2);
        ctx.fillStyle = (isFirst || (isLast && blink)) ? '#00ffff' : '#ff0000';
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
//linia 220

//miganie punktu
setInterval(() => { 
    blink = !blink; 
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

function detectHover(x, y) {
    hoverPoint = -1; hoverEdge = -1; edgePoint = null;
    const [wx, wz] = screenToWorld(x, y);
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
//linia 240

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
        const [wx, wz] = screenToWorld(e.clientX, e.clientY);
        tempPoints[draggedPointIndex] = [Math.round(wx), Math.round(wz)];
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
    } else {
        const [wx, wz] = screenToWorld(e.clientX, e.clientY);
        hoveredPoly = findHoveredPoly(wx, wz);
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

        // SPRAWDZAMY TYLKO CZY POLIGON BYŁ PODŚWIETLONY (hoveredPoly)
        if (elapsed <= 200 && dist < 20 && !isDrawing && hoveredPoly !== -1) {
            selectedPoly = polygons[hoveredPoly];
            document.getElementById('view-name').textContent = selectedPoly.name || '(brak nazwy)';
            document.getElementById('view-desc').textContent = selectedPoly.opis || '(brak opisu)';
            editModal.style.display = 'block';
            draw();
        }
    }

    // Rysowanie – bez zmian
    if (elapsed <= 200 && dist < 20 && isDrawing) {
        const [wx, wz] = screenToWorld(e.clientX, e.clientY);
        detectHover(e.clientX, e.clientY);

        if (clickWasOnPoint && hoverPoint !== -1) {
            tempPoints.splice(hoverPoint, 1);
        } else if (clickWasOnEdge && hoverEdge !== -1 && edgePoint) {
            tempPoints.splice(hoverEdge + 1, 0, [Math.round(edgePoint.x), Math.round(edgePoint.z)]);
        } else {
            tempPoints.push([Math.round(wx), Math.round(wz)]);
        }
        draw();
    }

    clickWasOnPoint = false;
    clickWasOnEdge = false;
});
//linia 260

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
//linia 280

//pomocnicze
function clampView() {
    viewX = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewX));
    viewY = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, viewY));
}

//zapis
function savePolygon() {
    if (tempPoints.length < 3) {
        alert("Za mało punktów! Minimum 3.");
        return;
    }
    const poly = { ...editorConfig, points: tempPoints };
    if (editorConfig.name) poly.name = editorConfig.name;
    if (editorConfig.opis) poly.opis = editorConfig.opis;
    let fullCode = '{\n';
    fullCode += ' points: ' + JSON.stringify(tempPoints) + ',\n';
    fullCode += ' lineColor: "' + poly.lineColor + '",\n';
    fullCode += ' fillColor: "' + poly.fillColor + '",\n';
    fullCode += ' closePath: ' + poly.closePath + ',\n';
    if (poly.name) fullCode += ' name: "' + poly.name + '",\n';
    if (poly.opis) fullCode += ' opis: "' + poly.opis.replace(/"/g, '\\"') + '",\n';
    fullCode += ' category: ' + poly.category + '\n';
    fullCode += '},';
    codeText.value = fullCode;
    codeModal.style.display = 'block';
    window.tempPoly = poly;
}

function finalizeSave(add = true) {
    if (selectedPoly) {
        Object.assign(selectedPoly, window.tempPoly);
        selectedPoly = null;
    } else if (add) {
        polygons.push(window.tempPoly);
    }
    isDrawing = false;
    tempPoints = [];
    hoveredPoly = -1;
    canvas.style.cursor = 'grab';
    editorPanel.style.display = 'none';
    openBtn.style.display = 'block';
    info.textContent = 'ZAPISANO!';
    draw();
    delete window.tempPoly;
}
//linia 300

//UI
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

document.getElementById('polyDesc').addEventListener('input', e => {
    editorConfig.opis = e.target.value;
});

startDrawingBtn.addEventListener('click', () => {
    editorPanel.style.display = 'none';
    openBtn.style.display = 'block';
    if (!isDrawing) {
        isDrawing = true;
        tempPoints = [];
        canvas.style.cursor = 'crosshair';
        info.textContent = 'Klik=dodaj | klik punkt=usuń | przytrzymaj=przesuń';
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

document.getElementById('edit-start').onclick = () => {
    editModal.style.display = 'none';
    editorPanel.style.display = 'block';
    openBtn.style.display = 'none';
    isDrawing = true;
    tempPoints = selectedPoly.points.map(p => [...p]);
    editorConfig = { ...selectedPoly };
    document.getElementById('polyName').value = selectedPoly.name;
    document.getElementById('polyDesc').value = selectedPoly.opis || '';
    document.getElementById('lineColor').value = selectedPoly.lineColor.slice(0,7);
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector(`.cat-btn[data-cat="${selectedPoly.category}"]`).classList.add('selected');
    closePathToggle.textContent = selectedPoly.closePath ? 'ON' : 'OFF';
    closePathToggle.style.background = selectedPoly.closePath ? '#0f0' : '#f00';
    canvas.style.cursor = 'crosshair';
    info.textContent = 'EDYTUJESZ – LPM + przytrzymaj >0.2s → usuń';
    draw();
};

document.getElementById('edit-close').onclick = () => {
    editModal.style.display = 'none';
    selectedPoly = null;
    hoveredPoly = -1;
    draw();
};

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

document.addEventListener('click', e => {
    if (editModal.style.display === 'block') {
        const rect = editModal.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
            editModal.style.display = 'none';
            selectedPoly = null;
            hoveredPoly = -1;
            draw();
        }
    }
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
    updateInfo();
}

draw();