# Control de Robots

Sistema de administración para viajes de robots tipo carrito entre almacén y líneas de producción, con rastreo por GPS/geocercas y balanceo de cargas.

## Stack

- Frontend: SvelteKit + Svelte 5 + Leaflet/OpenStreetMap
- Backend: Node.js + Express 5, expuesto como Vercel Functions con `serverless-http`
- Base de datos: Supabase Postgres + Supabase Auth
- Monorepo: npm workspaces, preparado para publicar en Vercel

## Estructura

```text
apps/
  api/    Backend Node.js/Express + funciones serverless en api/
  web/    Frontend SvelteKit
supabase/
  schema.sql
```

## Configuración local

1. Instala dependencias:

```powershell
npm install
```

2. Configura Supabase:

- Crea un proyecto en Supabase.
- En el SQL Editor ejecuta `supabase/schema.sql`.
- Copia `.env.example` a `apps/api/.env` y completa:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Copia `apps/web/.env.example` a `apps/web/.env` y define `API_URL`.

El backend lee `apps/api/.env`; si ese archivo tiene placeholders, usa el `.env` de la raíz como fallback.

3. Verifica la conexión con Supabase:

```powershell
npm run db:test
```

4. Levanta backend y frontend en terminales separadas:

```powershell
npm run dev:api
npm run dev:web
```

Backend: `http://localhost:3001`  
Frontend: `http://localhost:5173`

## Seguridad

- Las contraseñas no se guardan en la base de datos del proyecto: se delegan a Supabase Auth, que las hashea.
- El backend valida el JWT del usuario con Supabase antes de acceder a datos.
- Las escrituras sensibles pasan por el backend con `SUPABASE_SERVICE_ROLE_KEY`; esa llave solo debe vivir en variables de entorno.
- RLS está habilitado en Supabase y el frontend no recibe la service role key.

## Google OAuth

Las pantallas `/login` y `/signup` incluyen "Continuar con Google" / "Crear cuenta con Google".

1. En Supabase Dashboard ve a **Authentication → Sign In / Providers → Google** y habilítalo.
2. Configura el cliente OAuth de Google y agrega estos redirect URLs:
   - `http://localhost:5173/auth/callback`
   - `https://<dominio-web>/auth/callback`
3. El frontend obtiene `SUPABASE_URL` y `SUPABASE_ANON_KEY` desde `GET /api/auth/config`, así que no necesitas agregarlos al `.env` del frontend.
4. El flujo usa PKCE y vuelve por `/auth/callback`; ahí se guarda el access token y se entra al dashboard.

## Balanceo de cargas

El backend incluye `apps/api/src/services/loadBalancer.js`.

Al asignar un viaje, el balanceador evalúa robots elegibles por:

- capacidad restante real (`capacity_kg - load_kg` reservado por viajes activos)
- distancia al almacén de origen
- viajes activos del robot
- batería
- estado del robot

Endpoints útiles:

- `POST /api/trips/:id/auto-assign`
- `POST /api/load-balancing/run`
- `POST /api/load-balancing/trips/:id/suggest`

## Geocercas y GPS

- Las geocercas se guardan como polígonos GeoJSON en `geofences.polygon`.
- El backend evalúa `point-in-polygon` en `POST /api/locations`.
- Cuando un robot entra a la geocerca de destino de un viaje `in_transit`, el viaje pasa a `arrived`.
- La app móvil futura solo necesita enviar:

```json
{
  "robot_id": "uuid",
  "trip_id": "uuid",
  "lat": 12.1364,
  "lng": -86.2514,
  "accuracy": 8,
  "speed": 1.2,
  "heading": 90,
  "recorded_at": "2026-11-12T12:00:00.000Z"
}
```

## Publicación en Vercel

Crea dos proyectos en Vercel apuntando al mismo monorepo:

1. **Frontend**
   - Root Directory: `apps/web`
   - Framework: SvelteKit
   - Variable: `API_URL=https://<dominio-api>/api`

2. **Backend**
   - Root Directory: `apps/api`
   - Framework: Node.js / Other
   - Variables:
     - `SUPABASE_URL`
     - `SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `CLIENT_ORIGIN=https://<dominio-web>`
   - Las funciones están en `apps/api/api/` (`index.js` y `[...path].js`).

Después apunta `API_URL` del frontend al dominio del backend.

## Endpoints principales

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET/POST /api/sites`
- `GET/POST/PATCH /api/geofences`
- `GET/POST/PATCH /api/robots`
- `GET/POST /api/trips`
- `POST /api/trips/:id/assign`
- `POST /api/trips/:id/auto-assign`
- `POST /api/trips/:id/start|arrive|complete|cancel`
- `POST/GET /api/locations`
- `GET /api/dashboard`
- `POST /api/load-balancing/run`
