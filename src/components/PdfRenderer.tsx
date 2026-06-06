import React, { useState, useMemo, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// React-PDF requires a worker. We use the recommended unpkg CDN based on the installed version.
// Using .mjs for pdfjs-dist 4+
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfRendererProps {
  dataUri: string;
  width: number;
  height: number;
  className?: string;
}

export const PdfRenderer: React.FC<PdfRendererProps> = ({ dataUri, width, height, className }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error("PDF Load Error:", error);
    setError(error.message || "Errore durante il caricamento del PDF.");
  };

  const pdfData = useMemo(() => {
    if (!dataUri.startsWith('data:')) return dataUri;
    try {
      const parts = dataUri.split(',');
      if (parts.length !== 2) return dataUri;
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return { data: u8arr };
    } catch (e) {
      return dataUri;
    }
  }, [dataUri]);

  return (
    <div className={`relative flex flex-col bg-white border border-neutral-200 shadow-sm overflow-hidden ${className || ''}`} style={{ width, height }}>
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-red-50 p-4 text-center z-10">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
           <span className="text-xs font-bold leading-tight break-all">{error}</span>
        </div>
      )}
      
      <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center" onWheel={(e) => e.stopPropagation()}>
        <Document 
          file={pdfData} 
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<div className="animate-pulse text-neutral-400 font-semibold text-xs">Apertura PDF in corso...</div>}
          className="flex justify-center"
        >
          <Page 
             pageNumber={pageNumber} 
             renderTextLayer={false} 
             renderAnnotationLayer={false}
             width={width - 2} // Slightly smaller to account for borders
             className="shadow-sm"
          />
        </Document>
      </div>

      {numPages && numPages > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/80 backdrop-blur text-white px-3 py-1.5 rounded-full shadow-lg"
             onPointerDown={(e) => e.stopPropagation()}
             onClick={(e) => e.stopPropagation()}
             onWheel={(e) => e.stopPropagation()}>
           <button 
             disabled={pageNumber <= 1}
             onClick={() => setPageNumber(prev => Math.max(1, prev - 1))}
             className="w-6 h-6 flex items-center justify-center hover:bg-white/20 rounded-full disabled:opacity-30 transition-colors"
           >
             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
           </button>
           <span className="text-[10px] font-bold font-mono tracking-widest">{pageNumber} / {numPages}</span>
           <button 
             disabled={pageNumber >= numPages}
             onClick={() => setPageNumber(prev => Math.min(numPages, prev + 1))}
             className="w-6 h-6 flex items-center justify-center hover:bg-white/20 rounded-full disabled:opacity-30 transition-colors"
           >
             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
           </button>
        </div>
      )}
    </div>
  );
};
