export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(filename: string, text: string, type = 'text/plain') {
  downloadBlob(filename, new Blob([type === 'text/csv' ? '﻿' + text : text], { type: `${type};charset=utf-8` }));
}

export function readFileText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result ?? ''));
    r.onerror = () => rej(new Error('Could not read the file.'));
    r.readAsText(file);
  });
}
