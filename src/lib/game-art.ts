import hollow from "@/assets/steam-367520.asset.json";
import stardew from "@/assets/steam-413150.asset.json";
import celeste from "@/assets/steam-504230.asset.json";
import deadcells from "@/assets/steam-588650.asset.json";
import hades from "@/assets/steam-1145360.asset.json";

const art: Record<string, string> = { "367520": hollow.url, "413150": stardew.url, "504230": celeste.url, "588650": deadcells.url, "1145360": hades.url };
export function gameArt(appid: string) { return art[appid]; }