import hollow from "@/assets/steam-367520.asset.json";
import stardew from "@/assets/steam-413150.asset.json";
import celeste from "@/assets/steam-504230.asset.json";
import deadcells from "@/assets/steam-588650.asset.json";
import hades from "@/assets/steam-1145360.asset.json";

const demo: Record<string, string> = { "367520": hollow.url, "413150": stardew.url, "504230": celeste.url, "588650": deadcells.url, "1145360": hades.url };
const useMock = import.meta.env["VITE_USE_MOCK"] !== "false";
// Modo demonstração: assets do projeto. Modo local: capa oficial da Steam para qualquer jogo.
export function gameArt(appid: string) {
  if (useMock) return demo[appid];
  return /^\d+$/.test(appid) ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg` : undefined;
}
