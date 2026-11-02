# Assets

A arte do escritório (pisos, paredes de vidro, móveis, robôs, efeitos) é **original e procedural**:
desenhada em tempo de execução com `PixiJS Graphics` em `apps/web/src/components/office/` (`draw.ts`, `robot.tsx`, `effects.tsx`),
a partir das paletas de `packages/office-engine/src/palette.ts`. Isso mantém o estado visual 100% derivado de dados
e evita licenças de terceiros.

- `avatars/robot.svg` — avatar de referência usado nos painéis HTML (mesmas cores do canvas).
- `sprites/`, `rooms/`, `icons/` — reservados para assets raster futuros (ex.: sprite sheets por estado).
