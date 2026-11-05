const fs = require('fs');
let code = fs.readFileSync('src/components/CADCanvas.tsx', 'utf8');

const target = "isBetter = dist < minDistance;";
const replacement = "isBetter = dist <= minDistance;";

code = code.replace(target, replacement);

fs.writeFileSync('src/components/CADCanvas.tsx', code);
