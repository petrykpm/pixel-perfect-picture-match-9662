import { Link } from "@tanstack/react-router";
import { Trophy, CheckCheck, Play } from "lucide-react";
import { type Activity } from "@/lib/api";
import { timeAgo } from "@/lib/format";

export function ActivityList({ events }: { events: Activity[] }) {
  return <div className="activity-list">{events.length === 0 ? <p className="py-8 text-xs text-muted-foreground">Nenhuma atividade registrada.</p> : events.map((event) => <div key={event.id} className="activity-row"><div className={`activity-icon ${event.tipo === "sessao" ? "!bg-warning-soft !text-warning" : ""}`}>{event.tipo === "conquista" ? <Trophy className="size-4" /> : event.tipo === "sessao" ? <CheckCheck className="size-4" /> : <Play className="size-4" />}</div><div className="flex-1 min-w-0"><p className="text-[11px] font-semibold">{event.mensagem}{event.tipo === "conquista" && <span className="font-normal text-muted-foreground"> desbloqueada</span>}</p><Link to="/jogo/$appid" params={{ appid: event.appid }} className="text-[10px] text-muted-foreground mt-1 inline-block hover:text-primary">{event.jogo}</Link></div><span className="text-[9px] text-muted-foreground shrink-0">{timeAgo(event.horario)}</span></div>)}</div>;
}