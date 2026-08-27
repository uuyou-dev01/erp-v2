import { describe, expect, it } from "vitest";
import {
  assertConfirmedDatabase,
  assertSafeTestDatabaseUrl,
  parsePostgresDatabaseUrl,
} from "@/lib/database/database-url-guard";

describe("database URL safety guard", () => {
  it.each(["erp_test", "erp_e2e", "ERP_E2E"])(
    "accepts an isolated test database named %s",
    (databaseName) => {
      expect(
        assertSafeTestDatabaseUrl(`postgresql://user:secret@localhost:5432/${databaseName}`)
          .databaseName,
      ).toBe(databaseName);
    },
  );

  it.each(["erp", "erp-test", "test", "erp_e2e_copy"])(
    "rejects unsafe test database name %s",
    (databaseName) => {
      expect(() =>
        assertSafeTestDatabaseUrl(`postgresql://localhost/${databaseName}`),
      ).toThrow(/_test.*_e2e/);
    },
  );

  it("never includes credentials in the printable identity", () => {
    const identity = parsePostgresDatabaseUrl(
      "postgresql://private-user:private-password@db.internal:5444/erp_e2e?schema=public",
    );

    expect(identity.safeLabel).toBe("db.internal:5444/erp_e2e");
    expect(JSON.stringify(identity)).not.toContain("private-password");
  });

  it("requires exact database confirmation", () => {
    const url = "postgresql://localhost/erp_release";
    expect(() => assertConfirmedDatabase(url, "erp")).toThrow(/不一致/);
    expect(assertConfirmedDatabase(url, "erp_release").databaseName).toBe("erp_release");
  });
});
