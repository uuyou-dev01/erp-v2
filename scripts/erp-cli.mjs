#!/usr/bin/env node
import { readFile, writeFile, mkdir, chmod, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const configPath = () =>
  process.env.ERP_CLI_CONFIG || path.join(homedir(), ".config", "erp-cli", "config.json");
const output = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
class CliError extends Error {
  constructor(code, message, exitCode = 2, issues) {
    super(message);
    Object.assign(this, { code, exitCode, issues });
  }
}
async function stdinText(max = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > max) throw new CliError("INPUT_TOO_LARGE", "输入文件过大");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function passwordPrompt() {
  if (!process.stdin.isTTY)
    throw new CliError("PASSWORD_REQUIRED", "非交互登录请使用 --password-stdin");
  process.stderr.write("ERP password: ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const done = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stderr.write("\n");
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          done();
          reject(new CliError("CANCELLED", "登录已取消"));
          return;
        }
        if (char === "\r" || char === "\n") {
          done();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}
export function validatedBaseUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new CliError("INVALID_URL", "--url 仅填写系统根地址，例如 https://erp.example.com");
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new CliError("HTTPS_REQUIRED", "远程系统必须使用 HTTPS；本机允许 HTTP");
  return url.origin;
}
async function loadConfig() {
  try {
    const config = JSON.parse(await readFile(configPath(), "utf8"));
    validatedBaseUrl(config.baseUrl);
    if (!/^(__Host-erp_session|erp_session)=[A-Za-z0-9_.-]+$/.test(config.sessionCookie))
      throw new Error("invalid session");
    return config;
  } catch {
    throw new CliError("LOGIN_REQUIRED", "请先运行 auth login", 3);
  }
}
async function saveConfig(config) {
  await mkdir(path.dirname(configPath()), { recursive: true, mode: 0o700 });
  await writeFile(configPath(), `${JSON.stringify(config)}\n`, { mode: 0o600 });
  await chmod(configPath(), 0o600);
}
export async function request(config, endpoint, { body, form, authenticated = true } = {}) {
  const headers = { Accept: "application/json", "User-Agent": "erp-cli/1" };
  if (authenticated) {
    headers.Cookie = [
      config.sessionCookie,
      config.organizationId &&
        `erp_active_organization_id=${encodeURIComponent(config.organizationId)}`,
      config.storeId && `erp_active_store_id=${encodeURIComponent(config.storeId)}`,
    ]
      .filter(Boolean)
      .join("; ");
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(`${validatedBaseUrl(config.baseUrl)}${endpoint}`, {
      method: body !== undefined || form ? "POST" : "GET",
      headers,
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new CliError(
      "NETWORK_ERROR",
      "连接失败或超时；检查地址和部署。导入可使用相同 externalId 和相同资料重试",
      1
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new CliError("INVALID_RESPONSE", "服务器未返回 JSON，请检查 CLI 接口是否已部署", 1);
  }
  if (!response.ok || data.success === false) {
    const error = typeof data.error === "string" ? { message: data.error } : data.error || {};
    throw new CliError(
      error.code || `HTTP_${response.status}`,
      error.message || "请求失败",
      response.status === 401 || response.status === 403
        ? 3
        : response.status === 409
          ? 4
          : response.status >= 500
            ? 1
            : 2,
      error.issues
    );
  }
  return { data, response };
}

const HELP = `ERP CLI — 商品调查与建档（Node.js 22+）
node scripts/erp-cli.mjs <command>

auth login --url https://erp.example.com --email you@example.com [--password-stdin]
auth logout                              清除本机登录
context                                  查看可访问的企业与店铺
use --organization <id> --store <id>      选择并保存操作范围
categories [--query 盲盒]                 查找分类 ID
product search [--query 名称] [--offset 0]
product show --id <id>                    查看商品及规格完整资料
product import --file product.json [--dry-run] [--details]  原子创建商品、规格及调查记录
product import --file -                  从标准输入读 JSON
image upload --file cover.jpg [--public]  上传图片，返回可用于 images 的 url
example                                  输出可编辑的导入模板
help                                     显示本帮助

先 login → context → use，再导入。所有业务命令输出 JSON。
密码不会保存；会话保存在 ~/.config/erp-cli/config.json（0600），7 天过期。
ERP_CLI_CONFIG 可指定独立配置文件。重复导入需保留 externalId 和原始内容。
封面：product.images 首张用于商品组；variants[].images 首张用于对应子 SKU。
商品组优先用系列合照/主视觉，子 SKU 用对应款式单图；缺图应备注说明。
子 SKU 无图时仅在导入时写入商品组封面，后续不自动联动；改图请使用网页编辑。
详细字段、AI 工作流程及错误说明：docs/agent-catalog-cli.md
`;

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      url: { type: "string" },
      email: { type: "string" },
      "password-stdin": { type: "boolean" },
      organization: { type: "string" },
      store: { type: "string" },
      query: { type: "string" },
      offset: { type: "string" },
      id: { type: "string" },
      file: { type: "string" },
      "dry-run": { type: "boolean" },
      details: { type: "boolean" },
      public: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  const command = positionals.join(" ");
  if (!command || command === "help" || values.help) {
    process.stdout.write(HELP);
    return;
  }
  const options = {
    "auth login": ["url", "email", "password-stdin"],
    "auth logout": [],
    context: [],
    use: ["organization", "store"],
    categories: ["query"],
    "product search": ["query", "offset"],
    "product show": ["id"],
    "product import": ["file", "dry-run", "details"],
    "image upload": ["file", "public"],
    example: [],
  }[command];
  if (!options) throw new CliError("UNKNOWN_COMMAND", "未知命令，运行 help 查看用法");
  for (const key of Object.keys(values))
    if (!options.includes(key)) throw new CliError("UNKNOWN_OPTION", `此命令不接受 --${key}`);
  const required = (key) => {
    if (!values[key]) throw new CliError("MISSING_OPTION", `缺少 --${key}`);
    return values[key];
  };
  if (command === "example") {
    process.stdout.write(
      await readFile(new URL("../docs/examples/catalog-product.json", import.meta.url), "utf8")
    );
    return;
  }
  if (command === "auth logout") {
    await rm(configPath(), { force: true });
    output({ success: true, status: "logged_out_locally" });
    return;
  }
  if (command === "auth login") {
    const baseUrl = validatedBaseUrl(required("url"));
    const email = required("email");
    const password = values["password-stdin"]
      ? (await stdinText(4096)).replace(/\r?\n$/, "")
      : await passwordPrompt();
    const { data, response } = await request({ baseUrl }, "/api/v1/catalog/session", {
      body: { email, password },
      authenticated: false,
    });
    const sessionCookie = response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .find((cookie) => /^(__Host-erp_session|erp_session)=.+/.test(cookie));
    if (!sessionCookie) throw new CliError("SESSION_MISSING", "服务器没有返回登录会话", 3);
    await saveConfig({ baseUrl, sessionCookie });
    output({
      success: true,
      email: data.email,
      next: "context → use --organization <id> --store <id>",
    });
    return;
  }
  const config = await loadConfig();
  if (command === "context" || command === "use") {
    const { data } = await request(config, "/api/v1/catalog/context");
    if (command === "context") {
      output({
        ...data,
        selected: { organizationId: config.organizationId, storeId: config.storeId },
      });
      return;
    }
    const organizationId = required("organization");
    const storeId = required("store");
    if (
      !data.stores.some((store) => store.id === storeId && store.organizationId === organizationId)
    )
      throw new CliError("FORBIDDEN", "企业或店铺不在账号授权范围内", 3);
    await saveConfig({ ...config, organizationId, storeId });
    output({ success: true, organizationId, storeId });
    return;
  }
  if (!config.storeId || !config.organizationId)
    throw new CliError("SCOPE_REQUIRED", "先运行 context 和 use 选择企业及店铺");
  if (command === "categories") {
    const { data } = await request(config, "/api/v1/catalog/categories");
    const query = values.query?.toLowerCase();
    const categories = data.categories
      .filter((c) => !query || [c.path, ...c.aliases].some((s) => s.toLowerCase().includes(query)))
      .map(({ id, path, scope }) => ({ id, path, scope }));
    output({ success: true, categories });
    return;
  }
  if (command === "product search" || command === "product show") {
    const params = new URLSearchParams({ storeId: config.storeId });
    if (command === "product show") params.set("id", required("id"));
    else {
      if (values.query) params.set("query", values.query);
      if (values.offset) params.set("offset", values.offset);
    }
    output((await request(config, `/api/v1/catalog/products?${params}`)).data);
    return;
  }
  if (command === "product import") {
    const file = required("file");
    if (file !== "-" && (await stat(file)).size > 1_000_000)
      throw new CliError("INPUT_TOO_LARGE", "导入文件不得超过 1MB");
    let body;
    try {
      body = JSON.parse(
        (file === "-" ? await stdinText() : await readFile(file, "utf8")).replace(/^\uFEFF/, "")
      );
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError("INVALID_JSON", "无法读取有效的 JSON 导入文件");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new CliError("INVALID_JSON", "导入文件必须是 JSON 对象");
    if (body.storeId && body.storeId !== config.storeId)
      throw new CliError("STORE_MISMATCH", "文件 storeId 与当前店铺不一致，请核对 use 选择");
    body.storeId = config.storeId;
    const { data } = await request(
      config,
      `/api/v1/catalog/products/import${values["dry-run"] ? "?dryRun=1" : ""}`,
      { body }
    );
    if (values.details) output(data);
    else {
      const { variants, ...result } = data;
      output({ ...result, variantCount: variants.length });
    }
    return;
  }
  if (command === "image upload") {
    const file = required("file");
    const size = (await stat(file)).size;
    if (size <= 0 || size > 8 * 1024 * 1024)
      throw new CliError("IMAGE_SIZE", "图片需为 1 字节至 8MB");
    const mime = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
    }[path.extname(file).toLowerCase()];
    if (!mime) throw new CliError("IMAGE_FORMAT", "请使用 JPG、PNG、WebP 或 GIF 图片");
    const form = new FormData();
    form.set("file", new Blob([await readFile(file)], { type: mime }), path.basename(file));
    form.set("purpose", "CATALOG_IMAGE");
    form.set("visibility", values.public ? "CATALOG_PUBLIC" : "ORGANIZATION_PRIVATE");
    form.set("storeId", config.storeId);
    form.set("organizationId", config.organizationId);
    output({ success: true, ...(await request(config, "/api/upload", { form })).data });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    output({
      success: false,
      error: {
        code: error.code || "CLI_ERROR",
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
      },
    });
    process.exitCode = error.exitCode || 2;
  });
}
