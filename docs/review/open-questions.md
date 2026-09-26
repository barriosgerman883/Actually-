# Decisiones abiertas antes de Fase 0

Cada punto remite a la sección correspondiente de `2026-09-cross-review.md`. La recomendación es la del análisis; la decisión es del owner.

| # | Decisión | Recomendación | Ref |
|---|---|---|---|
| 1 | Un solo modelo de dominio: ¿MVP §7 o Architecture §5? | Architecture §5, con el JSON declarado como proyección | §1.1 |
| 2 | Enum de `status` en el JSON | `current \| outdated-major \| outdated-minor \| outdated-patch \| ahead \| unknown \| error` | §1.2 |
| 3 | Soporte de `requested / resolved / installed / latest` en el modelo | Sí, como campos opcionales tipados con estado | §1.3, D2 |
| 4 | `doctor`, `init`, `scan`: ¿cuáles entran al MVP? | `status`, `explain`, `--json`. `init` si hay config obligatoria. `doctor` y `scan` fuera hasta que se definan | §1.4 |
| 5 | npm registry en Fase 1, npm CLI en Fase 2 | Sí, con nombres distintos en código y docs | §1.5 |
| 6 | Confianza por claim o por tool | Por claim | D1 |
| 7 | Representación de `unknown` | Tipo discriminado con `state` | D2 |
| 8 | Repo Git: proyecto por defecto, tool por evidencia o config | Sí | D3 |
| 9 | Formato de `id` | `scope:ubicación:nombre` | D4 |
| 10 | Caché en el MVP | Sí, con TTL y `--no-cache` | D5 |
| 11 | `GITHUB_TOKEN` para rate limit | Sí, documentado como no-acceso-a-privados | D5 |
| 12 | Leer `.git/*` directo en vez de spawnear git | Sí | D6 |
| 13 | Allowlist por (binario, subcomando) | Sí | D6 |
| 14 | Directorios de PATH escaneados | Solo user-level + config | D7 |
| 15 | Exit codes | `0` ok, `1` updates disponibles, `2` errores de scan, `3` uso inválido | §3 |
| 16 | Nombre del paquete npm | Scope u otro nombre | §4 |
| 17 | Idioma de los docs | Inglés si el proyecto busca contribuidores externos | §5 |
| 18 | ¿`info` sobrevive como comando separado? | Fusionar en `status <tool>` | §5 |
