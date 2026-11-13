function toNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} debe ser un número válido`);
  }
  return number;
}

function normalizePolygon(polygon) {
  if (!polygon) throw new Error('polygon es requerido');

  // Acepta GeoJSON Polygon o un anillo simple [[lng, lat], ...]
  if (polygon && polygon.type === 'Polygon' && Array.isArray(polygon.coordinates)) {
    return polygon;
  }

  if (Array.isArray(polygon)) {
    const looksLikeRing = Array.isArray(polygon[0]) && typeof polygon[0][0] === 'number';
    const looksLikeRings = Array.isArray(polygon[0]) && Array.isArray(polygon[0][0]);
    if (looksLikeRing) return { type: 'Polygon', coordinates: [polygon] };
    if (looksLikeRings) return { type: 'Polygon', coordinates: polygon };
  }

  throw new Error('polygon debe ser GeoJSON Polygon o un arreglo de coordenadas [lng, lat]');
}

function validatePolygon(polygon) {
  const geo = normalizePolygon(polygon);
  const coordinates = geo.coordinates?.[0];
  if (!Array.isArray(coordinates)) throw new Error('polygon.coordinates[0] es requerido');

  const ring = coordinates.map((coord, index) => {
    if (!Array.isArray(coord) || coord.length < 2) {
      throw new Error(`Coordenada ${index} inválida`);
    }
    const lng = toNumber(coord[0], `lng[${index}]`);
    const lat = toNumber(coord[1], `lat[${index}]`);
    if (lng < -180 || lng > 180) throw new Error(`lng[${index}] fuera de rango`);
    if (lat < -90 || lat > 90) throw new Error(`lat[${index}] fuera de rango`);
    return [lng, lat];
  });

  const unique = new Set(ring.map(([lng, lat]) => `${lng},${lat}`));
  if (unique.size < 3) throw new Error('polygon necesita al menos 3 puntos distintos');

  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];

  return { type: 'Polygon', coordinates: [closed] };
}

function pointInPolygon(lng, lat, polygon) {
  const geo = normalizePolygon(polygon);
  const ring = geo.coordinates?.[0] || [];
  if (ring.length < 3) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { validatePolygon, pointInPolygon, haversineKm, normalizePolygon };
