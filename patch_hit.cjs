const fs = require('fs');
let code = fs.readFileSync('src/components/CADCanvas.tsx', 'utf8');

code = code.replace(
    "if (hit) {\n        if (dist < minDistance) {\n          minDistance = dist;\n          bestEntity = ent;\n        }\n      }",
    "if (hit) {\n        if (activeTool === 'Dimension') {\n            const isCurrentDim = ent.type === 'dimension';\n            const isBestDim = bestEntity?.type === 'dimension';\n            if (isCurrentDim && !isBestDim) {\n                minDistance = dist;\n                bestEntity = ent;\n                continue;\n            } else if (!isCurrentDim && isBestDim) {\n                continue;\n            }\n        }\n        if (dist < minDistance) {\n          minDistance = dist;\n          bestEntity = ent;\n        }\n      }"
);

fs.writeFileSync('src/components/CADCanvas.tsx', code);
