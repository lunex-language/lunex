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

const virtualFileSystem = {
  files: new Map(),
  directories: new Set(["/"]),
  descriptors: new Map(),
  cwd: "/__lunex_wasm__/workspace",
  nextDescriptor: 3,
  outputBuffer: "",
  installed: false
}

const virtualEncoder = new TextEncoder()
const virtualDecoder = new TextDecoder()

function normalizeVirtualPath(value) {
  const raw = String(value || "")
  const combined = raw.startsWith("/") ? raw : `${virtualFileSystem.cwd}/${raw}`
  const parts = []
  for (const part of combined.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue
    if (part === "..") parts.pop()
    else parts.push(part)
  }
  return `/${parts.join("/")}`
}

function addVirtualDirectory(directory) {
  let current = normalizeVirtualPath(directory)
  while (current !== "/") {
    virtualFileSystem.directories.add(current)
    const slash = current.lastIndexOf("/")
    current = slash > 0 ? current.slice(0, slash) : "/"
  }
  virtualFileSystem.directories.add("/")
}

function virtualError(code, message) {
  const error = new Error(message || code)
  error.code = code
  return error
}

function virtualStat(filename) {
  const key = normalizeVirtualPath(filename)
  const directory = virtualFileSystem.directories.has(key)
  const data = virtualFileSystem.files.get(key)
  if (!directory && !data) throw virtualError("ENOENT", `No such file or directory: ${key}`)
  const size = directory ? 0 : data.length
  const mode = directory ? 0o040755 : 0o100644
  const timestamp = Date.now()
  return {
    dev: 1,
    ino: 1,
    mode,
    nlink: 1,
    uid: 0,
    gid: 0,
    rdev: 0,
    size,
    blksize: 4096,
    blocks: Math.ceil(size / 512),
    atimeMs: timestamp,
    mtimeMs: timestamp,
    ctimeMs: timestamp,
    isDirectory: () => directory,
    isFile: () => !directory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false
  }
}

function virtualDirectoryEntries(directory) {
  const base = normalizeVirtualPath(directory)
  const prefix = base === "/" ? "/" : `${base}/`
  const entries = new Set()
  for (const name of virtualFileSystem.directories) {
    if (!name.startsWith(prefix) || name === base) continue
    const rest = name.slice(prefix.length)
    if (rest && !rest.includes("/")) entries.add(rest)
  }
  for (const name of virtualFileSystem.files.keys()) {
    if (!name.startsWith(prefix)) continue
    const rest = name.slice(prefix.length)
    if (rest && !rest.includes("/")) entries.add(rest)
  }
  return [...entries]
}

function installVirtualFileSystem() {
  if (virtualFileSystem.installed || typeof document === "undefined") return
  if (!globalThis.fs) {
    const descriptors = virtualFileSystem.descriptors
    const constants = {
      O_WRONLY: 1,
      O_RDWR: 2,
      O_CREAT: 64,
      O_EXCL: 128,
      O_TRUNC: 512,
      O_APPEND: 1024,
      O_DIRECTORY: 65536
    }

    const callbackResult = (callback, error, value) => callback(error, value)
    const appendOutput = (value) => {
      virtualFileSystem.outputBuffer += value
      let newline = virtualFileSystem.outputBuffer.indexOf("\n")
      while (newline !== -1) {
        console.log(virtualFileSystem.outputBuffer.slice(0, newline))
        virtualFileSystem.outputBuffer = virtualFileSystem.outputBuffer.slice(newline + 1)
        newline = virtualFileSystem.outputBuffer.indexOf("\n")
      }
    }
    const statForDescriptor = (descriptor) => {
      if (descriptor.path === "<stdout>" || descriptor.path === "<stderr>") {
        const timestamp = Date.now()
        return {
          dev: 1, ino: 1, mode: 0o020666, nlink: 1, uid: 0, gid: 0,
          rdev: 0, size: 0, blksize: 4096, blocks: 0,
          atimeMs: timestamp, mtimeMs: timestamp, ctimeMs: timestamp,
          isDirectory: () => false
        }
      }
      return virtualStat(descriptor.path)
    }

    globalThis.fs = {
      constants,
      writeSync(fd, buffer) {
        const value = virtualDecoder.decode(buffer)
        appendOutput(value)
        return buffer.length
      },
      open(filename, flags, mode, callback) {
        const key = normalizeVirtualPath(filename)
        const isDirectory = virtualFileSystem.directories.has(key)
        let data = virtualFileSystem.files.get(key)
        if (!data && !isDirectory && (flags & constants.O_CREAT)) {
          data = new Uint8Array()
          virtualFileSystem.files.set(key, data)
          addVirtualDirectory(key.slice(0, key.lastIndexOf("/")))
        }
        if (!data && !isDirectory) {
          callbackResult(callback, virtualError("ENOENT", `No such file or directory: ${key}`))
          return
        }
        if (isDirectory && (flags & (constants.O_WRONLY | constants.O_RDWR))) {
          callbackResult(callback, virtualError("EISDIR", `Is a directory: ${key}`))
          return
        }
        if (data && (flags & constants.O_TRUNC)) {
          data = new Uint8Array()
          virtualFileSystem.files.set(key, data)
        }
        const fd = virtualFileSystem.nextDescriptor++
        descriptors.set(fd, { path: key, position: 0, data, isDirectory })
        callbackResult(callback, null, fd)
      },
      close(fd, callback) {
        const number = Number(fd)
        if (number < 3) {
          callbackResult(callback, null)
          return
        }
        if (!descriptors.has(number)) {
          callbackResult(callback, virtualError("EBADF", `Bad file descriptor: ${number}`))
          return
        }
        descriptors.delete(number)
        callbackResult(callback, null)
      },
      stat(filename, callback) {
        try {
          callbackResult(callback, null, virtualStat(filename))
        } catch (error) {
          callbackResult(callback, error)
        }
      },
      lstat(filename, callback) {
        try {
          callbackResult(callback, null, virtualStat(filename))
        } catch (error) {
          callbackResult(callback, error)
        }
      },
      fstat(fd, callback) {
        const descriptor = descriptors.get(Number(fd))
        if (!descriptor) {
          callbackResult(callback, virtualError("EBADF", `Bad file descriptor: ${fd}`))
          return
        }
        try {
          callbackResult(callback, null, statForDescriptor(descriptor))
        } catch (error) {
          callbackResult(callback, error)
        }
      },
      readdir(directory, callback) {
        try {
          const key = normalizeVirtualPath(directory)
          if (!virtualFileSystem.directories.has(key)) throw virtualError("ENOTDIR", `Not a directory: ${key}`)
          callbackResult(callback, null, virtualDirectoryEntries(key))
        } catch (error) {
          callbackResult(callback, error)
        }
      },
      read(fd, buffer, offset, length, position, callback) {
        const descriptor = descriptors.get(Number(fd))
        if (!descriptor) {
          callbackResult(callback, virtualError("EBADF", `Bad file descriptor: ${fd}`))
          return
        }
        if (!descriptor.data) {
          callbackResult(callback, virtualError("EISDIR", `Cannot read directory: ${descriptor.path}`))
          return
        }
        const start = position === null || position === undefined ? descriptor.position : Number(position)
        const end = Math.min(start + Number(length), descriptor.data.length)
        const count = Math.max(0, end - start)
        buffer.set(descriptor.data.subarray(start, end), Number(offset))
        if (position === null || position === undefined) descriptor.position = end
        callbackResult(callback, null, count)
      },
      write(fd, buffer, offset, length, position, callback) {
        const number = Number(fd)
        const bytes = buffer.subarray(Number(offset), Number(offset) + Number(length))
        if (number === 1 || number === 2) {
          appendOutput(virtualDecoder.decode(bytes))
          callbackResult(callback, null, bytes.length)
          return
        }
        const descriptor = descriptors.get(number)
        if (!descriptor || !descriptor.data) {
          callbackResult(callback, virtualError("EBADF", `Bad file descriptor: ${number}`))
          return
        }
        const start = position === null || position === undefined ? descriptor.position : Number(position)
        const required = start + bytes.length
        const next = new Uint8Array(Math.max(required, descriptor.data.length))
        next.set(descriptor.data)
        next.set(bytes, start)
        descriptor.data = next
        virtualFileSystem.files.set(descriptor.path, next)
        if (position === null || position === undefined) descriptor.position = required
        callbackResult(callback, null, bytes.length)
      },
      mkdir(directory, mode, callback) {
        const key = normalizeVirtualPath(directory)
        if (virtualFileSystem.directories.has(key) || virtualFileSystem.files.has(key)) {
          callbackResult(callback, virtualError("EEXIST", `File exists: ${key}`))
          return
        }
        const parent = key.slice(0, key.lastIndexOf("/")) || "/"
        if (!virtualFileSystem.directories.has(parent)) {
          callbackResult(callback, virtualError("ENOENT", `No such directory: ${parent}`))
          return
        }
        virtualFileSystem.directories.add(key)
        callbackResult(callback, null)
      },
      unlink(filename, callback) {
        const key = normalizeVirtualPath(filename)
        if (!virtualFileSystem.files.delete(key)) {
          callbackResult(callback, virtualError("ENOENT", `No such file: ${key}`))
          return
        }
        callbackResult(callback, null)
      },
      rmdir(directory, callback) {
        const key = normalizeVirtualPath(directory)
        if (!virtualFileSystem.directories.has(key)) {
          callbackResult(callback, virtualError("ENOENT", `No such directory: ${key}`))
          return
        }
        if (virtualDirectoryEntries(key).length) {
          callbackResult(callback, virtualError("ENOTEMPTY", `Directory not empty: ${key}`))
          return
        }
        virtualFileSystem.directories.delete(key)
        callbackResult(callback, null)
      },
      fsync(fd, callback) {
        callbackResult(callback, null)
      },
      truncate(filename, length, callback) {
        const key = normalizeVirtualPath(filename)
        const data = virtualFileSystem.files.get(key)
        if (!data) {
          callbackResult(callback, virtualError("ENOENT", `No such file: ${key}`))
          return
        }
        const next = new Uint8Array(Number(length))
        next.set(data.subarray(0, next.length))
        virtualFileSystem.files.set(key, next)
        callbackResult(callback, null)
      },
      ftruncate(fd, length, callback) {
        const descriptor = descriptors.get(Number(fd))
        if (!descriptor || !descriptor.data) {
          callbackResult(callback, virtualError("EBADF", `Bad file descriptor: ${fd}`))
          return
        }
        const next = new Uint8Array(Number(length))
        next.set(descriptor.data.subarray(0, next.length))
        descriptor.data = next
        virtualFileSystem.files.set(descriptor.path, next)
        callbackResult(callback, null)
      }
    }
  }

  const processObject = globalThis.process && typeof globalThis.process === "object" ? globalThis.process : {}
  processObject.cwd = () => virtualFileSystem.cwd
  processObject.chdir = (directory) => {
    const key = normalizeVirtualPath(directory)
    if (!virtualFileSystem.directories.has(key)) throw virtualError("ENOENT", `No such directory: ${key}`)
    virtualFileSystem.cwd = key
  }
  if (typeof processObject.getuid !== "function") processObject.getuid = () => -1
  if (typeof processObject.getgid !== "function") processObject.getgid = () => -1
  if (typeof processObject.geteuid !== "function") processObject.geteuid = () => -1
  if (typeof processObject.getegid !== "function") processObject.getegid = () => -1
  if (typeof processObject.getgroups !== "function") processObject.getgroups = () => []
  if (typeof processObject.umask !== "function") processObject.umask = () => 0
  if (processObject.pid === undefined) processObject.pid = -1
  if (processObject.ppid === undefined) processObject.ppid = -1
  globalThis.process = processObject
  virtualFileSystem.installed = true
}

function configureVirtualWorkspace(entryPath, workspaceFiles) {
  const relative = String(entryPath).replace(/\\/g, "/").trim()
  if (!relative || relative.startsWith("/") || relative.split("/").some(part => part === "..")) {
    throw new Error("entryPath must be a relative file path")
  }
  const nextFiles = new Map()
  const nextDirectories = new Set(["/"])
  const root = "/__lunex_wasm__/workspace"
  const addDirectory = (directory) => {
    let current = directory
    while (current !== "/") {
      nextDirectories.add(current)
      const slash = current.lastIndexOf("/")
      current = slash > 0 ? current.slice(0, slash) : "/"
    }
  }
  for (const [name, content] of Object.entries(workspaceFiles)) {
    const key = String(name).replace(/\\/g, "/").trim()
    if (!key || key.startsWith("/") || key.split("/").some(part => part === "..")) {
      throw new Error(`invalid workspace file path: ${name}`)
    }
    const cleanName = key.split("/").filter(part => part && part !== ".").join("/")
    if (!cleanName) throw new Error(`invalid workspace file path: ${name}`)
    const fullPath = normalizeVirtualPath(`${root}/${cleanName}`)
    nextFiles.set(fullPath, virtualEncoder.encode(String(content)))
    addDirectory(fullPath.slice(0, fullPath.lastIndexOf("/")) || "/")
  }
  const entryName = relative.split("/").filter(part => part && part !== ".").join("/")
  const entryFile = normalizeVirtualPath(`${root}/${entryName}`)
  if (!nextFiles.has(entryFile)) throw new Error(`workspace entry file not found: ${entryName}`)
  addDirectory(root)
  virtualFileSystem.files = nextFiles
  virtualFileSystem.directories = nextDirectories
  virtualFileSystem.cwd = entryFile.slice(0, entryFile.lastIndexOf("/")) || root
  virtualFileSystem.outputBuffer = ""
}

function fileKey(url) {
  const key = decodeURIComponent(url.pathname).replace(/^\/+/, "")
  return key || "main.lx"
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
  }
  return btoa(binary)
}

function findFileImports(source) {
  const imports = []
  let index = 0
  while (index < source.length) {
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2)
      index = end === -1 ? source.length : end + 1
      continue
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2)
      index = end === -1 ? source.length : end + 2
      continue
    }
    const current = source[index]
    if (current === "\"" || current === "'" || current === "`") {
      const quote = current
      index++
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2
          continue
        }
        if (source[index] === quote) {
          index++
          break
        }
        index++
      }
      continue
    }
    if (source.startsWith("@fimport", index) && !/[A-Za-z0-9_$]/.test(source[index + 8] || "")) {
      let cursor = index + 8
      while (/\s/.test(source[cursor] || "")) cursor++
      if (source[cursor] === "(") {
        cursor++
        while (/\s/.test(source[cursor] || "")) cursor++
        const quote = source[cursor]
        if (quote === "\"" || quote === "'") {
          cursor++
          let specifier = ""
          while (cursor < source.length && source[cursor] !== quote) {
            if (source[cursor] === "\\" && cursor + 1 < source.length) {
              specifier += source[cursor + 1]
              cursor += 2
            } else {
              specifier += source[cursor]
              cursor++
            }
          }
          if (source[cursor] === quote) {
            cursor++
            while (/\s/.test(source[cursor] || "")) cursor++
            if (source[cursor] === ")") {
              imports.push(specifier)
              index = cursor + 1
              continue
            }
          }
        }
      }
    }
    index++
  }
  return imports
}

async function collectProject(entryURL, suppliedSource) {
  const files = Object.create(null)
  const binaryFiles = Object.create(null)
  const visited = new Map()

  async function loadURL(inputURL, inlineSource) {
    const url = new URL(inputURL.href)
    url.hash = ""
    if (visited.has(url.href)) return visited.get(url.href)
    visited.set(url.href, false)

    let response
    let source
    if (inlineSource !== undefined) {
      source = inlineSource
    } else {
      response = await fetch(url)
      if (!response.ok) return false
      if (url.pathname.toLowerCase().endsWith(".nax")) {
        binaryFiles[fileKey(url)] = arrayBufferToBase64(await response.arrayBuffer())
        visited.set(url.href, true)
        return true
      }
      source = await response.text()
    }

    files[fileKey(url)] = source
    visited.set(url.href, true)
    for (const specifier of findFileImports(source)) {
      const target = new URL(specifier, url)
      const hasExtension = /\.[^/]+$/.test(target.pathname)
      const candidates = hasExtension
        ? [target]
        : [target, new URL(target.href + ".lx"), new URL(target.href + ".nax")]
      let found = false
      for (const candidate of candidates) {
        if (await loadURL(candidate)) {
          found = true
          break
        }
      }
      if (!found) throw new Error(`cannot fetch @fimport dependency: ${specifier} (imported by ${url.href})`)
    }
    return true
  }

  const entry = new URL(entryURL)
  if (!(await loadURL(entry, suppliedSource))) throw new Error(`cannot fetch Lunex source: ${entry.href}`)
  return { filename: fileKey(entry), files, binaryFiles, source: files[fileKey(entry)] }
}

export async function loadLunex(wasmURL = new URL("./lunex-js.wasm", import.meta.url)) {
  installVirtualFileSystem()
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

  const api = globalThis.Lunex
  const runSource = api.run.bind(api)
  api.runWorkspace = (source, entryPath, workspaceFiles) => {
    if (typeof source !== "string") throw new TypeError("source must be a string")
    if (typeof entryPath !== "string") throw new TypeError("entryPath must be a string")
    if (!workspaceFiles || typeof workspaceFiles !== "object" || Array.isArray(workspaceFiles)) {
      throw new TypeError("workspaceFiles must be an object")
    }
    const previousFiles = virtualFileSystem.files
    const previousDirectories = virtualFileSystem.directories
    const previousCwd = virtualFileSystem.cwd
    const previousOutputBuffer = virtualFileSystem.outputBuffer
    configureVirtualWorkspace(entryPath, workspaceFiles)
    try {
      return runSource(source, { entryPath, files: workspaceFiles })
    } finally {
      virtualFileSystem.files = previousFiles
      virtualFileSystem.directories = previousDirectories
      virtualFileSystem.cwd = previousCwd
      virtualFileSystem.outputBuffer = previousOutputBuffer
    }
  }
  api.runWithImports = async (source, baseURL = document.baseURI) => {
    if (typeof source !== "string") throw new TypeError("source must be a string")
    const project = await collectProject(new URL(baseURL, import.meta.url), source)
    return api.runWorkspace(project.source, project.filename, project.files)
  }
  api.runFile = async url => {
    const project = await collectProject(new URL(url, document.baseURI))
    return api.runWorkspace(project.source, project.filename, project.files)
  }
  return api
}
