// Minimal Chrome DevTools Protocol driver: launches headless Chrome, evaluates JS in the page, takes screenshots.
// Used by the scripts/e2e/*.mjs sim runs (dev server on :5178, `?sim` mode). No dependencies.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export async function launch(port = 9333) {
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${process.env.DANCE_E2E_PROFILE ?? "/tmp/dance-e2e-profile"}`,
      "--window-size=1400,900",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
      "--no-first-run",
      // e.g. DANCE_CHROME_FLAGS="--use-fake-device-for-media-stream --use-fake-ui-for-media-stream" for a fake camera
      ...(process.env.DANCE_CHROME_FLAGS ? process.env.DANCE_CHROME_FLAGS.split(" ") : []),
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let targets = [];
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets.some((t) => t.type === "page")) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    } else if (d.method === "Runtime.consoleAPICalled") logs.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
    else if (d.method === "Runtime.exceptionThrown") logs.push("EXC " + JSON.stringify(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text));
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  return {
    logs,
    async goto(url) {
      await send("Page.navigate", { url });
      await new Promise((r) => setTimeout(r, 1500));
    },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
      if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails));
      return r.result.result.value;
    },
    async shot(file) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(file, Buffer.from(r.result.data, "base64"));
    },
    close() {
      ws.close();
      proc.kill();
    },
  };
}
