async function loadRuntime() {
  if (typeof globalThis.Go === "function") return
  if (typeof document === "undefined") throw new Error("wasm_exec.js must be loaded in a browser")
  await new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = new URL("./wasm_exec.js", import.meta.url)
    script.onload = resolve
    script.onerror = () => reject(new Error("failed to load wasm_exec.js"))
    document.head.appendChild(script)
  })
}

export async function loadLunex(wasmURL = new URL("./lunex-js.wasm", import.meta.url)) {
  await loadRuntime()
  const response = await fetch(wasmURL)
  if (!response.ok) throw new Error(`failed to load Lunex WebAssembly: ${response.status}`)
  const bytes = await response.arrayBuffer()
  const go = new globalThis.Go()
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject)
  const running = go.run(instance)
  running.catch(error => {
    globalThis.LunexWasmError = error
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  if (!globalThis.Lunex || typeof globalThis.Lunex.run !== "function") {
    throw new Error("Lunex WebAssembly failed to initialize")
  }
  return globalThis.Lunex
}
