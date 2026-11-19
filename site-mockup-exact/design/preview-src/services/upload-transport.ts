/** Preview-only XHR adapter. Uploads use the existing in-memory API fixtures. */
export function installUploadTransport() {
 class PreviewUploadRequest extends EventTarget {
  upload = new EventTarget();
  status = 0;
  responseText = "";
  readyState = 0;
  private method = "POST";
  private url = "";
  private headers: Record<string, string> = {};
  private aborted = false;
  open(method: string, url: string) {
   if (!url.startsWith("/api/")) throw new Error("Preview uploads are restricted to the simulated API.");
   this.method = method; this.url = url; this.readyState = 1;
  }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  abort() { this.aborted = true; this.readyState = 0; this.dispatchEvent(new Event("abort")); }
  send(body: FormData) {
   void (async () => {
    try {
     const total = [...body.values()].reduce((sum, value) => sum + (value instanceof File ? value.size : 0), 0);
     this.upload.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: total, total }));
     const response = await fetch(this.url, { method: this.method, headers: this.headers, body });
     const text = await response.text();
     if (this.aborted) return;
     this.status = response.status; this.responseText = text; this.readyState = 4;
     this.dispatchEvent(new Event("load"));
    } catch { if (!this.aborted) this.dispatchEvent(new Event("error")); }
   })();
  }
 }
 globalThis.XMLHttpRequest = PreviewUploadRequest as unknown as typeof XMLHttpRequest;
}
