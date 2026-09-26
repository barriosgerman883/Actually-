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
sourceProvider: GitHub
installProvider: pnpm
updateProvider: pnpm
```

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
Abstracción opcional para expiración y caching.

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

```ts
export interface ToolRecord {
  id: string;
  name: string;

  scope: ToolScope;

  installedVersion?: string;
  latestVersion?: string;

  source?: ToolSource;
  installation?: Installation;
  update?: UpdateStrategy;

  evidence: Evidence[];
  confidence: ConfidenceLevel;
}
```

### Evidence

```ts
export interface Evidence {
  kind: string;
  source: string;
  description: string;
  weight: number;
}
```

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

---

## 6. Confidence model

El sistema no debe esconder inferencias.

Ejemplo conceptual:

```text
Evidence A: package listed by pnpm
weight 0.45

Evidence B: binary path belongs to pnpm global bin
weight 0.35

Evidence C: package metadata matches executable
weight 0.20
```

El algoritmo concreto puede evolucionar.

Para el MVP se recomienda un modelo simple y documentado.

Salida:

```text
low
medium
high
```

No deben usarse porcentajes visibles al usuario si implican una precisión inexistente.

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
│  ├─ scan/
│  ├─ info/
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

No es requisito del MVP inicial.

Si se introduce:

- debe ser local;
- descartable;
- no contener secretos;
- tener TTL;
- nunca ser fuente exclusiva de verdad;
- poder deshabilitarse.

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
