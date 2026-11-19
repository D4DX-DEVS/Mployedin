/**
 * How long the object URL lives after the click. Revoking it while the browser
 * is still starting the download can cancel the download in some browsers.
 */
export const SAVE_BLOB_REVOKE_DELAY_MS = 30_000;

/**
 * Ask the browser to save a file the page just made (a Blob) under `fileName`.
 * Client only. The link goes into the page for the click and comes out after:
 * some browsers ignore a click on a link that is not in the document. The
 * object URL is freed a while after the click, not during it.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), SAVE_BLOB_REVOKE_DELAY_MS);
}
