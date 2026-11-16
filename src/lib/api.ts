import hollowAchievements from "./hollow-achievements.json";

export type GameState = "rodando" | "pausado" | "parado" | "sessao_concluida" | "concluido" | "gerando_gabarito" | "erro";
export interface Game { appid: string; nome: string; estado: GameState; erro?: string; elapsed_s: number; total_s: number; restantes: number; total_conquistas: number; proxima?: string | undefined; falta_min?: number | undefined; ultima?: string }
export interface Achievement { id: string; nome: string; descricao?: string; pos: number; agendada_s?: number; concluida: boolean }
export interface InstalledGame { appid: string; nome: string; tem_gabarito: boolean }
export interface Settings { dll: string; sessao_horas: number; api_url: string }
export interface Template { appid: string; nome: string; horas_sugeridas: number; conquistas: Pick<Achievement, "id" | "nome" | "pos">[] }
export interface Activity { id: string; appid: string; jogo: string; mensagem: string; horario: string; tipo: "conquista" | "sessao" | "inicio" }

export const POLLING_INTERVAL = 1500;
export const DEFAULT_API_URL = "http://localhost:8765";
export const USE_MOCK = import.meta.env["VITE_USE_MOCK"] !== "false";
const STORAGE_KEY = "gerenciador-conquistas-demo-v2";
const URL_KEY = "gerenciador-conquistas-api-url";
const SETTINGS_KEY = "gerenciador-conquistas-settings";
const firstNames = ["Charmed", "Falsehood", "Test of Resolve", "Protected", "Connection", "Soulful", "Illumination", "Respect", "Grubfriend", "Honour", "Release", "Enchanted", "Attunement"];
const hollowOrder = [...firstNames, ...hollowAchievements.map((item) => item.nome).filter((name) => !firstNames.includes(name) && !["Steel Soul", "Steel Heart"].includes(name)), "Steel Soul", "Steel Heart"];
const names = hollowOrder;
const installed: InstalledGame[] = [
  { appid: "367520", nome: "Hollow Knight", tem_gabarito: true },
  { appid: "413150", nome: "Stardew Valley", tem_gabarito: true },
  { appid: "504230", nome: "Celeste", tem_gabarito: true },
  { appid: "588650", nome: "Dead Cells", tem_gabarito: false },
  { appid: "1145360", nome: "Hades", tem_gabarito: true },
];
const otherNames: Record<string, string[]> = {
  "413150": ["Greenhorn", "Cowpoke", "Homesteader", "Millionaire", "Legend", "A Complete Collection", "A New Friend", "Best Friends", "Beloved Farmer", "Cliques", "Networking", "Popular", "Cook", "Sous Chef", "Gourmet Chef", "Moving Up", "Living Large", "D.I.Y.", "Artisan", "Craft Master", "Fisherman", "Ol' Mariner", "Master Angler", "Mother Catch", "Treasure Trove", "Gofer", "A Big Help", "Polyculture", "Monoculture", "Full Shipment", "Prairie King", "The Bottom", "Local Legend", "Joja Co. Member Of The Year", "Mystery Of The Stardrops", "Full House", "Singular Talent", "Master Of The Five Ways", "Protector Of The Valley", "Fector's Challenge", "Two Thumbs Up", "Blue Ribbon", "An Unforgettable Soup", "Good Neighbors", "Well-Read", "Perfection", "Infinite Power", "A Distant Shore", "Danger In The Deep"],
  "504230": ["Forsaken", "Archaeology", "Checking Out", "Breathe", "In the Mirror", "Reflection", "Celeste", "Sever the Skyline", "Black Moonrise", "Good Karma", "Golden Feather", "Mirror Magic", "Center of the Earth", "No More Running", "Gateway", "Quiet and Falling", "Heart of the Mountain", "Core", "Thanks For Playing", "PICO-8", "1UP!", "Real Gamer", "Strawberry Badge", "Strawberry Medal", "Impress Your Friends", "Say Goodbye", "Farewell", "Wow", "Dedication", "Full Clear"],
  "588650": ["Love the serenity", "A room with a view!", "Finally, a moment of rest…", "Smells like burned flesh", "What's that funky smell?", "You've got something in your eye", "The Fat and The Furious", "The last rampart falls…"],
  "1145360": ["Escaped Tartarus", "Escaped Asphodel", "Escaped Elysium", "Champion of Elysium", "Is There No Escape?", "Weapon of Fate", "To Charon's Credit", "Well Stocked", "Thorn of Thanatos", "Blessed by the Gods", "Friends in High Places", "Rare Collectible", "Skelly's Last Lamentations", "The Useless Trinket", "Something From Everyone", "War-God's Bloodlust", "End to Torment", "A True Hero", "Homecoming", "One for the Ages"],
};
const defaultSettings: Settings = { dll: "C:\\Program Files (x86)\\Steam\\steam_api64.dll", sessao_horas: 4, api_url: DEFAULT_API_URL };
interface MockState { games: Game[]; templates: Record<string, Template>; logs: Record<string, string[]>; settings: Settings; activities: Activity[]; lastTick: number; sessionStarts: Record<string, number> }
let state: MockState | undefined;
let connected = USE_MOCK;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function clock(date = new Date()) { return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function createTemplate(appid: string): Template {
  const game = installed.find((item) => item.appid === appid);
  if (!game) throw new Error("Jogo não encontrado.");
  return { appid, nome: game.nome, horas_sugeridas: appid === "367520" ? 85 : appid === "413150" ? 120 : appid === "504230" ? 25 : 50,
    conquistas: (appid === "367520" ? names : otherNames[appid] ?? []).map((nome, index) => ({ id: (appid === "367520" ? hollowAchievements.find((item) => item.nome === nome)?.id : undefined) || nome.toUpperCase().replace(/[^A-Z0-9]+/g, "_"), nome, pos: index + 1 })) };
}
function initialState(): MockState {
  const games: Game[] = [
    { appid: "367520", nome: "Hollow Knight", estado: "rodando", elapsed_s: 18.2 * 3600, total_s: 85 * 3600, restantes: 52, total_conquistas: 63, proxima: "Enchanted", falta_min: 34, ultima: "Release" },
    { appid: "413150", nome: "Stardew Valley", estado: "parado", elapsed_s: 6.4 * 3600, total_s: 120 * 3600, restantes: 40, total_conquistas: 49, proxima: "Cliques", falta_min: 48, ultima: "Beloved Farmer" },
    { appid: "504230", nome: "Celeste", estado: "sessao_concluida", elapsed_s: 3.5 * 3600, total_s: 25 * 3600, restantes: 23, total_conquistas: 30, proxima: "Sever the Skyline", falta_min: 22, ultima: "Celeste" },
  ];
  const now = Date.now();
  const activities: Activity[] = [
    { id: "demo-release", appid: "367520", jogo: "Hollow Knight", mensagem: "Release", horario: new Date(now - 8 * 60000).toISOString(), tipo: "conquista" },
    { id: "demo-session", appid: "504230", jogo: "Celeste", mensagem: "Sessão concluída", horario: new Date(now - 24 * 60000).toISOString(), tipo: "sessao" },
    { id: "demo-celeste", appid: "504230", jogo: "Celeste", mensagem: "Celeste", horario: new Date(now - 31 * 60000).toISOString(), tipo: "conquista" },
    { id: "demo-honour", appid: "367520", jogo: "Hollow Knight", mensagem: "Honour", horario: new Date(now - 52 * 60000).toISOString(), tipo: "conquista" },
  ];
  const logs: Record<string, string[]> = {};
  for (const game of games) {
    logs[game.appid] = [`[${clock()}] INFO · Gabarito carregado: ${game.total_conquistas} conquistas`, `[${clock()}] INFO · Plano de ${game.total_s / 3600}h configurado`, `[${clock()}] INFO · Programa local pronto`];
  }
  for (const event of [...activities].reverse()) logs[event.appid]?.push(`[${event.horario}] ${event.tipo === "conquista" ? "DESBLOQUEADA" : "SESSÃO"} · ${event.mensagem}`);
  return { games, templates: Object.fromEntries(installed.filter((game) => game.tem_gabarito).map((game) => [game.appid, createTemplate(game.appid)])), logs, settings: defaultSettings, activities, lastTick: now, sessionStarts: { "367520": 18.2 * 3600 } };
}
function persist() {
  if (typeof window !== "undefined" && state) {
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Storage is optional for demo mode. */ }
  }
}
function mock(): MockState {
  if (typeof window === "undefined") throw new Error("A API local está disponível apenas no navegador.");
  if (!state) {
    try { const stored = window.sessionStorage.getItem(STORAGE_KEY); state = stored ? JSON.parse(stored) : initialState(); } catch { state = initialState(); }
  }
  if (!state) state = initialState();
  const delta = Math.min((Date.now() - state.lastTick) / 1000, 10);
  state.lastTick = Date.now();
  for (const game of state.games) {
    if (game.estado !== "rodando") continue;
    game.elapsed_s = Math.min(game.total_s, game.elapsed_s + Math.max(0, delta));
    const achievements = scheduled(game, state.templates[game.appid]);
    const completed = achievements.filter((achievement) => achievement.concluida);
    const newlyCompleted = completed.length - (game.total_conquistas - game.restantes);
    if (newlyCompleted > 0) {
      for (const achievement of completed.slice(-newlyCompleted)) {
        const event: Activity = { id: `${game.appid}-${achievement.id}`, appid: game.appid, jogo: game.nome, mensagem: achievement.nome, horario: new Date().toISOString(), tipo: "conquista" };
        state.activities.unshift(event);
        state.logs[game.appid]?.push(`[${event.horario}] DESBLOQUEADA · ${achievement.nome}`);
        game.ultima = achievement.nome;
      }
    }
    game.restantes = game.total_conquistas - completed.length;
    const next = achievements.find((achievement) => !achievement.concluida);
    game.proxima = next?.nome;
    game.falta_min = next?.agendada_s === undefined ? undefined : Math.max(0, Math.ceil((next.agendada_s - game.elapsed_s) / 60));
    if (game.elapsed_s >= game.total_s) game.estado = "concluido";
    else if (state.settings.sessao_horas > 0 && game.elapsed_s - (state.sessionStarts[game.appid] ?? 0) >= state.settings.sessao_horas * 3600) {
      game.estado = "sessao_concluida";
      const event: Activity = { id: `session-${Date.now()}`, appid: game.appid, jogo: game.nome, mensagem: "Sessão concluída", horario: new Date().toISOString(), tipo: "sessao" };
      state.activities.unshift(event);
      state.logs[game.appid]?.push(`[${event.horario}] SESSÃO · Sessão concluída`);
    }
  }
  persist();
  return state;
}
function scheduled(game: Game, template?: Template): Achievement[] {
  if (!template) return [];
  // The sample Hollow Knight plan has 11 completions at 18.2h and Enchanted at 18h46.
  return template.conquistas.map((achievement, index) => {
    let at = ((index + 1) / template.conquistas.length) * game.total_s;
    if (game.appid === "367520" && game.total_s === 85 * 3600) {
      at = index < 11 ? ((index + 1) / 11) * 18 * 3600 : (18.2 * 3600 + 34 * 60) + ((index - 11) / 51) * (game.total_s - (18.2 * 3600 + 34 * 60));
    } else if (game.appid === "413150" && game.total_s === 120 * 3600) {
      at = index < 9 ? ((index + 1) / 9) * 6.3 * 3600 : 7.2 * 3600 + ((index - 9) / 39) * (game.total_s - 7.2 * 3600);
    } else if (game.appid === "504230" && game.total_s === 25 * 3600) {
      at = index < 7 ? ((index + 1) / 7) * 3.4 * 3600 : (3.5 * 3600 + 22 * 60) + ((index - 7) / 22) * (game.total_s - (3.5 * 3600 + 22 * 60));
    }
    return { ...achievement, agendada_s: at, concluida: at <= game.elapsed_s };
  });
}
export function getApiUrl(): string {
  if (typeof window === "undefined") return DEFAULT_API_URL;
  try { return window.localStorage.getItem(URL_KEY) || DEFAULT_API_URL; } catch { return DEFAULT_API_URL; }
}
export function getLocalSettings(): Settings {
  try { const stored = window.localStorage.getItem(SETTINGS_KEY); return { ...(stored ? JSON.parse(stored) : defaultSettings), api_url: getApiUrl() }; } catch { return { ...defaultSettings, api_url: getApiUrl() }; }
}
export function isConnected() { return connected; }
async function request<T>(path: string, method = "GET", body?: unknown, overrideUrl?: string): Promise<T> {
  if (typeof window === "undefined") throw new Error("A API local está disponível apenas no navegador.");
  try {
    const response = await fetch(`${(overrideUrl || getApiUrl()).replace(/\/$/, "")}${path}`, {
      method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(4000),
    });
    connected = true;
    if (!response.ok) throw new Error(`O programa local retornou um erro (${response.status}).`);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return text ? JSON.parse(text) : undefined as T;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))) connected = false;
    throw error instanceof Error ? error : new Error("Não foi possível acessar o programa local.");
  }
}
async function example<T>(action: (data: MockState) => T): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 180));
  const result = action(mock());
  persist(); connected = true;
  return clone(result);
}
export async function getGames(): Promise<Game[]> { return USE_MOCK ? example((data) => data.games) : request("/jogos"); }
export async function getInstalledGames(): Promise<InstalledGame[]> { return USE_MOCK ? example((data) => installed.map((game) => ({ ...game, tem_gabarito: !!data.templates[game.appid] }))) : request("/instalados"); }
export async function getAchievements(appid: string): Promise<Achievement[]> {
  return USE_MOCK ? example((data) => { const game = data.games.find((item) => item.appid === appid); if (!game) throw new Error("Jogo não encontrado."); return scheduled(game, data.templates[appid]); }) : request(`/jogos/${encodeURIComponent(appid)}/conquistas`);
}
export async function getGameLogs(appid: string): Promise<string[]> { return USE_MOCK ? example((data) => data.logs[appid] ?? []) : request(`/jogos/${encodeURIComponent(appid)}/log`); }
export async function startGame(appid: string): Promise<void> {
  if (!USE_MOCK) return request(`/jogos/${encodeURIComponent(appid)}/iniciar`, "POST");
  await example((data) => { const game = data.games.find((item) => item.appid === appid); if (!game) throw new Error("Jogo não encontrado."); if (game.estado === "concluido") throw new Error("Este plano já foi concluído."); game.estado = "rodando"; data.sessionStarts[appid] = game.elapsed_s; data.logs[appid]?.push(`[${clock()}] INFO · Sessão iniciada`); return true; });
}
export async function pauseGame(appid: string): Promise<void> {
  if (!USE_MOCK) return request(`/jogos/${encodeURIComponent(appid)}/pausar`, "POST");
  await example((data) => { const game = data.games.find((item) => item.appid === appid); if (!game) throw new Error("Jogo não encontrado."); game.estado = "pausado"; data.logs[appid]?.push(`[${clock()}] INFO · Sessão pausada`); return true; });
}
export async function removeGame(appid: string): Promise<void> {
  if (!USE_MOCK) return request(`/jogos/${encodeURIComponent(appid)}`, "DELETE");
  await example((data) => { data.games = data.games.filter((game) => game.appid !== appid); delete data.logs[appid]; return true; });
}
export async function addGame(input: { appid: string; horas: number }): Promise<void> {
  if (!Number.isFinite(input.horas) || input.horas <= 0) throw new Error("Informe um total de horas maior que zero.");
  if (!USE_MOCK) return request("/jogos", "POST", input);
  await example((data) => {
    if (data.games.some((game) => game.appid === input.appid)) throw new Error("Este jogo já está no painel.");
    const template = data.templates[input.appid] || createTemplate(input.appid);
    const generating = !data.templates[input.appid];
    data.templates[input.appid] = template;
    data.games.push({ appid: input.appid, nome: template.nome, estado: generating ? "gerando_gabarito" : "parado", elapsed_s: 0, total_s: input.horas * 3600, restantes: template.conquistas.length, total_conquistas: template.conquistas.length, proxima: template.conquistas[0]?.nome });
    data.logs[input.appid] = [`[${clock()}] INFO · Jogo adicionado ao plano`, `[${clock()}] INFO · ${generating ? "Gerando gabarito" : "Gabarito carregado"}`];
    if (generating) window.setTimeout(() => { const game = state?.games.find((item) => item.appid === input.appid); if (game) { game.estado = "parado"; state?.logs[input.appid]?.push(`[${clock()}] INFO · Gabarito gerado com sucesso`); persist(); } }, 2500);
    return true;
  });
}
export async function getTemplate(appid: string): Promise<Template> { return USE_MOCK ? example((data) => data.templates[appid] || createTemplate(appid)) : request(`/gabaritos/${encodeURIComponent(appid)}`); }
export function normalizePositions<T extends { pos: number }>(items: T[]): T[] { return items.map((item, index) => ({ ...item, pos: index + 1 })); }
export async function saveTemplate(template: Template): Promise<void> {
  const value = { ...template, conquistas: normalizePositions(template.conquistas) };
  if (!USE_MOCK) return request(`/gabaritos/${encodeURIComponent(template.appid)}`, "PUT", value);
  await example((data) => { data.templates[value.appid] = value; return true; });
}
export async function getSettings(): Promise<Settings> { return USE_MOCK ? example((data) => ({ ...data.settings, api_url: getApiUrl() })) : request("/config"); }
export function validateSettings(settings: Settings): void {
  if (!Number.isFinite(settings.sessao_horas) || settings.sessao_horas < 0) throw new Error("As horas por sessão devem ser zero ou um número positivo.");
  const url = new URL(settings.api_url);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use uma URL HTTP ou HTTPS.");
  if (!settings.dll.trim()) throw new Error("Informe o caminho do steam_api64.dll.");
}
export async function saveSettings(settings: Settings): Promise<void> {
  validateSettings(settings);
  if (USE_MOCK) await example((data) => { data.settings = settings; return true; });
  else await request("/config", "PUT", settings, settings.api_url);
  window.localStorage.setItem(URL_KEY, settings.api_url.replace(/\/$/, ""));
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
export async function testConnection(url: string): Promise<{ mock: boolean }> {
  const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("URL inválida.");
  if (USE_MOCK) { await example(() => true); return { mock: true }; }
  await request<Settings>("/config", "GET", undefined, url); return { mock: false };
}
export async function getActivity(): Promise<Activity[]> {
  if (USE_MOCK) return example((data) => data.activities);
  const games = await getGames();
  const activity = await Promise.all(games.map(async (game) => {
    const lines = await getGameLogs(game.appid);
    return lines.flatMap((line, index): Activity[] => {
      const match = line.match(/^\[([^\]]+)\]\s+(DESBLOQUEADA|SESSÃO)\s*·\s*(.+)$/);
      const [, timestamp, type, message] = match || [];
      if (!timestamp || !type || !message || Number.isNaN(Date.parse(timestamp))) return [];
      return [{ id: `${game.appid}-${index}`, appid: game.appid, jogo: game.nome, mensagem: message, horario: timestamp, tipo: type === "DESBLOQUEADA" ? "conquista" : "sessao" }];
    });
  }));
  return activity.flat().sort((a, b) => Date.parse(b.horario) - Date.parse(a.horario));
}
export function achievementsToday(events: Activity[], now = new Date()): number { return events.filter((event) => event.tipo === "conquista" && new Date(event.horario).toLocaleDateString("pt-BR") === now.toLocaleDateString("pt-BR")).length; }