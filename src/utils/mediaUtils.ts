export const getRenderableMediaSrc = (dataUri: string): string => {
  if (!dataUri.startsWith('data:')) return dataUri;
  
  // Data URIs can be very long. To avoid performance hits if called every render,
  // we could memoize, but for now we just parse.
  try {
    const parts = dataUri.split(',');
    if (parts.length !== 2) return dataUri;
    const mimeStr = parts[0].split(':')[1].split(';')[0];
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mimeStr });
    return URL.createObjectURL(blob);
  } catch (e) {
    return dataUri;
  }
};
