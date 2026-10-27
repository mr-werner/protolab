// Promise wrapper around the CAD worker. Requests run one at a time, in order.
let worker;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.reqId);
      if (!p) return;
      pending.delete(data.reqId);
      data.ok ? p.resolve(data.result) : p.reject(new Error(data.error));
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || "The 3D engine stopped."));
      pending.clear();
    };
  }
  return worker;
}

export function cad(kind, payload = {}, transfer = []) {
  const reqId = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject });
    getWorker().postMessage({ reqId, kind, payload }, transfer);
  });
}
