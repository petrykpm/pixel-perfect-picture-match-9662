import { Link } from "@tanstack/react-router";
import { Check, Clock3, Trophy, Gamepad2 } from "lucide-react";
import { type Game, type GameState } from "@/lib/api";
import { gameArt } from "@/lib/game-art";
import { hours, minutes, percent } from "@/lib/format";
import { GameActions } from "./game-actions";

export const stateLabels: Record<GameState, string> = { rodando: "Em andamento", pausado: "Pausado", parado: "Parado", sessao_concluida: "Sessão concluída", concluido: "Concluído", gerando_gabarito: "Gerando gabarito", erro: "Erro" };
export function StatusBadge({ state }: { state: GameState }) { return <span className={`status-badge ${state}`}><span className="status-dot" />{stateLabels[state]}</span>; }
export function PlanProgress({ game }: { game: Game }) {
  const progress = percent(game.elapsed_s, game.total_s);
  return <><div className="plan-heading"><span className="text-[10px] text-muted-foreground">Progresso do plano</span><span className="text-[11px] font-semibold tabular-nums">{hours(game.elapsed_s)}<span className="text-muted-foreground font-normal"> / {hours(game.total_s)}</span><span className="ml-2 text-primary text-[10px]">{progress}%</span></span></div><div className={`progress-track ${game.estado === "sessao_concluida" ? "session" : ""}`}><progress aria-label={`Progresso de ${game.nome}`} value={progress} max={100} /></div></>;
}
export function GameCard({ game }: { game: Game }) {
  const running = game.estado === "rodando";
  const image = gameArt(game.appid);
  return <article className="game-card">
    <Link to="/jogo/$appid" params={{ appid: game.appid }} className="game-cover" aria-label={`Ver ${game.nome}`}>{image ? <img src={image} alt={`Capa de ${game.nome}`} /> : <div className="h-full bg-muted grid place-items-center"><Gamepad2 className="size-10 text-muted-foreground" /></div>}<span className="cover-platform"><Gamepad2 className="size-3" />STEAM</span></Link>
    <div className="game-body"><h2 className="game-title"><Link to="/jogo/$appid" params={{ appid: game.appid }}>{game.nome}</Link></h2><StatusBadge state={game.estado} /><PlanProgress game={game} />
      <div className="flex items-center justify-between text-[10px]"><span className="text-muted-foreground">Restam <span className="font-semibold text-foreground">{game.restantes} conquistas</span></span><span className="flex items-center gap-1 text-muted-foreground"><Trophy className="size-3" />{game.total_conquistas - game.restantes}/{game.total_conquistas}</span></div>
      <div className={`upcoming ${running ? "" : "inactive"}`}><Clock3 className={`size-4 shrink-0 ${running ? "text-primary" : "text-muted-foreground"}`} /><div className="min-w-0 flex-1"><div className="text-[9px] text-muted-foreground mb-1">{game.estado === "concluido" ? "Plano concluído" : "Próxima conquista"}</div><div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="text-[11px] font-semibold">{game.proxima ?? "Todas desbloqueadas"}</span>{game.proxima && <span className={`text-[9px] ${running ? "text-primary" : "text-muted-foreground"}`}>{running ? `em ${minutes(game.falta_min)}` : "Ao retomar a sessão"}</span>}</div></div></div>
      <div className="flex gap-1.5 items-center mt-4 text-[9px] text-muted-foreground min-h-4"><Check className="size-3 text-success shrink-0" /><span>Última desbloqueada: <span className="text-foreground">{game.ultima || "Nenhuma ainda"}</span></span></div>
      {game.erro && <p className="mt-3 text-xs text-destructive" role="alert">{game.erro}</p>}
    </div><div className="game-actions"><GameActions game={game} /></div>
  </article>;
}