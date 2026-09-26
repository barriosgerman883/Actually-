# actually? — Architecture

## 1. Visión general

La arquitectura de `actually?` debe priorizar:

1. seguridad;
2. observabilidad;
3. extensibilidad;
4. testabilidad;
5. explicabilidad;
6. bajo mantenimiento.

El sistema debe poder inspeccionar entornos heterogéneos sin convertirse en un package manager universal.

---

## 2. Arquitectura conceptual

```text
                    USER

                     │
                     ▼

                    CLI
                     │
                     ▼

               APPLICATION CORE

      ┌──────────────┼──────────────┐
      │              │              │
      ▼              ▼              ▼

  INVENTORY       DETECTION      VERSIONING

      │              │              │
      └──────────────┼──────────────┘
                     │
                     ▼

                  PROVIDERS

     ┌─────────────┬─┴───────────┬─────────────┐
     │             │             │             │
     ▼             ▼             ▼             ▼

   pnpm      npm registry       Git         GitHub

     │             │             │             │
     └─────────────┴─┬───────────┴─────────────┘
                     │
                     ▼

               INFRASTRUCTURE

        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼

   Filesystem    CommandRunner   HttpClient
```

---

## 3. Capas

## 3.1 CLI

Responsabilidades:

- parsear argumentos;
- ejecutar casos de uso;
- seleccionar formatter;
- mostrar errores;
- definir exit codes.

> **Decisión pendiente (open-questions #15):** los exit codes no están definidos.

No debe:

- leer filesystem directamente;
- ejecutar comandos;
- hacer requests;
- conocer detalles de providers.

Ejemplo:

```ts
const result = await application.status(options);
formatter.render(result);
```

---

## 3.2 Core

El core contiene conceptos del dominio.

Ejemplos:

```text
ToolRecord
Evidence
Confidence
Scope
Version
Installation
Source
Status
```

El core no conoce:

- `node:fs`;
- `child_process`;
- GitHub HTTP;
- pnpm CLI;
- sistema operativo.

Debe ser portable y altamente testeable.

---

## 3.3 Scanners

Un scanner encuentra señales.

Ejemplos:

```text
ProjectScanner
FilesystemScanner
PathScanner
GitRepositoryScanner
```

Un scanner no determina necesariamente el significado completo de una señal.

Ejemplo:

```text
FilesystemScanner

found:
~/projects/foo/pnpm-lock.yaml
```

La interpretación pertenece a un provider o detector especializado.

Un repositorio encontrado por `GitRepositoryScanner` es un proyecto salvo evidencia positiva de que es una herramienta. La regla está en mvp.md §5.3.

> **Decisión pendiente (open-questions #14):** qué directorios de PATH recorre `PathScanner`. Recorrer todo PATH listaría miles de binarios del sistema como desconocidos.

---

## 3.4 Providers

Los providers traducen señales externas al modelo de dominio.

Ejemplos:

```text
PnpmProvider
GitProvider
GitHubProvider
```

Tipos posibles:

### Installation Provider
Determina quién administra una instalación.

### Source Provider
Determina el origen lógico o repositorio.

### Version Provider
Determina latest stable version.

Una misma herramienta puede tener:

```text
source:       GitHub
installation: pnpm
update:       pnpm
```

`update` es un dato informativo derivado de `installation`, no un cuarto tipo de provider (ver §5).

---

## 3.5 Infrastructure

Única capa con acceso directo a efectos externos.

### Filesystem
Abstrae lectura de archivos, directorios y resolución de paths.

### CommandRunner
Único componente autorizado a lanzar procesos.

### HttpClient
Único componente autorizado a realizar requests.

### Clock
Abstracción del tiempo. Necesaria para el TTL de la caché.

### Cache
Único componente autorizado a escribir en disco, y solo dentro del directorio de caché de `actually?` (§14).

---

## 4. Flujo de detección

```text
scan request
   │
   ▼
discover signals
   │
   ▼
providers inspect signals
   │
   ▼
produce evidence
   │
   ▼
normalize records
   │
   ▼
resolve versions
   │
   ▼
calculate confidence
   │
   ▼
build inventory
```

---

## 5. Modelo de dominio

Este es el único modelo de dominio del proyecto. mvp.md y design.md lo referencian en vez de duplicarlo.

El JSON público (design.md §14) es una proyección de este modelo. Puede renombrar o aplanar campos, pero no puede exponer datos que el modelo no tenga.

```ts
export type ToolScope = "global" | "project";

export type ConfidenceLevel = "low" | "medium" | "high";

export interface Evidence {
  /** `fact`: una fuente autoritativa lo afirma. `inference`: se deduce. */
  kind: "fact" | "inference";
  /** Qué se consultó: un comando, un archivo o un endpoint. */
  source: string;
  description: string;
}

/**
 * Una afirmación sobre un dato, con su estado explícito.
 * Un campo opcional no distingue "no lo sé" de "no aplica";
 * un Claim sí.
 */
export type Claim<T> =
  | {
      state: "known";
      value: T;
      confidence: ConfidenceLevel;
      evidence: Evidence[];
    }
  | {
      state: "unknown";
      reason: string;
      evidence: Evidence[];
    }
  | { state: "not-applicable" };

export interface VersionClaims {
  /** Rango declarado, por ejemplo "^5.9.0" en package.json. */
  requested: Claim<string>;
  /** Versión fijada en el lockfile. */
  resolved: Claim<string>;
  /** Versión presente en disco. */
  installed: Claim<string>;
  /** Última versión estable conocida. */
  latest: Claim<string>;
}

/** Tipo de cambio entre la versión local y la última estable. */
export type UpdateType = "major" | "minor" | "patch";

/** Estado que muestra `status`. Se deriva; ningún provider lo asigna. */
export type ToolStatus =
  | "current"   // ✓
  | "outdated"  // ↑
  | "unknown"   // ?
  | "warning"   // !
  | "error";    // ×

export interface ToolRecord {
  id: string;
  name: string;

  scope: ToolScope;
  /** Raíz del proyecto. Presente solo cuando scope es "project". */
  projectRoot?: string;

  versions: VersionClaims;
  installation: Claim<Installation>;
  source: Claim<ToolSource>;
  update: Claim<UpdateStrategy>;

  status: ToolStatus;
  /** Presente solo cuando status es "outdated". */
  updateType?: UpdateType;
  /** Resumen de los claims que determinan `status` (ver §6). */
  confidence: ConfidenceLevel;
}
```

`status` se calcula comparando `versions.latest` con la versión local más concreta que se conozca: `installed` si está disponible, si no `resolved`.

| Estado | Condición |
|---|---|
| `current` | ambas versiones conocidas e iguales |
| `outdated` | la versión local es menor que `latest` |
| `unknown` | alguna de las dos es `unknown` |
| `warning` | la versión local es mayor que `latest`, o no son comparables como semver |
| `error` | el provider falló al inspeccionar la herramienta |

`outdated` es un solo estado. El tipo de cambio va en `updateType`, que se calcula comparando las versiones según semver:

- `major` si cambia el primer número;
- `minor` si cambia el segundo;
- `patch` si cambia el tercero.

En versiones `0.x`, semver no garantiza compatibilidad entre versiones minor, así que un cambio de minor cuenta como `major`.

Esto permite resúmenes como "2 updates available, 1 major version change" (design.md §4) sin agregar estados.

### Installation

```ts
export interface Installation {
  provider: string;
  path?: string;
}
```

### ToolSource

```ts
export interface ToolSource {
  provider: string;
  identifier: string;
  url?: string;
}
```

### UpdateStrategy

```ts
/**
 * Cómo se actualizaría la herramienta. Es informativo:
 * actually nunca ejecuta actualizaciones.
 */
export interface UpdateStrategy {
  provider: string;
}
```

`UpdateStrategy` no es un cuarto tipo de provider. En el MVP siempre coincide con el installation provider y se deriva de él.

---

## 6. Confidence model

La confianza se asigna por afirmación (`Claim`), no por herramienta. Una misma herramienta puede tener la versión instalada con confianza alta y el origen con confianza baja, y la salida debe mostrarlo.

Cada `Evidence` es de uno de dos tipos:

- `fact`: una fuente autoritativa lo afirma directamente. Ejemplo: `pnpm list --global --json` incluye `gstack@1.0.0`.
- `inference`: se deduce de otras señales. Ejemplo: el campo `repository` del paquete en npm apunta a GitHub, así que ese repositorio es probablemente el origen.

Reglas del MVP:

| Nivel | Condición |
|---|---|
| `high` | al menos un `fact` afirma el valor y ninguna evidencia lo contradice |
| `medium` | solo inferencias, al menos dos independientes y concordantes |
| `low` | una sola inferencia, o evidencia contradictoria |

Si no hay evidencia suficiente ni para `low`, el claim queda `unknown` con un `reason`.

La confianza resumida de un `ToolRecord` es la mínima entre `versions.installed` (o `resolved`), `versions.latest` e `installation`, contando solo los que están en estado `known`.

No se usan porcentajes ni pesos numéricos, porque implicarían una precisión que el modelo no tiene. Las reglas pueden evolucionar, pero cada cambio debe reflejarse aquí y en docs/concepts/confidence.md.

---

## 7. CommandRunner

El `CommandRunner` es una frontera de seguridad.

API conceptual:

```ts
interface CommandRequest {
  binary: AllowedBinary;
  args: readonly string[];
  cwd?: string;
  intent: "read";
}
```

No debe aceptar:

```text
raw shell string
shell: true
sudo
arbitrary executable
```

> **Decisión pendiente (open-questions #12, #13):** `AllowedBinary` limita el binario pero no el subcomando, así que `git pull` pasaría el control. Además, lanzar `git` o `pnpm` dentro de un repositorio no confiable puede ejecutar código que ese repositorio define (`core.fsmonitor`, `.npmrc`). `intent: "read"` es una etiqueta de tipo y no impone nada por sí sola.

Ejemplo válido:

```ts
commandRunner.run({
  binary: "git",
  args: ["remote", "get-url", "origin"],
  cwd: repositoryPath,
  intent: "read"
});
```

---

## 8. HTTP

Todos los requests pasan por `HttpClient`.

Responsabilidades:

- allowlist opcional de hosts;
- timeout;
- user-agent;
- retries limitados;
- rate-limit handling;
- JSON validation;
- requests condicionales para revalidar la caché;
- concurrencia limitada;
- enviar el token de GitHub solo a `api.github.com` (§14);
- cancellation.

Ejemplos de hosts permitidos inicialmente:

```text
api.github.com
registry.npmjs.org
```

No deben enviarse rutas locales ni contenido innecesario del proyecto.

---

## 9. Filesystem

Toda interacción con archivos pasa por una abstracción.

Ejemplo:

```ts
interface Filesystem {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  readDir(path: string): Promise<DirEntry[]>;
  realpath(path: string): Promise<string>;
}
```

Esto permite:

- tests sin disco real;
- validación de paths;
- control de traversal;
- futura portabilidad.

---

## 10. Estructura propuesta

```text
src/
├─ cli/
│  ├─ commands/
│  ├─ formatters/
│  └─ index.ts
│
├─ application/
│  ├─ status/
│  └─ explain/
│
├─ core/
│  ├─ inventory/
│  ├─ evidence/
│  ├─ confidence/
│  ├─ versions/
│  └─ errors/
│
├─ scanners/
│  ├─ project/
│  ├─ filesystem/
│  ├─ path/
│  └─ git/
│
├─ providers/
│  ├─ pnpm/
│  ├─ npm-registry/
│  ├─ git/
│  └─ github/
│
├─ infrastructure/
│  ├─ filesystem/
│  ├─ command-runner/
│  ├─ http/
│  ├─ cache/
│  └─ config/
│
└─ security/
   ├─ policies/
   ├─ validation/
   └─ architecture/
```

---

## 11. Dependencias internas

Regla:

```text
cli
 ↓
application
 ↓
core
 ↑
providers
 ↑
infrastructure adapters
```

El core nunca depende de infraestructura.

Providers pueden depender de interfaces del core y puertos de infraestructura, pero no de implementaciones concretas.

---

## 12. Reglas arquitectónicas

### RA-001
Solo `infrastructure/command-runner` puede importar `node:child_process`.

### RA-002
Solo `infrastructure/filesystem` puede importar `node:fs`.

### RA-003
Solo `infrastructure/http` puede usar APIs de red.

### RA-004
`core/` no depende de CLI ni infraestructura.

### RA-005
Providers no imprimen output.

### RA-006
CLI no implementa detección.

### RA-007
Ningún provider ejecuta comandos de escritura.

### RA-008
Toda inferencia relevante produce evidencia.

### RA-009
Los fallos de un provider no deben derribar todo el scan salvo error crítico.

### RA-010
Solo `infrastructure/cache` escribe en disco, y solo dentro del directorio de caché.

---

## 13. Error handling

Errores se clasifican.

```text
Recoverable
- network unavailable
- permission denied
- unsupported metadata
- unknown version

Fatal
- corrupted internal config
- invalid application state
- programmer invariant violation
```

El usuario debe recibir mensajes útiles sin stack traces por defecto.

Modo debug puede exponer información técnica.

---

## 14. Cache

La caché es parte del MVP. Sin ella, el resolver de GitHub se queda sin cuota en la primera ejecución de cualquier usuario con más de unos pocos repositorios: `api.github.com` sin autenticación permite 60 requests por hora. Un proyecto con decenas de dependencias genera la misma cantidad de requests al npm registry.

### Qué guarda

- Solo metadata pública: última versión estable, tags, releases y el campo `repository` de npm.
- La clave es el host más el recurso consultado, por ejemplo `registry.npmjs.org/gstack/latest`.
- Cada entrada guarda la fecha de obtención y los validadores que haya devuelto el servidor (`ETag` o `Last-Modified`).
- Nunca guarda tokens, rutas locales, nombres de proyectos ni resultados del inventario local.

### Dónde

| Sistema | Ruta |
|---|---|
| Linux | `$XDG_CACHE_HOME/actually`, o `~/.cache/actually` si no está definida |
| macOS | `~/Library/Caches/actually` |
| Windows | `%LOCALAPPDATA%\actually\cache` |

Borrar ese directorio es siempre seguro.

### Reglas

- El TTL por defecto es de 6 horas y se configura con `[cache] ttl` (design.md §13).
- Una entrada vencida se revalida con un request condicional (`If-None-Match` o `If-Modified-Since`). En GitHub, una respuesta 304 a un request condicional no consume cuota.
- `--no-cache` no lee ni escribe la caché en esa ejecución. `[cache] enabled = false` la desactiva siempre.
- Si la red falla y existe una entrada vencida, puede usarse solo como evidencia explícita (`valor en caché del <fecha>; red no disponible`) y con confianza máxima `medium`. Nunca se presenta como dato fresco.
- La caché nunca guarda el inventario local. La máquina se inspecciona de nuevo en cada ejecución.

### GitHub

- Si `GITHUB_TOKEN` o `GH_TOKEN` están definidos en el entorno, se envían solo a `api.github.com` y solo para ampliar el límite de requests. No se guardan en la caché, la configuración ni los logs.
- `[network] github_token = false` desactiva ese uso.
- Tener un token no convierte el acceso a repositorios privados en una funcionalidad soportada del MVP.
- Si GitHub responde que el límite se agotó, no se hacen más requests a GitHub en esa ejecución. Los datos pendientes quedan `unknown` con ese motivo.

### npm registry

- Se consulta `/<paquete>/latest`, que devuelve solo el manifiesto de la versión estable, con su campo `repository`. El documento completo del paquete puede pesar decenas de megabytes; el manifiesto, unos pocos kilobytes.
- Concurrencia máxima por defecto: 8 requests simultáneos. Timeout por request: 10 segundos.

---

## 15. Extensibilidad

Un nuevo provider debe implementar un contrato estable.

Ejemplo conceptual:

```ts
export interface Provider {
  readonly id: string;

  detect(
    context: DetectionContext
  ): Promise<DetectionResult[]>;

  resolveLatestVersion?(
    target: VersionTarget
  ): Promise<VersionResult | null>;
}
```

No todos los providers necesitan implementar todas las capacidades.

---

## 16. Architecture tests

El repositorio debe comprobar automáticamente reglas críticas.

Ejemplos:

```text
providers must not import node:child_process
core must not import node:fs
core must not use fetch
cli must not import infrastructure implementations directly
```

Estas reglas deben ejecutarse en CI.

---

## 17. ADRs iniciales

```text
0001-use-typescript.md
0002-use-pnpm.md
0003-read-only-mvp.md
0004-no-backend.md
0005-command-runner-boundary.md
0006-evidence-driven-detection.md
0007-json-as-public-interface.md
0008-scoped-package-name.md
```

---

## 18. Evolución futura

La arquitectura debe permitir agregar:

```text
Cargo
pipx
uv
mise
Homebrew
winget
Scoop
Go tooling
Docker
```

sin cambiar el modelo fundamental.

También debe permitir consumidores externos:

```text
VS Code
JetBrains
Neovim
Zed
Raycast
```

El core debe seguir siendo independiente de esas interfaces.
