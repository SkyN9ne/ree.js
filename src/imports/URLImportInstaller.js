// this file allows you to download files from a URL.
import env, { dirname } from "./env.js";
import { reejsDir as dir, runtime } from "./env.js";
import NativeImport from "./nativeImport.js";
if (runtime == "browser") {
  throw new Error(
    "URLImportInstaller.js is not for edge/browsers. Install them via reejs cli and use them.");
}
let reejsDir = dir;
let fs = await NativeImport("node:fs");
let path = await NativeImport("node:path");
let http = await NativeImport("node:http");
let https = await NativeImport("node:https");

let crypto = await NativeImport("node:crypto");
import "@reejs/utils/log.js";
import DynamicImport from "./dynamicImport.js";
import URLImport from "./URLImport.js";
let processCwd = globalThis?.process?.cwd?.() || Deno.cwd();

if (!fs.existsSync(path.join(reejsDir, "cache")) &&
  fs.existsSync(path.join(processCwd, ".reecfg.json"))) {
  fs.mkdirSync(path.join(reejsDir, "cache"), { recursive: true });
  fs.writeFileSync(path.join(reejsDir, "cache", "package.json"),
    JSON.stringify({ type: "module" }));
}
globalThis.__CACHE_SHASUM = {};
let URLToFile = function (url, noFolderPath = false) {
  if (url.startsWith("node:"))
    return url;
  let isJson = false;
  let fileExt = path.extname(url).split("?")[0];
  if (![".json", ".js", ".wasm"].includes(fileExt)) {
    fileExt = ".js";
  }
  if (!url.startsWith("https://") && !url.startsWith("http://"))
    return url; // must be ?external module from esm.sh
  __CACHE_SHASUM[url] =
    crypto.createHash("sha256").update(url).digest("hex").slice(0, 6) + (isJson ? ".json" : ".js")
  let fileString = noFolderPath
    ? "./" +
    crypto.createHash("sha256").update(url).digest("hex").slice(
      0, 6) +
    fileExt
    : path.join(
      reejsDir, "cache",
      crypto.createHash("sha256").update(url).digest("hex").slice(
        0, 6) +
      fileExt);
  return fileString;
};
// user agent
let UA;
let pkgJson = DynamicImport(await import("./version.js")).reejs;
switch (env) {
  case "node":
    UA = `Node/${process.version} (reejs/${pkgJson.version})`;
    break;
  case "deno":
    UA = `Deno/${Deno.version.deno} (reejs/${pkgJson.version})`;
    break;
  case "browser":
    UA = `Mozilla/5.0 (reejs/${pkgJson.version})`; // I got no idea why I did this. Sounds villainous. I can confirm lol~
    break;
  case "bun":
    //UA = `Bun/${Bun.version} (reejs/${pkgJson.version})`; 
    UA = `Node/${process.version} (reejs/${pkgJson.version})`; //As of time of writing, `esm.sh` provides `esnext` build for Bun instead of its own or `node` target
    // so we use Node's UA because we don't want nodejs polyfills.
    break;
}
let followRedirect = async function (url, forBrowser = false) {
  if (url.startsWith("node:"))
    return url;
  if (url.startsWith("npm:")) {
    console.log(url);
    return (await fetch(
      "https://esm.sh/" + url.replace("npm:", "") + "?bundle", {
      headers: {
        "User-Agent":
          forBrowser ? `Mozilla/5.0 (reejs/${pkgJson.version})`
            : UA,
      }
    }))
      .url;
  }
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    return "node:" + url;
  }
  try {
    let finalURL = url;
    let res =
      await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } }).catch(async () => {
        return await fetch(url, { method: "GET", headers: { "User-Agent": UA } });
      });
    finalURL = res.url;
    return finalURL;
  } catch (e) {
    console.log(e);
  }
};

async function waitUntilArrayDoesntHaveValue(array, value, checkInterval = 200) {
  //if the value isn't removed after 10 seconds, throw an error.
  // let timeout = setTimeout(() => {
  //   throw new Error("TimeoutError: The value was not removed from the array: "+value);
  //   process.exit(1);
  // }, 2000);

  while (array.includes(value)) {
    return await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
}

globalThis.CURRENT_DOWNLOADING = [];
globalThis.NOTIFIED_UPDATE_URL = [];
globalThis.MODULES_SENT_TO_DOWNLOAD = [];
let lexer, parser;

let dl =
  async function (url, cli = false, remove = false, forBrowser = false, ua = UA) {
    url = url;
    let wasmFiles = [];
    if (ua && ua != "Set user agent to download the package") UA = ua;
    if (cli)
      reejsDir = path.join(processCwd, ".reejs");

    if (!fs.existsSync(path.join(reejsDir, "cache"))) {
      fs.mkdirSync(path.join(reejsDir, "cache"), { recursive: true });
      fs.writeFileSync(path.join(reejsDir, "cache", "package.json"),
        JSON.stringify({ type: "module" }));
    }

    if (url.startsWith("node:"))
      return url;
    if (url.startsWith("npm:")) {
      url = "https://esm.sh/" + url.replace("npm:", "") + "?bundle";
    }
    if (!url.startsWith("https://") && !url.startsWith("http://") &&
      !url.startsWith("/")) {
      return url; //must be an ?external module feature of esm.sh
    }
    if (url.startsWith("/")) {
      throw new Error("Absolute paths are not supported.");
    }
    if (!remove && fs.existsSync(URLToFile(url))) {
      return URLToFile(url);
    }
    let res = await followRedirect(url, forBrowser);
    if (fs.existsSync(URLToFile(res))) {
      if ((res != url) && !NOTIFIED_UPDATE_URL.includes(url)) {
        console.log(
          "%c[WARNING] %cURLImportInstaller.js: %cPlease use specific version for %c" +
          url + " %cto access %c" + res +
          " %cfaster without pinging for latest version",
          "color: yellow", "color: red", "color: white", "color: blue",
          "color: white", "color: blue", "color: white");
        NOTIFIED_UPDATE_URL.push(url);
      }
      return URLToFile(res);
    }
    if (!lexer) {
      if (env == "bun") {
        console.log(
          "[BUN] Using Native Features that are faster than the polyfills!");
        let transpiler = new Bun.Transpiler();
        lexer = {
          parse: (code) => {
            let _imports = transpiler.scanImports(code);
            _imports = _imports.map((e) => e.path);
            return _imports.filter((e) => { return !e.startsWith("node:"); });
          },
        };
      } else {
        let p = await import("./lexer.js");
        await p.init;
        lexer = {
          parse: (code) => {
            let arr = p.parse(code);
            arr = arr[0].map((e) => { return e.n; });
            return Array.from(new Set(arr))
              .filter((i) => !!i)
              .filter((i) => { return !i.startsWith("node:"); });
          },
        };
      }
    }
    res = await fetch(url, {
      headers: {
        "User-Agent": forBrowser ? `Mozilla/5.0 (reejs/${pkgJson.version})` : UA,
      }
    }).catch(async() => {
      return await fetch(url, { method: "GET", headers: { "User-Agent": UA } });
    });
    let finalURL = await followRedirect(res.url, forBrowser);
    await waitUntilArrayDoesntHaveValue(CURRENT_DOWNLOADING, finalURL);
    if (MODULES_SENT_TO_DOWNLOAD.includes(finalURL)) {
      //idk why this happens, but it does fix the issue regarding infinite loop of downloading modules...
      return URLToFile(finalURL);
    }
    if (!remove && fs.existsSync(URLToFile(finalURL))) {
      return URLToFile(finalURL);
    }
    CURRENT_DOWNLOADING.push(finalURL);
    MODULES_SENT_TO_DOWNLOAD.push(finalURL);
    let code = await res.text();
    let tries = 0;
    while (code == "" && (finalURL == url)) {
      code = await (await fetch(finalURL, {
        headers: {
          "User-Agent": forBrowser ? `Mozilla/5.0 (reejs/${pkgJson.version})` : UA,
        }
      })).text();
      tries++;
      if (code == "" && tries > 10) console.log(tries + " try: Retry due to Empty code for " + finalURL);
      //sleep for x * 100ms
      await new Promise((resolve) => setTimeout(resolve, (tries) * 100));
    }
    let oldCode = code;
    if (!remove && (globalThis?.process?.env?.DEBUG || globalThis?.Deno?.env?.get("DEBUG")))
      console.log("%c[DOWNLOAD] %c" + url, "color:blue", "color:yellow");
    if (finalURL.endsWith(".ts")) {
      console.log("%c[TYPESCRIPT] Compiling %c" + finalURL, "color:blue",
        "color:yellow; font-weight: bold;");
      if (!parser) {
        parser = DynamicImport(await URLImport("https://esm.sh/sucrase@3.32.0?bundle"));
      }
      code = parser
        .transform(code, {
          transforms: ["typescript"],
          production: true,
        })
        .code;
    }
    let packs;
    try {
      packs = lexer.parse(code);
    } catch (e) {
      console.log(code);
      console.log(
        "%c[ERROR] %cSkipping %c" + finalURL + "%c because of %cParse Error",
        "color:red", "color:blue", "color:yellow", "color:blue", "color:red");
      console.log(e);
      code = oldCode;
      packs = [];
    }
    // map packs , find the npm: and and run followRedirect on it and return the
    // url
    let files = (await Promise.all(packs.map(async (e) => {
      //if(e.endsWith(".json.js")) e = e.replace(".json.js",".json");
      //if(e.endsWith("node/package.json")) e = e.replace("node/package.json","package.json");
      if (e.startsWith("npm:")) {
        return await followRedirect(
          "https://esm.sh/" + e.replace("npm:", "") + "?bundle", forBrowser);
      } else if (e.startsWith("/")) {
        let eurl = new URL(finalURL);
        return (eurl.origin + e);
      }
      return e;
    })));
    files = files.map((e) => { return URLToFile(e, true); });

    await Promise.all(packs.map(async (p, i) => {
      code = code.replaceAll(p, files[i]);
      let dlUrl;
      if (p.startsWith("/")) {
        let eurl = new URL(finalURL);
        dlUrl = eurl.protocol + "//" + path.join(eurl.host, p);
      }
      else if (p.startsWith("./") || p.startsWith("../")) {
        let eurl = new URL(finalURL);
        dlUrl = eurl.protocol + "//" + eurl.hostname + path.join(path.dirname(eurl.pathname), p);
        code = code.replaceAll(p, URLToFile(dlUrl, true));
      }
      //if(p.endsWith(".json.js")) p = p.replace(".json.js",".json");
      //if(p.endsWith("node/package.json")) p = p.replace("node/package.json","package.json");
      return await dl(dlUrl || p, null, remove);
    }));
    if (!remove) { // save file
      let dir = path.dirname(URLToFile(finalURL));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (code == "") {
        console.log("%c[WARN] %cSkipping %c" + finalURL + "%c because of %cEmpty Code", "color:red", "color:blue", "color:yellow", "color:blue", "color:red");
        return URLToFile(finalURL); // this crashes but it wont save the file, so it can be fetched next time
      }
      if (code.includes(".wasm")) {
        code = code.replaceAll(/(__dirname\s*(,|\+)\s*)?(("|'|`)[^("|'|`)]+\.wasm("|'|`))/g, (e) => {
          // e is the match, like __dirname+"./file.wasm"
          let ematch = JSON.stringify(e).replace("__dirname", "").replaceAll(" ", "").replaceAll("+", "").replaceAll(",", "").replaceAll('"', "").replaceAll("'", "").replaceAll("`", "");
          let eurl = new URL(finalURL);
          let wasmUrl = eurl.protocol + "//" + eurl.hostname + path.join(path.dirname(eurl.pathname), ematch).replaceAll("\\","");
          wasmFiles.push(wasmUrl);
          return `new URL("${URLToFile(wasmUrl, true)}",import.meta.url).href.slice(7)`;
        });
      }
      fs.writeFileSync(URLToFile(finalURL), code)
    }
    await Promise.all(wasmFiles.map(async (e) => {
      let f = await (await fetch(e)).arrayBuffer();
      fs.writeFileSync(URLToFile(e), Buffer.from(f));
      if (!remove && (globalThis?.process?.env?.DEBUG || globalThis?.Deno?.env?.get("DEBUG")))
      console.log("%c[DOWNLOAD] %c" + e, "color:blue", "color:yellow");
    }));
    if (remove && fs.existsSync(URLToFile(finalURL))) {
      console.log("%c[REMOVE] %c" + finalURL, "color:red", "color:blue");
      fs.unlinkSync(URLToFile(finalURL));
    }
    CURRENT_DOWNLOADING = CURRENT_DOWNLOADING.filter((e) => e != finalURL);
    return URLToFile(finalURL);
  };

export default dl;
export { URLToFile, followRedirect };
let save = (e) => {
  // save cache sha256
  if (!fs.existsSync(path.join(reejsDir, "cache"))) {
    fs.mkdirSync(path.join(reejsDir, "cache"), { recursive: true });
  }
  let oldCache = {};
  if (fs.existsSync(path.join(reejsDir, "cache", "cache.json"))) {
    oldCache =
      fs.readFileSync(path.join(reejsDir, "cache", "cache.json"), "utf-8");
    oldCache = JSON.parse(oldCache);
  }
  let totalCache = { ...oldCache, ...__CACHE_SHASUM };
  fs.writeFileSync(path.join(reejsDir, "cache", "cache.json"),
    JSON.stringify(totalCache, null, 2));
  let copyE = e;
  if (e instanceof Error) {
    if (globalThis?.process?.env?.DEBUG || globalThis?.Deno?.env?.get("DEBUG")){
      console.log("%cGenerating doctor report...", "color:yellow");
      globalThis?.REEJS_doctorReport();
    }
    console.log("%c[INFO] %cSaving important data...", "color:blue",
      "color:yellow");
    if (e.stack.includes(".ts") || e.stack.includes(".tsx") ||
      e.stack.includes(".jsx") || e.stack.includes(".js")) {
      if (!globalThis?.process?.env?.DEBUG && !globalThis?.Deno?.env?.get("DEBUG"))
        console.log(
          "%c[TIP] %cIf the error in your code is in any of the following extensions (.ts, .tsx, .jsx), kindly not focus on the line number as the line numbers depict the compiled code and not the original one. Add `DEBUG=true` to your environment variables to see the original code.",
          "color: yellow", "color: white")
    }
    let arr = Object.entries(totalCache);
    let result = arr.map(pair => {
      let newObj = {};
      newObj["file://" + path.join(reejsDir, "cache", pair[1])] = pair[0];
      newObj["./" + pair[1]] = (new URL(pair[0])).pathname;
      newObj[path.join(reejsDir, "cache", pair[1])] = pair[0];
      return newObj;
    });
    result = Object.assign({}, ...result);
    // change e stack and change the file names to the urls
    let stack = e.stack.split("\n");
    stack = stack.map((e) => {
      // replace the file names with the urls
      Object.entries(result).forEach(
        ([key, value]) => { e = e.replaceAll(key, value); });
      return e;
    });
    e.stack = stack.join("\n");
    console.error((globalThis?.process?.env?.DEBUG || globalThis?.Deno?.env?.get("DEBUG")) ? copyE : e);
    globalThis?.process.removeAllListeners("exit"); // dont run save again
    globalThis?.process.removeAllListeners("beforeExit");
    globalThis?.process.removeAllListeners("uncaughtException");
    globalThis?.process.removeAllListeners("SIGINT");
    globalThis?.process.removeAllListeners("SIGTERM");
    globalThis?.process.removeAllListeners("SIGHUP");
    globalThis?.window?.removeEventListener("unload", save);
    globalThis?.process?.exit(1);
    globalThis?.Deno?.exit(1);
  }
};

if (globalThis?.process) {
  process.on("beforeExit", save);
  process.on("exit", save);
  process.on("uncaughtException", save);
  process.on("SIGINT", save);
  process.on("SIGTERM", save);
  process.on("SIGHUP", save);
} else {
  //deno
  globalThis.window.addEventListener("unload", save);
  //deno can't catch uncaught exceptions
}