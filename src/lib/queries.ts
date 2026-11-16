import { queryOptions } from "@tanstack/react-query";
import { getAchievements, getActivity, getGames, getGameLogs, getInstalledGames, getSettings, getTemplate, POLLING_INTERVAL } from "./api";

const live = { refetchInterval: POLLING_INTERVAL, staleTime: 1000, retry: 1, refetchOnWindowFocus: true };
export const gamesQuery = () => queryOptions({ queryKey: ["games"], queryFn: getGames, ...live });
export const activityQuery = () => queryOptions({ queryKey: ["activity"], queryFn: getActivity, ...live });
export const achievementsQuery = (appid: string) => queryOptions({ queryKey: ["achievements", appid], queryFn: () => getAchievements(appid), ...live });
export const logsQuery = (appid: string) => queryOptions({ queryKey: ["logs", appid], queryFn: () => getGameLogs(appid), ...live });
export const installedQuery = () => queryOptions({ queryKey: ["installed"], queryFn: getInstalledGames, ...live });
export const templateQuery = (appid: string) => queryOptions({ queryKey: ["template", appid], queryFn: () => getTemplate(appid), ...live });
export const settingsQuery = () => queryOptions({ queryKey: ["settings"], queryFn: getSettings, ...live });