/* ==============================================================
   poligony.js – rysowanie poligonów + tymczasowy poligon
   Wymaga: script.js (ctx, zoom, visibleCategories, tempPolygon, isDrawing)
   Importuje: pozycje.js (export const polygons = [ … ])
   ============================================================== */

import { polygons } from './pozycje.js';

// -------------------------------------------------------------
// 1. Pomocnicze – muszą być w tym samym zasięgu co drawPolygons
// -------------------------------------------------------------
function calculateCentroid(points) {
    let xSum = 0, zSum = 0;
    points.forEach(([x, z]) => { xSum += x; zSum += z; });
    const count = points.length;
    return count > 0 ? [xSum / count, zSum / count] : [0, 0];
}

/* Pełna wersja – tekst wzdłuż drogi (możesz podmienić na prostszą) */
function drawTextAlongPath(text, points, offset = 0) {
    if (points.length < 2) return;

    // Znajdź środek ścieżki
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
            ctx.fillStyle = 'white';
            ctx.fillText(text, 0, 0);
            ctx.restore();
            return;
        }
        travelled += segLen;
    }
}

// -------------------------------------------------------------
// 2. Główna funkcja – wywołuj ją z draw() w script.js
// -------------------------------------------------------------
function drawPolygons() {
    // ---- STAŁE POLIGONY ----
    if (polygons && polygons.length > 0) {
        polygons.forEach(polygon => {
            // Pomijaj niewidoczne kategorie
            if (!visibleCategories[polygon.category]) return;
            if (!polygon.points || polygon.points.length === 0) return;

            // Ukryj drogi przy małym zoomie
            if (polygon.category === 2 && zoom <= 3) return;

            const { points, lineColor, fillColor, closePath, name, category } = polygon;

            ctx.beginPath();
            points.forEach((p, i) => {
                const [x, z] = p;
                if (i === 0) ctx.moveTo(x, z);
                else ctx.lineTo(x, z);
            });
            if (closePath && category === 1) ctx.closePath();

            // Wypełnienie (tylko tereny)
            ctx.fillStyle = category === 1 ? fillColor : 'rgba(0,0,0,0)';
            ctx.fill();

            // Obramowanie
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = category === 1
                ? 2 / zoom
                : (category === 2 ? 6 / zoom : 3 / zoom);
            ctx.stroke();

            // Nazwa
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
    }

    // ---- TEMPORALNY POLIGON (podczas rysowania) ----
    if (window.isDrawing && window.tempPolygon?.points?.length > 0) {
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

        // Punkty kontrolne
        pts.forEach(([x, z]) => {
            ctx.beginPath();
            ctx.arc(x, z, 3 / zoom, 0, Math.PI * 2);
            ctx.fillStyle = 'red';
            ctx.fill();
        });
    }
}

// -------------------------------------------------------------
// 3. Eksport (dla module script)
// -------------------------------------------------------------
export { drawPolygons, calculateCentroid, drawTextAlongPath };