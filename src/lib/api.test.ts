import { describe, it, expect } from "vitest";
import { achievementsToday, addGame, getAchievements, getGames, normalizePositions, POLLING_INTERVAL, validateSettings } from "./api";
import { hours, minutes, percent } from "./format";

describe("Local program rules", () => {
  it("polls every 1.5 seconds", () => { expect(POLLING_INTERVAL).toBe(1500); });
  it("accepts zero session hours as no limit", () => { expect(() => validateSettings({ dll: "C:\\Steam\\steam_api64.dll", sessao_horas: 0, api_url: "http://localhost:8765" })).not.toThrow(); });
  it("rejects a negative session limit", () => { expect(() => validateSettings({ dll: "steam_api64.dll", sessao_horas: -1, api_url: "http://localhost:8765" })).toThrow(); });
  it("requires positive total plan hours", async () => { await expect(addGame({ appid: "1145360", horas: 0 })).rejects.toThrow(); });
  it("recalculates positions starting at one after reorder", () => { expect(normalizePositions([{ id: "B", pos: 2 }, { id: "A", pos: 1 }])).toEqual([{ id: "B", pos: 1 }, { id: "A", pos: 2 }]); });
  it("provides the specified Hollow Knight sample", async () => { const games = await getGames(); expect(games.find((game) => game.appid === "367520")).toMatchObject({ nome: "Hollow Knight", estado: "rodando", total_s: 85 * 3600, restantes: 52, total_conquistas: 63, proxima: "Enchanted", falta_min: 34 }); });
  it("provides 63 scheduled Hollow Knight achievements and 11 completed", async () => { const list = await getAchievements("367520"); expect(list).toHaveLength(63); expect(list.filter((achievement) => achievement.concluida)).toHaveLength(11); expect(list.find((achievement) => !achievement.concluida)?.nome).toBe("Enchanted"); expect(list.find((achievement) => achievement.nome === "Falsehood")?.id).toBe("FK_DEFEAT"); expect(list.slice(-2).map((achievement) => achievement.nome)).toEqual(["Steel Soul", "Steel Heart"]); });
  it("counts only achievement events in the user's current day", () => { expect(achievementsToday([{ id: "1", appid: "x", jogo: "X", mensagem: "A", horario: "2026-11-16T12:00:00", tipo: "conquista" }, { id: "2", appid: "x", jogo: "X", mensagem: "B", horario: "2026-11-15T12:00:00", tipo: "conquista" }, { id: "3", appid: "x", jogo: "X", mensagem: "C", horario: "2026-11-16T12:00:00", tipo: "sessao" }], new Date("2026-11-16T18:00:00"))).toBe(1); });
  it("formats 18.2 hours and 34 minutes in pt-BR", () => { expect(hours(18.2 * 3600)).toBe("18,2h"); expect(minutes(34)).toBe("34 min"); expect(percent(18.2 * 3600, 85 * 3600)).toBe(21); });
});