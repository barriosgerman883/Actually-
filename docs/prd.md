# actually? — Product Requirements Document

## 1. Resumen

`actually?` es una herramienta CLI, local-first y open source para inventariar y comparar herramientas, repositorios y dependencias relevantes de un entorno de desarrollo.

Su objetivo no es reemplazar package managers ni gestores de versiones.

Su función principal es ofrecer una visión unificada, segura y explicable del estado del entorno.

---

## 2. Problema

Los desarrolladores suelen trabajar con combinaciones de:

- herramientas globales;
- package managers;
- runtimes;
- CLIs;
- repositorios clonados;
- proyectos con versiones distintas;
- dependencias declaradas y resueltas;
- herramientas instaladas con mecanismos diferentes.

Con el tiempo aparecen preguntas como:

- ¿Qué versión tengo?
- ¿Cuál es la última versión estable?
- ¿Cómo llegó esta herramienta a mi máquina?
- ¿Está asociada a pnpm, npm, Git o algún otro sistema?
- ¿Es global o específica del proyecto?
- ¿Qué evidencia existe para afirmar eso?
- ¿Qué está desactualizado?

Hoy estas respuestas suelen estar dispersas entre múltiples comandos, registries, lockfiles y convenciones.

---

## 3. Objetivo del producto

Proveer una capa de observación unificada sobre el entorno de desarrollo.

La propuesta de valor es:

> saber qué existe, qué versión tiene, de dónde parece provenir y qué tan actual está, sin modificar el sistema.

---

## 4. Objetivos

### O1 — Inventario local
Detectar herramientas, repositorios y dependencias relevantes.

### O2 — Comparación de versiones
Comparar versión instalada contra última versión estable conocida.

### O3 — Proveniencia
Determinar, cuando sea posible, qué provider administra una herramienta.

### O4 — Explicabilidad
Permitir consultar la evidencia utilizada para cada conclusión.

### O5 — Seguridad
Mantener comportamiento read-only por defecto.

### O6 — Extensibilidad
Permitir agregar scanners y providers sin modificar el core.

### O7 — Automatización futura
Ofrecer JSON estable para IDEs, scripts y herramientas externas.

---

## 5. No objetivos

El producto no busca inicialmente:

- ser un package manager;
- reemplazar pnpm, npm, Cargo, pip o mise;
- actualizar automáticamente el sistema;
- instalar software;
- administrar cuentas;
- almacenar inventarios en la nube;
- sincronizar dispositivos;
- resolver vulnerabilidades automáticamente;
- convertirse en un daemon permanente.

---

## 6. Personas

### P1 — Developer multiproyecto
Trabaja con varios repositorios y herramientas globales.

Necesidad:
tener visibilidad rápida del estado de su entorno.

### P2 — Power user
Usa múltiples CLIs y package managers.

Necesidad:
entender qué controla cada herramienta y detectar inconsistencias.

### P3 — Maintainer
Mantiene proyectos open source y tooling.

Necesidad:
auditar cómo se detectan versiones y de dónde provienen los datos.

### P4 — Integrador
Quiere consumir la información desde una extensión de IDE o script.

Necesidad:
salida JSON estable y predecible.

---

## 7. Historias de usuario

### HU1
Como developer,
quiero ejecutar `actually status`,
para ver rápidamente qué herramientas están desactualizadas.

### HU2
Como usuario,
quiero ejecutar `actually explain <tool>`,
para entender por qué `actually?` cree que una herramienta pertenece a cierto provider.

### HU3
Como developer,
quiero ejecutar `actually status --project`,
para inspeccionar únicamente el proyecto actual.

### HU4
Como power user,
quiero definir directorios de escaneo,
para evitar que la herramienta recorra todo mi disco.

### HU5
Como integrador,
quiero usar `--json`,
para consumir los resultados desde otra herramienta.

### HU6
Como usuario preocupado por privacidad,
quiero saber exactamente qué sale de mi máquina y poder evitarlo,
para decidir qué comparto con npm y GitHub.

El análisis ocurre localmente y `actually?` no tiene servidor. Pero consultar la última versión de un paquete o repositorio le revela su nombre al servicio consultado (architecture.md §8).

---

## 8. Requisitos funcionales

### RF-001 — Status general
El sistema debe mostrar herramientas conocidas y su estado.

### RF-002 — Scope
Debe diferenciar al menos:

```text
global
project
```

### RF-003 — Versiones
Debe distinguir entre:

```text
requested
resolved
installed
latest
```

cuando esos conceptos apliquen. Cuando no aplican, se informa como `not-applicable` (architecture.md §5).

### RF-004 — Providers
Debe soportar arquitectura extensible para:

- installation providers;
- source providers;
- version providers.

### RF-005 — Evidence
Toda inferencia debe poder adjuntar evidencia.

### RF-006 — Confidence
Las conclusiones inferidas deben tener un nivel de confianza.

### RF-007 — Explain
Debe existir un mecanismo para inspeccionar evidencia.

### RF-008 — JSON
Las funciones principales deben ofrecer serialización estable.

### RF-009 — Configuración
El usuario debe poder controlar rutas de escaneo.

### RF-010 — Graceful degradation
La ausencia de red o permisos no debe causar fallos destructivos ni resultados falsos.

---

## 9. Requisitos no funcionales

### RNF-001 — Seguridad
Read-only en MVP. Las únicas escrituras son la caché de respuestas y el estado local de `actually?`, fuera de los proyectos del usuario.

### RNF-002 — Privacidad
Sin telemetría obligatoria.

Transparencia de red: antes de la primera consulta, el usuario sabe qué se envía y a quién, y puede trabajar sin red (architecture.md §8, design.md §12).

### RNF-003 — Performance
No recorrer todo el filesystem por defecto.

### RNF-004 — Portabilidad
La arquitectura debe permitir soporte progresivo para Windows, macOS y Linux. El lanzamiento 0.1.0 soporta Linux; macOS queda diferido hasta validar el paquete en esa plataforma. En Windows, pnpm es un shim `.cmd` que no se puede ejecutar sin shell, así que su soporte queda para después del MVP.

### RNF-005 — Testabilidad
Filesystem, procesos y red deben estar abstraídos.

### RNF-006 — Documentación
Las decisiones relevantes deben documentarse.

### RNF-007 — Extensibilidad
Agregar un provider no debe requerir cambios importantes en core.

### RNF-008 — Auditabilidad
Debe ser posible determinar qué comandos, archivos y endpoints utiliza cada provider.

---

## 10. Experiencia CLI

Comandos principales del MVP:

```bash
actually status
actually status <tool>
actually explain <tool>
actually status --json
```

El formato exacto de cada salida se define en un solo lugar para que no diverja entre documentos:

- salida de `status`: design.md §5;
- salida de `status <tool>`: design.md §8;
- salida de `explain`: design.md §9;
- contrato JSON: design.md §14.

---

## 11. Métricas iniciales

No se requiere telemetría del producto.

Las métricas de proyecto pueden obtenerse externamente mediante:

- installs del paquete;
- GitHub stars;
- issues;
- pull requests;
- contributors;
- releases;
- feedback manual.

El producto no necesita rastrear usuarios individuales.

---

## 12. Riesgos

### Riesgo 1 — Detección incorrecta
Mitigación:
evidence + confidence + `unknown`.

### Riesgo 2 — Scope demasiado amplio
Mitigación:
MVP limitado a pocos providers.

### Riesgo 3 — Ejecución insegura
Mitigación:
CommandRunner, allowlists y tests arquitectónicos.

### Riesgo 4 — Escaneo lento
Mitigación:
directorios explícitos y profundidad controlada.

### Riesgo 5 — Dependencia de APIs externas
Mitigación:
timeouts, caché local con vencimiento y requests condicionales (architecture.md §14), y degradación elegante.

### Riesgo 6 — Crecimiento desordenado
Mitigación:
contratos de providers, ADRs y requisitos de contribución.

---

## 13. Fases

### Fase 0 — Foundation

- estructura;
- pnpm;
- TypeScript;
- CLI base;
- config;
- abstractions;
- guardrails;
- CI;
- docs.

### v0.1 — Primera versión refutable

> **Absorbida por el MVP.** Iba a ser una versión reducida, solo `status --global` con pnpm y el npm registry más `explain`, `--json` y `--offline`, publicada antes del MVP para contrastar el diseño con máquinas reales. Se decidió implementar el MVP completo sin publicarla: la primera versión, `0.1.0`, incluye todo lo de la Fase 1. El criterio de éxito sigue vigente: alguien la ejecuta sobre su máquina real y cada resultado incorrecto se puede reportar con la salida de `explain`.

### Fase 1 — MVP

- pnpm provider;
- Git provider;
- GitHub version resolver;
- npm registry version resolver;
- caché local de metadata;
- project scanner;
- global scanner;
- status;
- explain;
- JSON.

### Fase 2 — Ecosistema

Posibles providers:

- npm CLI (paquetes globales);
- mise;
- pipx;
- uv;
- Cargo;
- Homebrew;
- winget;
- Scoop.

### Fase 3 — Integraciones

Posibles consumidores:

- VS Code;
- JetBrains;
- Zed;
- Neovim;
- Raycast.

Estas integraciones deben consumir el core o salida estructurada, no duplicar lógica.

---

## 14. Criterios de aceptación del MVP

El MVP puede considerarse completo cuando:

1. se instala con pnpm como `@actually-cli/cli` y expone el comando `actually`;
2. funciona sin backend;
3. puede inspeccionar entorno global y proyecto;
4. identifica pnpm y Git correctamente en escenarios soportados;
5. puede resolver versiones estables desde fuentes públicas;
6. soporta salida humana y JSON;
7. puede explicar evidencia;
8. no ejecuta operaciones destructivas;
9. pasa tests de arquitectura y seguridad;
10. toda funcionalidad central tiene documentación.
