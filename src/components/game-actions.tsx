import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Play, Pause, MoreHorizontal, Pencil, Trash2, ArrowUpRight, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { startGame, pauseGame, removeGame, type Game } from "@/lib/api";

export function GameActions({ game, showDetails = true }: { game: Game; showDetails?: boolean }) {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<"pause" | "remove" | null>(null);
  const mutation = useMutation({
    mutationFn: async (action: "start" | "pause" | "remove") => { if (action === "start") await startGame(game.appid); else if (action === "pause") await pauseGame(game.appid); else await removeGame(game.appid); },
    onMutate: async (action) => {
      await queryClient.cancelQueries({ queryKey: ["games"] });
      const previous = queryClient.getQueryData<Game[]>(["games"]);
      queryClient.setQueryData<Game[]>(["games"], (games) => action === "remove" ? games?.filter((item) => item.appid !== game.appid) : games?.map((item) => item.appid === game.appid ? { ...item, estado: action === "start" ? "rodando" : "pausado" } : item));
      return { previous };
    },
    onError: (error, _action, context) => { if (context?.previous) queryClient.setQueryData(["games"], context.previous); toast.error(error.message); },
    onSuccess: (_data, action) => toast.success(action === "start" ? `Sessão de ${game.nome} iniciada` : action === "pause" ? `Sessão de ${game.nome} pausada` : `${game.nome} removido do painel`),
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["games"] }); queryClient.invalidateQueries({ queryKey: ["logs", game.appid] }); queryClient.invalidateQueries({ queryKey: ["activity"] }); },
  });
  const running = game.estado === "rodando";
  return <>
    <Button variant={running ? "pause" : "cyan"} size="action" className="flex-1" disabled={mutation.isPending || game.estado === "concluido" || game.estado === "gerando_gabarito"} onClick={() => running ? setConfirmation("pause") : mutation.mutate("start")}>
      {mutation.isPending ? <LoaderCircle className="animate-spin" /> : running ? <Pause /> : <Play />} {running ? "Pausar" : game.estado === "concluido" ? "Concluído" : game.estado === "gerando_gabarito" ? "Gerando..." : "Iniciar"}
    </Button>
    {showDetails && <Button variant="subtle" size="action" className="flex-1" asChild><Link to="/jogo/$appid" params={{ appid: game.appid }}>Detalhes<ArrowUpRight className="size-3" /></Link></Button>}
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Opções de ${game.nome}`} title="Opções do jogo" className="shrink-0"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to="/gabarito/$appid" params={{ appid: game.appid }}><Pencil />Editar gabarito</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => setConfirmation("remove")}><Trash2 />Remover jogo</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null); }}><AlertDialogContent className="modal-content"><AlertDialogHeader><AlertDialogTitle>{confirmation === "remove" ? "Remover jogo do painel?" : "Pausar a sessão?"}</AlertDialogTitle><AlertDialogDescription>{confirmation === "remove" ? `O plano de ${game.nome} será removido. O gabarito continuará salvo e as conquistas já desbloqueadas não serão alteradas.` : `A sessão de ${game.nome} está em andamento. Seu progresso será mantido para continuar depois.`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => { mutation.mutate(confirmation === "remove" ? "remove" : "pause"); setConfirmation(null); }}>{confirmation === "remove" ? "Remover jogo" : "Pausar sessão"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}