import { useEffect, useRef, useState } from "react";
import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock3, Trophy, Pencil, Radio, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataState, LoadingState, EmptyState } from "@/components/data-state";
import { GameActions } from "@/components/game-actions";
import { PlanProgress, StatusBadge } from "@/components/game-card";
import { achievementsQuery, gamesQuery, logsQuery } from "@/lib/queries";
import { gameArt } from "@/lib/game-art";
import { hours } from "@/lib/format";

export const Route = createFileRoute("/jogo/$appid")({
  head: ({ params }) => ({ meta: [{ title: `Progresso do jogo ${params.appid} | Gerenciador de Conquistas` }, { name: "description", content: "Agenda de conquistas, progresso do plano e log ao vivo do jogo." }, { property: "og:title", content: `Progresso do jogo ${params.appid} | Gerenciador de Conquistas` }, { property: "og:description", content: "Acompanhe cada conquista e sua próxima sessão." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  loader: ({ context, params }) => { if (typeof window !== "undefined") { void context.queryClient.ensureQueryData(gamesQuery()).catch(() => {}); void context.queryClient.ensureQueryData(achievementsQuery(params.appid)).catch(() => {}); void context.queryClient.ensureQueryData(logsQuery(params.appid)).catch(() => {}); } },
  component: GamePage,
});
function GamePage() { const { appid } = Route.useParams(); return <ClientOnly fallback={<LoadingState />}><DataState key={appid}><GameDetail appid={appid} /></DataState></ClientOnly>; }
function GameDetail({ appid }: { appid: string }) {
  const { data: games } = useSuspenseQuery(gamesQuery());
  const game = games.find((item) => item.appid === appid);
  if (!game) return <EmptyState title="Jogo não encontrado" description="Este jogo não está mais no painel."><Button asChild variant="cyan"><Link to="/">Voltar ao painel</Link></Button></EmptyState>;
  return <><Button variant="link" className="text-muted-foreground px-0 mb-2 text-xs" asChild><Link to="/"><ArrowLeft />Voltar ao painel</Link></Button><div className="detail-header"><img src={gameArt(appid)} className="detail-cover" alt={`Capa de ${game.nome}`} /><div className="flex-1 w-full"><div className="flex flex-wrap items-center justify-between gap-4"><h1 className="page-title">{game.nome}</h1><StatusBadge state={game.estado} /></div><PlanProgress game={game} /><div className="flex justify-between text-[11px] text-muted-foreground"><span>Restam {game.restantes} conquistas</span><span className="flex gap-1 items-center"><Trophy className="size-3" />{game.total_conquistas - game.restantes}/{game.total_conquistas}</span></div><div className="flex gap-2 mt-5 max-w-sm"><GameActions game={game} showDetails={false} /></div>{game.erro && <p role="alert" className="text-warning text-xs mt-3">{game.erro}</p>}</div></div><div className="detail-columns"><section><DataState><AchievementTimeline appid={appid} /></DataState></section><section><DataState><LiveLog appid={appid} running={game.estado === "rodando"} /></DataState></section></div></>;
}
function AchievementTimeline({ appid }: { appid: string }) {
  const { data: achievements } = useSuspenseQuery(achievementsQuery(appid));
  const [filter, setFilter] = useState("Todas");
  const next = achievements.find((item) => !item.concluida);
  const filtered = achievements.filter((item) => filter === "Todas" || (filter === "Concluídas" ? item.concluida : !item.concluida));
  return <><div className="flex items-center justify-between gap-4"><h2 className="text-sm font-semibold">Agenda de conquistas</h2><Button variant="ghost" size="icon" asChild title="Editar gabarito" aria-label="Editar gabarito"><Link to="/gabarito/$appid" params={{ appid }}><Pencil className="text-muted-foreground" /></Link></Button></div><div className="flex gap-1 p-1 bg-muted rounded-md mt-4 w-fit" role="tablist" aria-label="Filtrar conquistas">{["Todas", "Pendentes", "Concluídas"].map((value) => <Button key={value} variant={filter === value ? "subtle" : "ghost"} size="sm" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{value}<span className="text-[9px] text-muted-foreground">{value === "Todas" ? achievements.length : achievements.filter((item) => value === "Concluídas" ? item.concluida : !item.concluida).length}</span></Button>)}</div><div className="timeline">{filtered.length === 0 ? <EmptyState title="Nenhuma conquista nesta lista" /> : filtered.map((item) => <div key={item.id} className={`timeline-row ${item.concluida ? "done" : ""} ${item.id === next?.id ? "next" : ""}`}><span className="timeline-icon">{item.concluida ? <Check className="size-3.5" /> : <Clock3 className="size-3.5" />}</span><div className="min-w-0 flex-1 pt-1"><div className="flex gap-3 justify-between"><span className="timeline-name text-xs font-semibold">{item.nome}</span><span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{item.agendada_s === undefined ? "—" : hours(item.agendada_s)}</span></div><p className="mt-1.5 text-[10px] text-muted-foreground">{item.id === next?.id ? "Próxima conquista" : item.concluida ? "Desbloqueada" : "Agendada"}{item.descricao ? ` · ${item.descricao}` : ""}</p></div></div>)}</div></>;
}
function LiveLog({ appid, running }: { appid: string; running: boolean }) {
  const { data: logs } = useSuspenseQuery(logsQuery(appid));
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => { const element = container.current; if (element) element.scrollTop = element.scrollHeight; }, [logs]);
  return <><div className="flex justify-between items-center mb-4 h-9"><h2 className="text-sm font-semibold">Log de execução</h2><span className="flex items-center gap-2 text-[9px] text-muted-foreground"><Radio className={`size-3 ${running ? "text-success" : ""}`} />{running ? "AO VIVO" : "ÚLTIMA SESSÃO"}</span></div><div className="log-panel"><div className="flex justify-between items-center border-b border-border px-4 py-3"><span className="font-mono text-[10px] text-muted-foreground">steam · {appid}</span><Button variant="ghost" size="icon" className="size-6" aria-label="Copiar log" title="Copiar log" onClick={async () => { try { await navigator.clipboard.writeText(logs.join("\n")); toast.success("Log copiado"); } catch { toast.error("Não foi possível copiar o log"); } }}><Copy className="size-3" /></Button></div><div ref={container} className="log-lines" role="log" aria-label="Log de execução" aria-live="polite">{logs.length === 0 ? <p>Nenhum registro nesta sessão.</p> : logs.map((line, index) => <p key={`${index}-${line}`} className={line.includes("DESBLOQUEADA") ? "log-success" : ""}>{line}</p>)}<span className="text-primary">▍</span></div></div></>;
}