import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { validatedBaseUrl } from "../../scripts/erp-cli.mjs";

test("CLI restricts credential destinations to HTTPS or local HTTP", () => {
  assert.equal(validatedBaseUrl("https://erp.example.com"), "https://erp.example.com");
  assert.equal(validatedBaseUrl("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  for (const url of [
    "http://erp.example.com",
    "https://user:secret@erp.example.com",
    "https://erp.example.com/path",
    "file:///tmp/test",
    "https://erp.example.com?token=x",
  ])
    assert.throws(() => validatedBaseUrl(url));
});

const baseUrl = process.env.ERP_CLI_E2E_URL;
test(
  "real CLI → HTTP → database: login, upload, preview, import, retry and authorization",
  { skip: !baseUrl, timeout: 180_000 },
  async () => {
    const dbUrl = new URL(process.env.TEST_DATABASE_URL || "");
    assert.match(dbUrl.pathname, /_test$/);
    assert.ok(["localhost", "127.0.0.1"].includes(dbUrl.hostname));
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname));
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl.href } } });
    const dir = await mkdtemp(path.join(tmpdir(), "erp-cli-e2e-"));
    const config = path.join(dir, "config.json");
    const run = `cli_http_${Date.now()}`;
    let organization;
    let store;
    let user;
    const runCli = async (args, stdin, expectedCode = 0) => {
      const result = await new Promise((resolve, reject) => {
        const child = execFile(
          process.execPath,
          ["scripts/erp-cli.mjs", ...args],
          { cwd: process.cwd(), env: { ...process.env, ERP_CLI_CONFIG: config }, timeout: 65_000 },
          (error, stdout, stderr) => {
            if (error && typeof error.code !== "number") return reject(error);
            resolve({ code: error?.code || 0, stdout, stderr });
          }
        );
        child.stdin.end(stdin);
      });
      assert.equal(result.code, expectedCode, result.stdout + result.stderr);
      return JSON.parse(result.stdout);
    };
    try {
      const password = randomBytes(24).toString("hex");
      const salt = randomBytes(16).toString("hex");
      const key = await promisify(scryptCallback)(password, salt, 64);
      organization = await prisma.organization.create({ data: { code: run, name: run } });
      store = await prisma.store.create({
        data: { organizationId: organization.id, code: run, name: run },
      });
      user = await prisma.user.create({
        data: {
          email: `${run}@example.com`,
          name: run,
          password: `scrypt$${salt}$${key.toString("hex")}`,
          storeId: store.id,
        },
      });
      await prisma.membership.create({
        data: { organizationId: organization.id, userId: user.id, role: "OWNER", status: "ACTIVE" },
      });
      await prisma.storeAccess.create({
        data: { storeId: store.id, userId: user.id, role: "OWNER" },
      });
      const category = await prisma.productCategory.create({
        data: { organizationId: organization.id, code: run, name: run, path: run },
      });
      const login = await runCli(
        ["auth", "login", "--url", baseUrl, "--email", user.email, "--password-stdin"],
        password + "\n"
      );
      assert.equal(login.success, true);
      assert.equal(JSON.stringify(login).includes(password), false);
      assert.equal((await stat(config)).mode & 0o777, 0o600);
      const context = await runCli(["context"]);
      assert.deepEqual(
        context.stores.map((s) => s.id),
        [store.id]
      );
      await runCli(["use", "--organization", "foreign", "--store", store.id], undefined, 3);
      await runCli(["use", "--organization", organization.id, "--store", store.id]);
      assert.ok(
        (await runCli(["categories", "--query", run])).categories.some((c) => c.id === category.id)
      );
      const imagePath = path.join(dir, "cover.png");
      await writeFile(
        imagePath,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9X8AAAAASUVORK5CYII=",
          "base64"
        )
      );
      const upload = await runCli(["image", "upload", "--file", imagePath]);
      assert.match(upload.url, /^\/api\/assets\/.+\/content$/);
      const savedAsset = await prisma.mobileAsset.findUniqueOrThrow({ where: { id: upload.id } });
      assert.equal(savedAsset.storeId, store.id);
      assert.equal(savedAsset.visibility, "ORGANIZATION_PRIVATE");
      const payload = {
        schemaVersion: 1,
        externalId: run,
        product: { name: run, brand: "Test", categoryId: category.id, images: [upload.url] },
        variants: [
          {
            label: "A",
            observations: [
              {
                amount: "99",
                currency: "CNY",
                sourceName: "Fixture",
                sourceUrl: "https://example.com/test",
                observedAt: "2026-10-04T10:00:00+08:00",
              },
            ],
          },
          { label: "B" },
        ],
      };
      const file = path.join(dir, "product.json");
      await writeFile(file, JSON.stringify(payload));
      assert.equal(
        (await runCli(["product", "import", "--file", file, "--dry-run"])).status,
        "preview"
      );
      assert.equal(await prisma.sKU.count({ where: { storeId: store.id } }), 0);
      const created = await runCli(["product", "import", "--file", file]);
      assert.equal(created.status, "created");
      assert.equal(created.variantCount, 2);
      assert.equal(created.variants, undefined);
      assert.equal(created.observationCount, 1);
      assert.equal((await runCli(["product", "import", "--file", file])).status, "existing");
      assert.equal(
        (await runCli(["product", "import", "--file", file, "--details"])).variants.length,
        2
      );
      assert.equal(await prisma.sKU.count({ where: { storeId: store.id } }), 3);
      assert.equal(
        (await runCli(["product", "search", "--query", run])).products[0].id,
        created.product.id
      );
      assert.equal(
        (await runCli(["product", "show", "--id", created.product.id])).product.childSkus.length,
        2
      );
      await writeFile(file, JSON.stringify({ ...payload, variants: [{ label: "C" }] }));
      assert.equal(
        (await runCli(["product", "import", "--file", file], undefined, 4)).error.code,
        "IMPORT_CONFLICT"
      );
      const saved = JSON.parse(await readFile(config, "utf8"));
      const foreign = await fetch(`${baseUrl}/api/v1/catalog/products/import`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: saved.sessionCookie },
        body: JSON.stringify({ ...payload, storeId: "foreign-store" }),
      });
      assert.equal(foreign.status, 403);
      const unauth = await fetch(`${baseUrl}/api/v1/catalog/context`);
      assert.equal(unauth.status, 401);
      const csrf = await fetch(`${baseUrl}/api/v1/catalog/session`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://attacker.example" },
        body: "{}",
      });
      assert.equal(csrf.status, 403);
      await prisma.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
      });
      assert.equal((await runCli(["context"], undefined, 3)).error.code, "UNAUTHENTICATED");
      await runCli(["auth", "logout"]);
      assert.equal((await runCli(["context"], undefined, 3)).error.code, "LOGIN_REQUIRED");
    } finally {
      if (store) {
        await prisma.productIntelligenceObservation.deleteMany({ where: { storeId: store.id } });
        await prisma.productIntelligenceItem.deleteMany({ where: { storeId: store.id } });
        await prisma.mobileAsset.deleteMany({ where: { storeId: store.id } });
        await prisma.store.delete({ where: { id: store.id } });
      }
      if (user) await prisma.user.delete({ where: { id: user.id } });
      if (organization) {
        await prisma.productCategory.deleteMany({ where: { organizationId: organization.id } });
        await prisma.organization.delete({ where: { id: organization.id } });
      }
      await prisma.$disconnect();
      await rm(dir, { recursive: true, force: true });
    }
  }
);
