import { describe, expect, it } from "vitest";
import playwrightConfig from "../../playwright.config";

describe("playwright config", () => {
  it("prevents color environment conflicts in web server subprocesses", () => {
    const webServer = Array.isArray(playwrightConfig.webServer)
      ? playwrightConfig.webServer[0]
      : playwrightConfig.webServer;

    expect(webServer?.command).toMatch(/^export FORCE_COLOR=0; /);
  });
});
