const fs = require('fs');

const path = 'src/components/BIMDialogs.tsx';
let src = fs.readFileSync(path, 'utf8');

// Add max-h-[85vh] flex flex-col to dialog wrappers
src = src.replace(/className="fixed z-\[(100|200)\]([^"]+)max-w-sm([^"]*)"/g, (match, zIndex, middle, end) => {
    return `className="fixed z-[${zIndex}]${middle}max-w-sm${end} max-h-[85vh] flex flex-col"`;
});

// Add shrink-0 to headers
src = src.replace(/className="flex justify-between items-center border-b border-slate-800 pb-3 mb-[34] cursor-grab active:cursor-grabbing"/g, 
    'className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3 cursor-grab active:cursor-grabbing shrink-0"');

// Add overflow-y-auto to form or content wrappers
src = src.replace(/<form onSubmit={handleSubmit} className="space-y-4">/g, 
    '<form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-2 pb-2">');

src = src.replace(/<div className="space-y-3">/g, 
    '<div className="space-y-3 overflow-y-auto pr-2 pb-2">');

src = src.replace(/<div className="space-y-2">/g, 
    '<div className="space-y-2 overflow-y-auto pr-2 pb-2">');

fs.writeFileSync(path, src);
console.log("Updated BIMDialogs.tsx");
