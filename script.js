/* ==============================================================
   MAPA MINECRAFT v21 â€“ FINALNA WERSJA â€“ WSZYSTKO DZIAĹA!
   ============================================================== */

// POLIGONY I STANY
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
let connectionBlinkColor = '#ffff00';
let isStartSnapped = false;
let isEndSnapped = false;
const SNAP_THRESHOLD = 10;
let history = [];
let selectedPolygonIndex = -1;
let isEditing = false;
let needsRedraw = true;
window.hasUnsavedChanges = false;

function notifyChange() {
    window.hasUnsavedChanges = true;
    const btn = document.getElementById('submit-changes-btn');
    if (btn) btn.style.display = 'block';
}

function loadPolygonsFromData() {
    const processData = (data) => {
        if (!data || !Array.isArray(data)) return;
        const newPolys = data.map(p => ({
            points: p.points || p.location || [],
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
            to: p.to || null,
            panorama: p.panorama || null,
            photo: p.photo || null,
            authors: p.authors || (p.autor ? [p.autor] : (p.author ? [p.author] : []))
        }));

        newPolys.forEach(np => {
            const existing = polygons.find(p => (p.name === np.name && p.name !== '') ||
                (JSON.stringify(p.points || p.location) === JSON.stringify(np.points || np.location)));
            if (existing) {
                // PoĹ‚Ä…cz wĹ‚aĹ›ciwoĹ›ci (np. dodaj panorama jeĹ›li brakowaĹ‚o)
                Object.assign(existing, np);
            } else {
                polygons.push(np);
            }
            needsRedraw = true;
        });
    };

    if (window.polygonsData) {
        processData(window.polygonsData);
        window.polygonsData = null; // WyczyĹ›Ä‡ po przetworzeniu
    }
    if (window.extraPolygons) {
        processData(window.extraPolygons);
        window.extraPolygons = []; // WyczyĹ›Ä‡ po przetworzeniu
    }
}
window.loadPolygonsFromData = loadPolygonsFromData;
loadPolygonsFromData();
// PonĂłw kilka razy dla asynchronicznych skryptĂłw
setTimeout(loadPolygonsFromData, 500);
setTimeout(loadPolygonsFromData, 2000);
setTimeout(loadPolygonsFromData, 5000);

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

const addMenuPanel = document.getElementById('add-menu-panel');
const openAddMenuBtn = document.getElementById('open-add-menu-btn');
const closeAddMenuBtn = document.getElementById('close-add-menu');
const addMenuMain = document.getElementById('add-menu-main');
const addMenuRail = document.getElementById('add-menu-rail');
const backToAddMain = document.getElementById('back-to-add-main');

// Funkcje statystyk (Pole/DĹ‚ugoĹ›Ä‡)
function calculatePolygonArea(pts) {
    if (pts.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
        let j = (i + 1) % pts.length;
        area += pts[i][0] * pts[j][1];
        area -= pts[j][0] * pts[i][1];
    }
    return Math.abs(area) / 2;
}

function calculatePathLength(pts) {
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1][0] - pts[i][0];
        const dy = pts[i + 1][1] - pts[i][1];
        len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
}

// Inicjalizacja autorĂłw i Logowanie
let currentUser = null;
function initLogin() {
    const userSelect = document.getElementById('user-select');
    if (!window.playersData) return;

    userSelect.innerHTML = window.playersData.map(p => `<option value="${p.nick}">${p.nick}</option>`).join('');

    const saved = localStorage.getItem('craftly_user');
    if (saved) {
        login(saved);
    }
}

function login(nick) {
    currentUser = window.playersData.find(p => p.nick === nick);
    if (!currentUser) return;

    localStorage.setItem('craftly_user', nick);
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('user-nick').textContent = nick;
    document.getElementById('user-head').src = currentUser.icon;
    initAuthorCheckboxes();
}

function initAuthorCheckboxes() {
    const list = document.getElementById('polyAuthorsList');
    if (!list || !window.playersData) return;
    list.innerHTML = window.playersData.map(p => `
        <label style="display:flex; align-items:center; gap:5px; font-size:12px; cursor:pointer;">
            <input type="checkbox" value="${p.nick}" ${p.nick === currentUser?.nick ? 'checked' : ''}> ${p.nick}
        </label>
    `).join('');
}

document.getElementById('login-btn').addEventListener('click', () => {
    login(document.getElementById('user-select').value);
});

document.getElementById('user-display').addEventListener('click', () => {
    document.getElementById('login-modal').style.display = 'flex';
});

initLogin();
let viewX = 0, viewY = 0;
let pixelRatio = 1;
const cache = new Map();
let tileQueue = [];
let isTileLoading = false;
let isPanning = false;
let panStart = { x: 0, y: 0, viewX: 0, viewY: 0 };
let lastX = 0, lastY = 0;
let isDraggingPoint = false;
let draggedPointIndex = -1;
let clickStartTime = 0;
let clickStartX = 0, clickStartY = 0;
let clickWasOnPoint = false;
let clickWasOnEdge = false;

// WidocznoĹ›Ä‡
window.visibleCategories = {
    'terrain': true,
    'road': true,
    'station': true,
    'intersection': true,
    'rail': true,
    'pin': true
};
window.visibleTemporary = false;

//wczytywanie mapy â€“ resize i skalowanie
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
let zoom = 1;
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

//wczytywanie mapy â€“ Ĺ‚adowanie kafelkĂłw
function loadTile(tx, ty, level) {
    const key = `${level.folder}_${tx}_${ty}`;
    if (cache.has(key)) return cache.get(key);
    const PNG_IN_256 = new Set(['-2_2', '-2_1', '-3_1', '-4_1', '-8_1', '-9_1', '-2_0', '-3_0', '-4_0', '-8_0', '-9_0', '4_-1', '-2_-1', '-3_-1', '-4_-1',
        '-6_-1', '-7_-1', '-2_-3', '-3_-3', '-2_-4', '1_1', '-1_1', '1_0', '0_0', '-1_0', '1_-1', '-1_-1', '0_1', '0_-1', '0_-6', '-1_-5',
        '-1_-6', '0_-5', '-5_2', '-4_2', '-3_-4', '-3_2', '-2_-2', '-2_2', '-1_-4', '-1_2', '0_2', '1_2', '-4_-2', '-3_-2', '-8_-1', '-9_-1', '-8_2',
        '-9_-2', '-28_4', '-28_3', '-27_4', '-28_3', '-26_3', '-33_-25', '-33_-24', '-2_-2', '0_-4']);
    const tryLoad = (ext) => {
        const img = new Image();
        img.src = `tiles/${level.folder}/${tx}_${ty}.${ext}`;
        const p = new Promise(r => {
            img.onload = () => {
                img.alpha = 0; // PoczÄ…tkowa przeĹşroczystoĹ›Ä‡ dla efektu fade-in
                cache.set(key, img);
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

async function processTileQueue() {
    if (isTileLoading || tileQueue.length === 0) return;
    isTileLoading = true;
    const { tx, ty, level, key } = tileQueue.shift();

    if (!cache.has(key) || cache.get(key) instanceof Promise) {
        await loadTile(tx, ty, level);
    }

    isTileLoading = false;
    processTileQueue();
}

function getViewportBounds() {
    const { scale: ppb } = getPixelScale();
    const halfW = (innerWidth / 2) / ppb;
    const halfH = (innerHeight / 2) / ppb;
    return {
        minX: viewX - halfW,
        maxX: viewX + halfW,
        minY: viewY - halfH,
        maxY: viewY + halfH
    };
}

function drawTiles() {
    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);
    const level = getLevel();
    const bpt = BLOCKS_PER_TILE[level.size];
    const { scale: ppb, tilePixelSize } = getPixelScale();
    const cx = innerWidth / 2, cy = innerHeight / 2;

    const bounds = getViewportBounds();
    const startTx = Math.floor(bounds.minX / bpt);
    const endTx = Math.ceil(bounds.maxX / bpt);
    const startTy = Math.floor(bounds.minY / bpt);
    const endTy = Math.ceil(bounds.maxY / bpt);

    for (let tx = startTx - 1; tx <= endTx + 1; tx++) {
        for (let ty = startTy - 1; ty <= endTy + 1; ty++) {
            if (Math.abs(tx) > 50 || Math.abs(ty) > 50) continue;
            const key = `${level.folder}_${tx}_${ty}`;
            const img = cache.get(key);
            if (img && !(img instanceof Promise)) {
                const bx = tx * bpt;
                const bz = ty * bpt;
                const rx = cx + (bx - viewX) * ppb;
                const ry = cy + (bz - viewY) * ppb;

                if (img.alpha < 1) {
                    img.alpha += 0.1;
                    ctx.globalAlpha = img.alpha;
                    needsRedraw = true;
                } else {
                    ctx.globalAlpha = 1;
                }

                ctx.drawImage(img, rx, ry, tilePixelSize, tilePixelSize);
            } else if (!cache.has(key)) {
                if (!tileQueue.find(t => t.key === key)) {
                    tileQueue.push({ tx, ty, level, key });
                    processTileQueue();
                }
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
    const mx = (lastX || innerWidth / 2) - rect.left;
    const my = (lastY || innerHeight / 2) - rect.top;
    const [wx, wz] = screenToWorld(mx + rect.left, my + rect.top);
    info.textContent = `(${Math.round(wx)}, ${Math.round(wz)})`;
    zoomLabel.textContent = `Zoom: ${zoom.toFixed(2)}x`;
    slider.value = zoom;

    // Aktualizacja pola i objÄ™toĹ›ci jeĹ›li rysujemy
    if (isDrawing && tempPoints.length > 2) {
        const area = Math.abs(calculateArea(tempPoints));
        document.getElementById('area-info').style.display = 'block';
        document.getElementById('area-val').textContent = Math.round(area);
        const height = 1; // domyĹ›lna wysokoĹ›Ä‡, moĹĽna dodaÄ‡ input
        document.getElementById('vol-val').textContent = Math.round(area * height);
    } else {
        document.getElementById('area-info').style.display = 'none';
    }
}

// Obliczanie pola powierzchni (Shoelace formula)
function calculateArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        let j = (i + 1) % points.length;
        area += points[i][0] * points[j][1];
        area -= points[j][0] * points[i][1];
    }
    return area / 2;
}

// Sprawdzanie czy punkt jest wewnÄ…trz poligonu
function isPointInPolygon(x, z, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        let xi = points[i][0], zi = points[i][1];
        let xj = points[j][0], zj = points[j][1];
        let intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Historia zmian
function logChange(action, poly) {
    const entry = {
        time: new Date().toLocaleTimeString(),
        author: poly.author || "Nieznany",
        action: action,
        name: poly.name || "Bez nazwy",
        data: JSON.parse(JSON.stringify(poly))
    };
    history.push(entry);
    updateHistoryUI();
}

function updateHistoryUI() {
    const list = document.getElementById('history-list');
    list.innerHTML = history.map((e, i) => `
        <div class="history-item" style="padding:10px; border-bottom:1px solid #333; cursor:pointer;" onclick="previewHistory(${i})">
            <img src="${getPlayerHead(e.author)}" class="mc-head">
            <strong>${e.author}</strong> - ${e.time}<br>
            <span style="color:#aaa">${e.action}: ${e.name}</span>
        </div>
    `).reverse().join('');
}

function getPlayerHead(nick) {
    if (!window.playersData) return 'head/default.png';
    const p = window.playersData.find(p => p.nick.toLowerCase() === nick.toLowerCase());
    return p ? p.icon : 'head/default.png';
}

//wyĹ›wietlanie poligonĂłw â€“ pomocnicze
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

//wyĹ›wietlanie poligonĂłw â€“ RYSOWANIE (Z RESTORE!)
function drawPolygons() {
    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);
    const { scale: ppb } = getPixelScale();
    const cx = innerWidth / 2, cy = innerHeight / 2;
    ctx.translate(cx, cy);
    ctx.scale(ppb, ppb);
    ctx.translate(-viewX, -viewY);

    const bounds = getViewportBounds();

    polygons.forEach((p, idx) => {
        if (!window.visibleCategories[p.category]) return;
        if (p.temporary && !window.visibleTemporary) return;

        let points = p.points || p.location || [];
        if (!points.length) return;

        // Bounding Box Culling
        let minPX = Infinity, maxPX = -Infinity, minPZ = Infinity, maxPZ = -Infinity;
        points.forEach(([x, z]) => {
            if (x < minPX) minPX = x; if (x > maxPX) maxPX = x;
            if (z < minPZ) minPZ = z; if (z > maxPZ) maxPZ = z;
        });

        const margin = 100 / zoom;
        if (maxPX < bounds.minX - margin || minPX > bounds.maxX + margin ||
            maxPZ < bounds.minY - margin || minPZ > bounds.maxY + margin) return;

        const isSelected = selectedPolygonIndex === idx;
        const { lineColor, fillColor, closePath, name, category } = p;

        if (category === 'pin' && points.length === 1) {
            const [x, z] = points[0];
            ctx.beginPath();
            ctx.arc(x, z, 10 / zoom, 0, Math.PI * 2);
            ctx.fillStyle = lineColor;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2 / zoom;
            ctx.stroke();
        } else {
            ctx.beginPath();
            points.forEach(([x, z], i) => i === 0 ? ctx.moveTo(x, z) : ctx.lineTo(x, z));
            if (closePath && points.length > 2) ctx.closePath();

            ctx.fillStyle = (['terrain', 'station', 'intersection', 'pin'].includes(category) ? fillColor : 'transparent');
            if (isSelected) ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fill();

            ctx.strokeStyle = lineColor;
            if (isSelected) ctx.strokeStyle = '#fff';
            ctx.lineWidth = (['terrain', 'station', 'intersection', 'pin'].includes(category) ? 2.5 / zoom : 6 / zoom);
            if (isSelected) ctx.lineWidth *= 1.5;
            ctx.stroke();
        }

        if (name && (['terrain', 'station', 'intersection', 'pin'].includes(category) || zoom > 3)) {
            ctx.font = `${(isSelected ? 18 : 14) / zoom}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const [cx, cz] = category === 'pin' && points.length === 1 ? points[0] : calculateCentroid(points);
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2 / zoom;
            ctx.strokeText(name, cx, cz - (category === 'pin' ? 15 / zoom : 0));
            ctx.fillStyle = isSelected ? '#0f0' : 'white';
            ctx.fillText(name, cx, cz - (category === 'pin' ? 15 / zoom : 0));
        }
    });
    ctx.restore();
}

//rysowanie i edytowanie â€“ tymczasowy poligon
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
    ctx.lineWidth = (['terrain', 'station', 'intersection'].includes(editorConfig.category) ? 3 / zoom : 6 / zoom);
    ctx.stroke();

    const drawPoints = editorConfig.category === 'intersection' ? (tempPoints.length ? [tempPoints[0]] : []) : tempPoints;
    drawPoints.forEach(([x, z], i) => {
        const isFirst = i === 0;
        const isLast = i === drawPoints.length - 1;
        ctx.beginPath();
        ctx.arc(x, z, 6 / zoom, 0, Math.PI * 2);
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
        ctx.arc(edgePoint.x, edgePoint.z, 7 / zoom, 0, Math.PI * 2);
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

//rysowanie i edytowanie â€“ wykrywanie
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

function showPolyInfo(idx) {
    if (idx === -1) {
        closePolyInfo();
        return;
    }
    selectedPolygonIndex = idx;
    const p = polygons[idx];
    if (!p) {
        closePolyInfo();
        return;
    }

    const panel = document.getElementById('poly-info-panel');
    document.getElementById('info-poly-name').textContent = p.name || "Bez nazwy";
    document.getElementById('info-poly-desc').textContent = p.opis || "";

    // Ikony i Przyciski Panorama/ZdjÄ™cia
    const panoIcon = document.getElementById('info-poly-pano-icon');
    const photoIcon = document.getElementById('info-poly-photo-icon');
    const panoBtn = document.getElementById('info-poly-pano-btn');
    const photoBtn = document.getElementById('info-poly-photo-btn');

    const hasPano = !!p.panorama;
    const hasPhoto = !!p.photo;

    if (panoIcon) panoIcon.style.display = hasPano ? 'inline' : 'none';
    if (photoIcon) photoIcon.style.display = hasPhoto ? 'inline' : 'none';
    if (document.getElementById('info-poly-hint')) {
        document.getElementById('info-poly-hint').style.display = (hasPano || hasPhoto) ? 'inline' : 'none';
    }

    if (panoBtn) {
        panoBtn.style.display = hasPano ? 'block' : 'none';
        panoBtn.onclick = () => openPanoViewer(p.panorama, p.name);
    }
    if (photoBtn) {
        photoBtn.style.display = hasPhoto ? 'block' : 'none';
    }

    // Obliczanie statystyk (Pole / DĹ‚ugoĹ›Ä‡)
    const stats = document.getElementById('info-poly-stats');
    const pts = p.points || p.location || [];
    if (['terrain', 'station', 'intersection', 'pin'].includes(p.category)) {
        const area = Math.round(calculatePolygonArea(pts));
        stats.textContent = `Pole: ${area} mÂ˛`;
    } else {
        const len = Math.round(calculatePathLength(pts));
        stats.textContent = `DĹ‚ugoĹ›Ä‡: ${len} m`;
    }

    const authorsDiv = document.getElementById('info-poly-authors');
    const authorList = (p.authors && p.authors.length > 0) ? p.authors : (p.author ? [p.author] : ["?"]);
    authorsDiv.innerHTML = authorList.map(nick => `
        <img src="${getPlayerHead(nick)}" class="mc-head" title="${nick}">
    `).join('');

    panel.style.display = 'block';
    draw();
}

// LOGIKA PANORAMY 3D CUBEMAP
let panoYaw = 0;
let panoPitch = 0;
let panoZoom = 500; // Dopasowane do nowej skali szeĹ›cianu
let isPanoDragging = false;
let lastPanoX = 0, lastPanoY = 0;

function openPanoViewer(path, title) {
    document.getElementById('pano-title').textContent = `Panorama: ${title}`;
    const modal = document.getElementById('pano-viewer-modal');
    modal.style.display = 'flex';

    // Przypisz obrazy do Ĺ›cian szeĹ›cianu (front, right, back, left, top, bottom)
    const faces = ['front', 'right', 'back', 'left', 'top', 'bottom'];
    faces.forEach((face, i) => {
        const div = document.querySelector(`.face-${face}`);
        if (div) div.style.backgroundImage = `url('${path}panorama_${i}.png')`;
    });

    panoYaw = 0;
    panoPitch = 0;
    panoZoom = 500;
    updatePanoTransform();
}

function updatePanoTransform() {
    const cube = document.getElementById('pano-cube');
    const container = document.getElementById('pano-cube-container');
    // Przesuwamy szeĹ›cian o wartoĹ›Ä‡ panoZoom w stronÄ™ kamery, aby byÄ‡ DOKĹADNIE w jego Ĺ›rodku
    if (cube) cube.style.transform = `translate3d(0, 0, ${panoZoom}px) rotateX(${panoPitch}deg) rotateY(${panoYaw}deg)`;
    if (container) container.style.perspective = `${panoZoom}px`;
}

// ObsĹ‚uga przeciÄ…gania
document.getElementById('pano-cube-container')?.addEventListener('pointerdown', (e) => {
    isPanoDragging = true;
    lastPanoX = e.clientX;
    lastPanoY = e.clientY;
    e.target.setPointerCapture(e.pointerId);
});

window.addEventListener('pointermove', (e) => {
    if (!isPanoDragging) return;
    const dx = e.clientX - lastPanoX;
    const dy = e.clientY - lastPanoY;
    // OdwrĂłcona oĹ› myszy (naturalna dla panoramy)
    panoYaw -= dx * 0.15;
    panoPitch += dy * 0.15;
    panoPitch = Math.max(-85, Math.min(85, panoPitch));
    lastPanoX = e.clientX;
    lastPanoY = e.clientY;
    updatePanoTransform();
});

window.addEventListener('pointerup', () => {
    isPanoDragging = false;
});

// ObsĹ‚uga zoomu
document.getElementById('pano-cube-container')?.addEventListener('wheel', (e) => {
    e.preventDefault();
    panoZoom = Math.max(300, Math.min(2000, panoZoom + e.deltaY));
    updatePanoTransform();
}, { passive: false });

// Auto-rotacja jak w menu Minecrafta
let autoRotLastTime = Date.now();
function panoAutoRotate() {
    if (!isPanoDragging && document.getElementById('pano-viewer-modal').style.display === 'flex') {
        const now = Date.now();
        const delta = (now - autoRotLastTime) / 1000;
        panoYaw += delta * 2; // Wolny obrĂłt (2 stopnie na sekunde)
        updatePanoTransform();
    }
    autoRotLastTime = Date.now();
    requestAnimationFrame(panoAutoRotate);
}
panoAutoRotate();

function closePolyInfo() {
    selectedPolygonIndex = -1;
    document.getElementById('poly-info-panel').style.display = 'none';
    draw();
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

//obsĹ‚uga myszy i dotyku
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
        tempPoints[draggedPointIndex] = [Math.round(wx), Math.round(wz)];
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

//obsĹ‚uga myszy i dotyku
canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    lastX = e.clientX; lastY = e.clientY;
    clickStartTime = Date.now();
    clickStartX = e.clientX; clickStartY = e.clientY;

    if (isDrawing) {
        detectHover(e.clientX, e.clientY);
        if (hoverPoint !== -1) {
            isDraggingPoint = true;
            draggedPointIndex = hoverPoint;
            canvas.setPointerCapture(e.pointerId);
            return;
        }
        if (hoverEdge !== -1 && edgePoint) {
            tempPoints.splice(hoverEdge + 1, 0, [Math.round(edgePoint.x), Math.round(edgePoint.z)]);
            isDraggingPoint = true;
            draggedPointIndex = hoverEdge + 1;
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
    }
});

canvas.addEventListener('pointerup', e => {
    const elapsed = Date.now() - clickStartTime;
    const dist = Math.hypot(e.clientX - clickStartX, e.clientY - clickStartY);

    if (isDraggingPoint) {
        isDraggingPoint = false;
        draggedPointIndex = -1;
    }
    if (isPanning) {
        isPanning = false;
    }
    canvas.releasePointerCapture(e.pointerId);

    // CLICK (short and no drag)
    if (elapsed < 250 && dist < 10) {
        const [wx, wz] = screenToWorld(e.clientX, e.clientY);

        if (isDrawing) {
            detectHover(e.clientX, e.clientY);
            if (hoverPoint !== -1) {
                tempPoints.splice(hoverPoint, 1);
            } else if (hoverEdge === -1) {
                tempPoints.push([Math.round(wx), Math.round(wz)]);
            }
            updateRailInfo();
            draw();
        } else {
            // SELEKCJA (Deep Selection)
            let foundIndices = [];
            for (let i = polygons.length - 1; i >= 0; i--) {
                const p = polygons[i];
                if (!window.visibleCategories[p.category]) continue;
                if (p.temporary && !window.visibleTemporary) continue;

                const pts = p.points || p.location || [];
                if (isPointInPolygon(wx, wz, pts)) {
                    foundIndices.push(i);
                }
            }

            if (foundIndices.length > 0) {
                // JeĹ›li aktualnie wybrany poligon jest w liĹ›cie znalezionych, wybierz nastÄ™pny (cykl)
                let currentPos = foundIndices.indexOf(selectedPolygonIndex);
                let nextIdx = foundIndices[(currentPos + 1) % foundIndices.length];
                showPolyInfo(nextIdx);
            } else {
                showPolyInfo(-1);
            }
        }
    }
});

//zoom koĹ‚em i dotykiem
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldPpb = getPixelScale().scale;
    const worldX = viewX + (mx - innerWidth / 2) / oldPpb;
    const worldZ = viewY + (my - innerHeight / 2) / oldPpb;

    // Krzywa wykĹ‚adnicza zoomu
    const zoomFactor = 1.15;
    if (e.deltaY < 0) zoom = Math.min(40, zoom * zoomFactor);
    else zoom = Math.max(0.1, zoom / zoomFactor);

    slider.value = zoom;
    const newPpb = getPixelScale().scale;
    viewX = worldX - (mx - innerWidth / 2) / newPpb;
    viewY = worldZ - (my - innerHeight / 2) / newPpb;
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
        const worldX = viewX + (mx - innerWidth / 2) / oldPpb;
        const worldZ = viewY + (my - innerHeight / 2) / oldPpb;
        zoom = Math.max(0.1, Math.min(40, zoom * (1 + delta * 3)));
        slider.value = zoom;
        const newPpb = getPixelScale().scale;
        viewX = worldX - (mx - innerWidth / 2) / newPpb;
        viewY = worldZ - (my - innerHeight / 2) / newPpb;
        clampView();
        lastDist = dist;
        draw();
    }
}, { passive: false });

//pomocnicze
function editPolygon(idx) {
    const p = polygons[idx];
    selectedPolygonIndex = idx;
    isDrawing = true;
    tempPoints = JSON.parse(JSON.stringify(p.points || p.location || []));
    editorConfig = { ...p };

    // OtwĂłrz odpowiedni panel
    if (['terrain', 'road', 'pin'].includes(p.category)) {
        if (editorPanel) editorPanel.style.display = 'block';
    } else {
        if (railEditorPanel) railEditorPanel.style.display = 'block';
    }

    if (openAddMenuBtn) openAddMenuBtn.style.display = 'none';
    if (editModeBtn) editModeBtn.style.display = 'block';

    draw();
}

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
    if (editorConfig.category === 'intersection' || editorConfig.category === 'pin') minPoints = 1;
    if (tempPoints.length < minPoints) {
        alert("Za maĹ‚o punktĂłw! Minimum " + minPoints + ".");
        return;
    }
    if (editorConfig.category === 'pin' && tempPoints.length > 1) {
        tempPoints = [tempPoints[0]];
    }
    const usedNames = new Set(polygons.map(p => p.name).filter(n => n));
    if (editorConfig.name && usedNames.has(editorConfig.name)) {
        alert('Nazwa istnieje!');
        return;
    }
    if (editorConfig.category === 'station' && !editorConfig.name) {
        alert('Nazwa obowiÄ…zkowa!');
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
    }
    // Pobierz autorĂłw z checkboxĂłw
    const checkboxes = document.querySelectorAll('#polyAuthorsList input:checked');
    poly.authors = Array.from(checkboxes).map(cb => cb.value);
    if (poly.authors.length === 0 && currentUser) poly.authors = [currentUser.nick];

    poly.author = poly.authors[0] || "Nieznany";

    if (selectedPolygonIndex !== -1) {
        logChange("Edycja", poly);
        polygons[selectedPolygonIndex] = poly;
    } else {
        logChange("Dodanie", poly);
        polygons.push(poly);
    }

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
    if (poly.authors) fullCode += ' authors: ' + JSON.stringify(poly.authors) + ',\n';
    fullCode += '},';

    codeText.value = fullCode;
    codeModal.style.display = 'block';
    notifyChange();
    window.tempPoly = poly;
    draw();
}

function finalizeSave(add) {
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
    if (openAddMenuBtn) openAddMenuBtn.style.display = 'block';
    editModeBtn.style.display = 'none';
    selectedPolygonIndex = -1;
    window.hasUnsavedChanges = false;
}

// OstrzeĹĽenie przed wyjĹ›ciem
window.onbeforeunload = function () {
    if (window.hasUnsavedChanges || isDrawing) {
        return "Masz niezapisane zmiany! Czy na pewno chcesz wyjĹ›Ä‡?";
    }
};

// Szybki Zapis
document.getElementById('quickSaveBtn').addEventListener('click', savePolygon);
document.getElementById('railQuickSaveBtn').addEventListener('click', savePolygon);

// ObsĹ‚uga Zegara Historii
document.getElementById('history-clock').addEventListener('click', () => {
    const panel = document.getElementById('history-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

// ObsĹ‚uga PorĂłwnywarki
let isComparing = false;
const compareHandle = document.getElementById('compare-handle');
const beforeWrapper = document.getElementById('img-before-wrapper');

if (compareHandle && beforeWrapper) {
    compareHandle.addEventListener('mousedown', () => isComparing = true);
    window.addEventListener('mouseup', () => isComparing = false);
    window.addEventListener('mousemove', (e) => {
        if (!isComparing) return;
        const container = document.getElementById('compare-slider-container');
        const rect = container.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(rect.width, x));
        const percent = (x / rect.width) * 100;
        compareHandle.style.left = x + 'px';
        beforeWrapper.style.width = percent + '%';
    });
}

// Logika 360 Panorama
const panoCanvas = document.getElementById('panorama-canvas');
const panoCtx = panoCanvas ? panoCanvas.getContext('2d') : null;
let panoImg = new Image();
let panoRotation = 0;
let isRotatingPano = false;

function openPanorama(src) {
    if (!panoCanvas || !panoCtx) return;
    panoImg.src = src;
    panoImg.onload = () => {
        const modal = document.getElementById('pano-modal');
        if (modal) modal.style.display = 'block';
        resizePano();
        animatePano();
    };
}

function resizePano() {
    panoCanvas.width = innerWidth * 0.9;
    panoCanvas.height = innerHeight * 0.9;
}

function animatePano() {
    const modal = document.getElementById('pano-modal');
    if (!modal || modal.style.display === 'none' || !panoCanvas) return;
    panoRotation += 0.001;
    drawPano();
    requestAnimationFrame(animatePano);
}

function drawPano() {
    if (!panoCanvas || !panoCtx || !panoImg.complete) return;
    const w = panoCanvas.width;
    const h = panoCanvas.height;
    panoCtx.clearRect(0, 0, w, h);

    // Prosta projekcja cylindryczna (uproszczona)
    const imgW = panoImg.width;
    const imgH = panoImg.height;
    const offset = (panoRotation % 1) * imgW;

    panoCtx.drawImage(panoImg, offset, 0, imgW - offset, imgH, 0, 0, (imgW - offset) * (h / imgH), h);
    panoCtx.drawImage(panoImg, 0, 0, offset, imgH, (imgW - offset) * (h / imgH), 0, offset * (h / imgH), h);
}

window.addEventListener('resize', resizePano);

// UI - Zabezpieczone listenery
if (openBtn) {
    openBtn.addEventListener('click', () => {
        if (editorPanel) editorPanel.style.display = 'block';
        openBtn.style.display = 'none';
        if (openRailBtn) openRailBtn.style.display = 'none';
    });
}

if (openRailBtn) {
    openRailBtn.addEventListener('click', () => {
        if (railPanel) railPanel.style.display = 'block';
        openRailBtn.style.display = 'none';
        if (openBtn) openBtn.style.display = 'none';
    });
}

if (closeRail) {
    closeRail.addEventListener('click', () => {
        if (railPanel) railPanel.style.display = 'none';
        if (openRailBtn) openRailBtn.style.display = 'block';
        if (openBtn) openBtn.style.display = 'block';
    });
}

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        if (isDrawing) {
            finalizeSave(false);
        } else {
            if (editorPanel) editorPanel.style.display = 'none';
            if (openBtn) openBtn.style.display = 'block';
            if (openRailBtn) openRailBtn.style.display = 'block';
        }
    });
}

if (closeRailEditor) {
    closeRailEditor.addEventListener('click', () => {
        if (isDrawing) {
            finalizeSave(false);
        } else {
            if (railEditorPanel) railEditorPanel.style.display = 'none';
            if (openBtn) openBtn.style.display = 'block';
            if (openRailBtn) openRailBtn.style.display = 'block';
        }
    });
}

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

if (closePathToggle) {
    closePathToggle.addEventListener('click', () => {
        editorConfig.closePath = !editorConfig.closePath;
        closePathToggle.textContent = editorConfig.closePath ? 'ON' : 'OFF';
        closePathToggle.style.background = editorConfig.closePath ? '#0f0' : '#f00';
        if (isDrawing) draw();
    });
}

if (temporaryToggle) {
    temporaryToggle.addEventListener('click', () => {
        editorConfig.temporary = !editorConfig.temporary;
        temporaryToggle.textContent = editorConfig.temporary ? 'ON' : 'OFF';
        temporaryToggle.style.background = editorConfig.temporary ? '#0f0' : '#f00';
        if (isDrawing) draw();
    });
}

if (railTemporaryToggle) {
    railTemporaryToggle.addEventListener('click', () => {
        editorConfig.temporary = !editorConfig.temporary;
        railTemporaryToggle.textContent = editorConfig.temporary ? 'ON' : 'OFF';
        railTemporaryToggle.style.background = editorConfig.temporary ? '#0f0' : '#f00';
        if (isDrawing) draw();
    });
}

if (document.getElementById('lineColor')) {
    document.getElementById('lineColor').addEventListener('input', e => {
        const hex = e.target.value;
        editorConfig.lineColor = hex;
        editorConfig.fillColor = (['terrain', 'station', 'intersection'].includes(editorConfig.category) ? hex + '33' : 'transparent');
        if (isDrawing) draw();
    });
}

if (railLineColor) {
    railLineColor.addEventListener('input', e => {
        const hex = e.target.value;
        editorConfig.lineColor = hex;
        editorConfig.fillColor = (['terrain', 'station', 'intersection'].includes(editorConfig.category) ? hex + '33' : 'transparent');
        if (isDrawing) draw();
    });
}

if (document.getElementById('polyName')) {
    document.getElementById('polyName').addEventListener('input', e => {
        editorConfig.name = e.target.value;
        if (isDrawing) draw();
    });
}

if (railPolyName) {
    railPolyName.addEventListener('input', e => {
        editorConfig.name = e.target.value;
        if (isDrawing) draw();
    });
}

if (document.getElementById('polyDesc')) {
    document.getElementById('polyDesc').addEventListener('input', e => {
        editorConfig.opis = e.target.value;
    });
}

if (railPolyDesc) {
    railPolyDesc.addEventListener('input', e => {
        editorConfig.opis = e.target.value;
    });
}

if (startDrawingBtn) {
    startDrawingBtn.addEventListener('click', () => {
        if (editorPanel) editorPanel.style.display = 'none';
        if (!isDrawing) {
            isDrawing = true;
            tempPoints = [];
            inPointIndex = -1;
            outPointIndex = -1;
            canvas.style.cursor = 'crosshair';
            info.textContent = 'Klik=dodaj | klik punkt=usuĹ„ | przytrzymaj=przesuĹ„';
            if (openBtn) openBtn.style.display = 'none';
            if (openRailBtn) openRailBtn.style.display = 'none';
            if (editModeBtn) editModeBtn.style.display = 'block';
        } else {
            savePolygon();
        }
        draw();
    });
}

if (railStartDrawing) {
    railStartDrawing.addEventListener('click', () => {
        if (railEditorPanel) railEditorPanel.style.display = 'none';
        if (!isDrawing) {
            isDrawing = true;
            tempPoints = [];
            inPointIndex = -1;
            outPointIndex = -1;
            if (editorConfig.category === 'rail') {
                selectingFrom = true;
                if (railInfo) {
                    railInfo.textContent = '[?] <=> [?]';
                    railInfo.style.display = 'block';
                }
            }
            canvas.style.cursor = 'crosshair';
            info.textContent = 'Klik=dodaj | klik punkt=usuĹ„ | przytrzymaj=przesuĹ„';
            if (openBtn) openBtn.style.display = 'none';
            if (openRailBtn) openRailBtn.style.display = 'none';
            if (editModeBtn) editModeBtn.style.display = 'block';
        } else {
            savePolygon();
        }
        draw();
    });
}

if (editModeBtn) {
    editModeBtn.addEventListener('click', () => {
        if (['terrain', 'road'].includes(editorConfig.category)) {
            editorPanel.style.display = 'block';
            if (startDrawingBtn) startDrawingBtn.textContent = 'ZAKOĹCZ RYSOWANIE';
        } else {
            if (railEditorPanel) railEditorPanel.style.display = 'block';
            if (railStartDrawing) railStartDrawing.textContent = 'ZAKOĹCZ RYSOWANIE';
        }
    });
}

if (railAddInBtn) {
    railAddInBtn.addEventListener('click', () => {
        settingIn = true;
        settingOut = false;
        canvas.style.cursor = 'pointer';
    });
}

if (railAddOutBtn) {
    railAddOutBtn.addEventListener('click', () => {
        settingIn = false;
        settingOut = true;
        canvas.style.cursor = 'pointer';
    });
}

window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isDrawing) {
        finalizeSave(false);
    }
});

if (copyBtn) {
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(codeText.value).then(() => alert('SKOPIOWANO!')).catch(() => prompt('WKLEJ DO pozycje.js:', codeText.value));
    });
}

if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        codeModal.style.display = 'none';
        finalizeSave(true);
    });
}

if (returnBtn) {
    returnBtn.addEventListener('click', () => {
        codeModal.style.display = 'none';
        isDrawing = true;
        canvas.style.cursor = 'crosshair';
        draw();
    });
}

// ObsĹ‚uga NOWEGO MENU DODAWANIA
if (openAddMenuBtn) {
    openAddMenuBtn.addEventListener('click', () => {
        if (isDrawing || isEditing) {
            alert('ZakoĹ„cz obecne rysowanie/edycjÄ™ przed dodaniem nowego elementu!');
            return;
        }
        addMenuPanel.style.display = 'block';
        addMenuMain.style.display = 'flex';
        addMenuRail.style.display = 'none';
    });
}

if (closeAddMenuBtn) {
    closeAddMenuBtn.addEventListener('click', () => addMenuPanel.style.display = 'none');
}

if (backToAddMain) {
    backToAddMain.addEventListener('click', () => {
        addMenuMain.style.display = 'flex';
        addMenuRail.style.display = 'none';
    });
}

document.querySelectorAll('.add-main-opt').forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (type === 'rail_group') {
            addMenuMain.style.display = 'none';
            addMenuRail.style.display = 'flex';
        } else {
            startNewPolygon(type);
        }
    });
});

document.querySelectorAll('.add-sub-opt').forEach(btn => {
    btn.addEventListener('click', () => {
        startNewPolygon(btn.dataset.type);
    });
});

function startNewPolygon(cat) {
    addMenuPanel.style.display = 'none';
    isDrawing = true;
    isEditing = false;
    tempPoints = [];
    selectedPolygonIndex = -1;

    editorConfig = {
        category: cat,
        lineColor: cat === 'pin' ? '#ff0000' : '#00ff00',
        fillColor: cat === 'pin' ? '#ff000033' : '#00ff0033',
        name: '',
        opis: '',
        closePath: cat !== 'road' && cat !== 'rail',
        authors: [currentUser ? currentUser.nick : "Nieznany"]
    };

    if (cat === 'road') {
        editorConfig.lineColor = '#ffffff';
        editorConfig.fillColor = 'transparent';
    }

    if (['terrain', 'road', 'pin'].includes(cat)) {
        editorPanel.style.display = 'block';
        railEditorPanel.style.display = 'none';
        document.getElementById('polyName').value = '';
        document.getElementById('polyDesc').value = '';
        document.getElementById('poly-add-photo-btn').style.display = (cat === 'pin' ? 'block' : 'none');
    } else {
        railEditorPanel.style.display = 'block';
        editorPanel.style.display = 'none';
        document.getElementById('rail-polyName').value = '';
        document.getElementById('rail-polyDesc').value = '';
        if (railCategory) railCategory.textContent = cat.toUpperCase();
        document.getElementById('rail-add-photo-btn').style.display = (cat === 'station' ? 'block' : 'none');
    }

    canvas.style.cursor = 'crosshair';
    draw();
}

// Przyciski POWRĂ“T w edytorach
document.getElementById('back-to-menu-terrain')?.addEventListener('click', () => {
    editorPanel.style.display = 'none';
    addMenuPanel.style.display = 'block';
    addMenuMain.style.display = 'flex';
    isDrawing = false;
    tempPoints = [];
    draw();
});

// Auto-odĹ›wieĹĽanie (co 0.5s) dla animacji Ĺ‚adowania
setInterval(() => {
    // interval teraz tylko wymusza sprawdzenie, ale animationLoop i tak dziaĹ‚a w 60fps
    // jeĹ›li potrzebujemy oszczÄ™dzaÄ‡ energiÄ™, moĹĽemy wrĂłciÄ‡ do needsRedraw, 
    // ale dla pĹ‚ynnego fade-inu 60fps jest lepsze.
}, 500);

// Przyciski DODAJ ZDJÄCIE
document.getElementById('poly-add-photo-btn')?.addEventListener('click', () => {
    alert('Funkcja dodawania zdjÄ™Ä‡ (wkrĂłtce)');
});
document.getElementById('rail-add-photo-btn')?.addEventListener('click', () => {
    alert('Funkcja dodawania zdjÄ™Ä‡ (wkrĂłtce)');
});

// PrzeĹ‚Ä…czniki widocznoĹ›ci
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

function editPolygon(idx) {
    const p = polygons[idx];
    if (!p) return;

    selectedPolygonIndex = idx;
    isDrawing = true;
    isEditing = true;
    tempPoints = JSON.parse(JSON.stringify(p.points || p.location || []));

    editorConfig = { ...p, authors: p.authors || (p.author ? [p.author] : []) };

    if (['terrain', 'road', 'pin'].includes(p.category)) {
        if (editorPanel) editorPanel.style.display = 'block';
        if (railEditorPanel) railEditorPanel.style.display = 'none';
        document.getElementById('polyName').value = p.name || '';
        document.getElementById('polyDesc').value = p.opis || '';
        document.getElementById('lineColor').value = p.lineColor || '#00ff00';
        if (document.getElementById('fillColor')) {
            document.getElementById('fillColor').value = p.fillColor ? p.fillColor.substring(0, 7) : '#00ff00';
        }
        if (document.getElementById('closePathToggle')) {
            document.getElementById('closePathToggle').checked = p.closePath;
        }
        if (document.getElementById('temporaryToggle')) {
            document.getElementById('temporaryToggle').checked = p.temporary;
        }
        document.getElementById('deletePolyBtn').style.display = 'block';
        document.getElementById('poly-add-photo-btn').style.display = (p.category === 'pin' ? 'block' : 'none');
    } else {
        if (railEditorPanel) railEditorPanel.style.display = 'block';
        if (editorPanel) editorPanel.style.display = 'none';
        document.getElementById('rail-polyName').value = p.name || '';
        document.getElementById('rail-polyDesc').value = p.opis || '';
        document.getElementById('rail-lineColor').value = p.lineColor || '#00ff00';
        if (document.getElementById('rail-temporaryToggle')) {
            document.getElementById('rail-temporaryToggle').checked = p.temporary;
        }
        document.getElementById('railDeletePolyBtn').style.display = 'block';
        document.getElementById('rail-add-photo-btn').style.display = (p.category === 'station' ? 'block' : 'none');
    }

    const checkboxes = document.querySelectorAll('#polyAuthorsList input');
    checkboxes.forEach(cb => {
        cb.checked = editorConfig.authors.includes(cb.value);
    });

    document.getElementById('poly-info-panel').style.display = 'none';
    canvas.style.cursor = 'crosshair';
    draw();
}

function deletePolygon(idx) {
    if (idx === -1) return;
    if (!confirm('Czy na pewno chcesz usunÄ…Ä‡ ten element?')) return;

    const p = polygons[idx];
    logChange('USUWANIE', p);
    polygons.splice(idx, 1);
    notifyChange();

    finalizeSave(true);
    closePolyInfo();
    alert('USUNIÄTO!');
}

if (document.getElementById('edit-poly-btn')) {
    document.getElementById('edit-poly-btn').addEventListener('click', () => {
        if (selectedPolygonIndex !== -1) editPolygon(selectedPolygonIndex);
    });
}

if (document.getElementById('close-info-btn')) {
    document.getElementById('close-info-btn').addEventListener('click', closePolyInfo);
}

if (document.getElementById('deletePolyBtn')) {
    document.getElementById('deletePolyBtn').addEventListener('click', () => deletePolygon(selectedPolygonIndex));
}

if (document.getElementById('railDeletePolyBtn')) {
    document.getElementById('railDeletePolyBtn').addEventListener('click', () => deletePolygon(selectedPolygonIndex));
}

function draw() {
    needsRedraw = true;
}

function animationLoop() {
    needsRedraw = false;
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

    // Panorama loop
    if (document.getElementById('pano-viewer-modal').style.display === 'flex') {
        drawPanoViewer();
    }

    requestAnimationFrame(animationLoop);
}

requestAnimationFrame(animationLoop);

window.onbeforeunload = null;

canvas.style.cursor = 'grab';

draw();

/* ==============================================================
   INTEGRACJA Z BACKENDEM (RENDER)
   ============================================================== */

const SERVER_URL = "https://mapa-backend-mtbw.onrender.com";

function updateServerStatus() {
    const statusText = document.getElementById('server-status-text');
    if (!statusText) return;

    statusText.className = 'loading';
    statusText.textContent = "Zapis: Wczytywanie...";

    fetch(SERVER_URL + "/status?t=" + Date.now())
        .then(response => {
            if (response.ok) {
                statusText.className = 'online';
                statusText.textContent = "Zapis: Aktywny";
            } else {
                statusText.className = 'error';
                statusText.textContent = "Zapis: Błąd";
            }
        })
        .catch(() => {
            statusText.className = 'error';
            statusText.textContent = "Zapis: Offline";
        });
}

updateServerStatus();
setInterval(updateServerStatus, 45000);

document.getElementById('submit-changes-btn').addEventListener('click', () => {
    const pass = prompt("Podaj hasło grupy, aby zatwierdzić zmiany na GitHubie:");
    if (!pass) return;

    const btn = document.getElementById('submit-changes-btn');
    const originalText = btn.textContent;

    btn.textContent = "ŁĄCZENIE...";
    btn.disabled = true;

    fetch(SERVER_URL + "/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            password: pass,
            content: document.getElementById('code-text').value,
            authors: window.tempPoly ? window.tempPoly.authors : [],
            message: "Aktualizacja mapy przez panel admina"
        })
    })
        .then(async response => {
            const txt = await response.text();
            if (response.ok) {
                alert("SUKCES: " + txt);
                window.hasUnsavedChanges = false;
                btn.style.display = 'none';
                setTimeout(() => location.reload(), 1000);
            } else {
                alert("BŁĄD: " + txt);
            }
        })
        .catch(e => {
            alert("Błąd połączenia z serwerem: " + e.message);
        })
        .finally(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        });
});
