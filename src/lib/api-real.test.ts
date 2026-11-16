import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); window.localStorage.clear(); });
describe("Real local API", () => {
  it("switches to the local API without changing screens", async () => {
    vi.stubEnv("VITE_USE_MOCK", "false"); vi.resetModules();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    const api = await import("./api");
    expect(api.USE_MOCK).toBe(false); expect(await api.getGames()).toEqual([]);
    expect(fetcher.mock.calls[0]?.[0]).toBe("http://localhost:8765/jogos");
  });
  it("marks the program disconnected after a network failure", async () => {
    vi.stubEnv("VITE_USE_MOCK", "false"); vi.resetModules(); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const api = await import("./api"); await expect(api.getGames()).rejects.toThrow(); expect(api.isConnected()).toBe(false);
  });
  it("uses and remembers the configured API URL", async () => {
    vi.stubEnv("VITE_USE_MOCK", "false"); vi.resetModules(); const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", fetcher);
    const api = await import("./api"); await api.saveSettings({ dll: "C:\\Steam\\steam_api64.dll", sessao_horas: 0, api_url: "http://localhost:9999" });
    expect(api.getApiUrl()).toBe("http://localhost:9999"); expect(fetcher.mock.calls[0]?.[0]).toBe("http://localhost:9999/config"); expect(fetcher.mock.calls[0]?.[1].method).toBe("PUT");
    expect(api.getLocalSettings().sessao_horas).toBe(0);
  });
});