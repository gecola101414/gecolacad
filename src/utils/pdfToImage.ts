import * as pdfjsLib from 'pdfjs-dist';

// Configure worker to use the same version of pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export async function renderPdfToImage(file: File): Promise<{ src: string; isSinglePage: boolean } | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Load the PDF.
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;

    const isSinglePage = pdf.numPages === 1;

    // Get the first page.
    const page = await pdf.getPage(1);
    
    // Set scale for good resolution
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };

    // @ts-ignore
    await page.render(renderContext).promise;
    
    return {
      src: canvas.toDataURL('image/png'),
      isSinglePage
    };
  } catch (error) {
    console.error("Error rendering PDF to image:", error);
    return null;
  }
}
