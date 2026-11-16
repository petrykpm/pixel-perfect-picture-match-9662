import { useState } from "react";
import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Play, Trophy, Clock3, ArrowRight, LayoutGrid, ListFilter, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { GameCard } from "@/components/game-card";
import { AddGameDialog } from "@/components/add-game-dialog";
import { ActivityList } from "@/components/activity-list";
import { DataState, EmptyState, LoadingState } from "@/components/data-state";
import { gamesQuery, activityQuery } from "@/lib/queries";
import { achievementsToday } from "@/lib/api";
import { hours } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Painel | Gerenciador de Conquistas" }, { name: "description", content: "Acompanhe seus jogos Steam, conquistas e sessões em um só lugar." }, { property: "og:title", content: "Painel | Gerenciador de Conquistas" }, { property: "og:description", content: "Seu progresso, no seu ritmo. Acompanhe conquistas e planos dos seus jogos Steam." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  loader: ({ context }) => { if (typeof window !== "undefined") { void context.queryClient.ensureQueryData(gamesQuery()).catch(() => {}); void context.queryClient.ensureQueryData(activityQuery()).catch(() => {}); } },
  component: Index,
});
function Index() {
  const [open, setOpen] = useState(false);
  return <><div className="page-heading"><div><div className="section-label mb-2.5 flex items-center gap-2"><Trophy className="size-3 text-primary" />GERENCIADOR DE CONQUISTAS</div><h1 className="page-title">Seu próximo 100% começa aqui.</h1><p className="page-subtitle">Acompanhe seus jogos e deixe cada conquista acontecer no seu ritmo.</p></div><Button variant="cyan" size="action" onClick={() => setOpen(true)}><Plus />Adicionar jogo</Button></div><ClientOnly fallback={<LoadingState />}><DataState><Dashboard onAdd={() => setOpen(true)} /></DataState></ClientOnly><ClientOnly><AddGameDialog open={open} onOpenChange={setOpen} /></ClientOnly></>;
}
function Dashboard({ onAdd }: { onAdd: () => void }) {
  const { data: games } = useSuspenseQuery(gamesQuery());
  const [filter, setFilter] = useState("Todos os jogos");
  const filtered = games.filter((game) => filter === "Todos os jogos" || (filter === "Em andamento" ? game.estado === "rodando" : filter === "Concluídos" ? game.estado === "concluido" : game.estado !== "rodando" && game.estado !== "concluido"));
  const running = games.filter((game) => game.estado === "rodando").length;
  return <><div className="stats-grid"><div className="stat"><div className="stat-icon"><Play className="size-5" /></div><div><div className="stat-label">Jogos em andamento</div><span className="stat-number">{String(running).padStart(2,"0")}</span><span className="stat-note">de {games.length} jogos</span></div></div><div className="stat"><div className="stat-icon success"><Trophy className="size-5" /></div><div><div className="stat-label">Conquistas hoje</div><DataState><TodayCount /></DataState></div></div><div className="stat"><div className="stat-icon warning"><Clock3 className="size-5" /></div><div><div className="stat-label">Horas simuladas</div><span className="stat-number">{hours(games.reduce((sum,game) => sum+game.elapsed_s,0))}</span><span className="stat-note">no total</span></div></div></div>
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><h2 className="text-sm font-semibold">Meus jogos</h2><span className="text-[9px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{games.length}</span></div><div className="flex items-center gap-2"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="text-muted-foreground text-[10px]"><ListFilter className="size-3" />{filter}</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{["Todos os jogos","Em andamento","Não iniciados / pausados","Concluídos"].map((value) => <DropdownMenuItem key={value} onSelect={() => setFilter(value)}>{filter === value && <Check />}{value}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu><span className="border-l border-border h-4 mx-1" /><LayoutGrid className="size-3.5 text-primary" /></div></div>
    {games.length === 0 ? <EmptyState description="Adicione seu primeiro jogo para começar um plano de conquistas."><Button variant="cyan" onClick={onAdd}><Plus />Adicionar jogo</Button></EmptyState> : filtered.length === 0 ? <EmptyState title="Nenhum jogo com este estado" /> : <div className="game-grid">{filtered.map((game) => <GameCard key={game.appid} game={game} />)}</div>}
    <section className="activity-section"><div className="flex justify-between items-center"><h2 className="text-sm font-semibold">Atividade recente</h2><Button variant="link" asChild size="sm" className="text-[10px] p-0"><Link to="/atividade">Ver tudo<ArrowRight className="size-3" /></Link></Button></div><DataState><RecentActivity /></DataState></section>
  </>;
}
function TodayCount() { const { data: events } = useSuspenseQuery(activityQuery()); return <><span className="stat-number">{String(achievementsToday(events)).padStart(2,"0")}</span><span className="stat-note text-success">desbloqueadas</span></>; }
function RecentActivity() { const { data: events } = useSuspenseQuery(activityQuery()); return <ActivityList events={events.slice(0,3)} />; }
