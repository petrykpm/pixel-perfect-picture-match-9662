import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Search, Plus, Check, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { addGame, getTemplate, searchGames, type Game, type InstalledGame } from "@/lib/api";
import { gamesQuery, installedQuery } from "@/lib/queries";
import { gameArt } from "@/lib/game-art";
import { DataState, EmptyState } from "./data-state";

export function AddGameDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="modal-content"><DialogHeader><div className="mb-3 text-primary"><GamepadIcon /></div><DialogTitle>Adicionar jogo</DialogTitle><DialogDescription>Escolha um jogo da sua biblioteca, instalado ou não, ou busque pelo nome ou AppID.</DialogDescription></DialogHeader><DataState>{open && <AddGameForm onDone={() => onOpenChange(false)} />}</DataState></DialogContent></Dialog>;
}
function GamepadIcon() { return <Plus className="size-6" />; }
function AddGameForm({ onDone }: { onDone: () => void }) {
  const { data: installed } = useSuspenseQuery(installedQuery());
  const { data: games } = useSuspenseQuery(gamesQuery());
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [picked, setPicked] = useState<InstalledGame | undefined>();
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const id = setTimeout(() => setDebounced(search.trim()), 500); return () => clearTimeout(id); }, [search]);
  const store = useQuery({ queryKey: ["store-search", debounced], queryFn: () => searchGames(debounced), enabled: debounced.length >= 2, retry: false, staleTime: 60_000 });
  const [totalHours, setTotalHours] = useState("50");
  const [edited, setEdited] = useState(false);
  const queryClient = useQueryClient();
  const template = useQuery({ queryKey: ["template", selected], queryFn: () => getTemplate(selected), enabled: !!selected, retry: 1 });
  useEffect(() => { if (template.data && !edited) setTotalHours(String(template.data.horas_sugeridas)); }, [template.data, edited]);
  const mutation = useMutation({ mutationFn: addGame,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["games"] });
      const previous = queryClient.getQueryData<Game[]>(["games"]);
      const game = installed.find((item) => item.appid === input.appid) || (picked?.appid === input.appid ? picked : undefined);
      if (game) queryClient.setQueryData<Game[]>(["games"], (current) => [...(current || []), { appid: game.appid, nome: game.nome, estado: game.tem_gabarito ? "parado" : "gerando_gabarito", elapsed_s: 0, total_s: input.horas * 3600, restantes: template.data?.conquistas.length || 0, total_conquistas: template.data?.conquistas.length || 0 }]);
      return { previous };
    },
    onError: (error, _variables, context) => { if (context?.previous) queryClient.setQueryData(["games"], context.previous); toast.error(error.message); },
    onSuccess: () => { toast.success("Jogo adicionado ao painel"); onDone(); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["games"] }); queryClient.invalidateQueries({ queryKey: ["installed"] }); },
  });
  const available = installed.filter((game) => !games.some((item) => item.appid === game.appid) && game.nome.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const fromStore = (store.data ?? []).filter((game) => !games.some((item) => item.appid === game.appid) && !available.some((item) => item.appid === game.appid));
  const selectedGame = installed.find((game) => game.appid === selected) || (picked?.appid === selected ? picked : undefined);
  const choose = (game: InstalledGame) => { setSelected(game.appid); setPicked(game); setEdited(false); };
  return <form onSubmit={(event) => { event.preventDefault(); if (selected && Number(totalHours) > 0) mutation.mutate({ appid: selected, horas: Number(totalHours), ...(selectedGame ? { nome: selectedGame.nome } : {}) }); }} className="grid gap-5 mt-2">
    <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Buscar jogo" placeholder="Buscar na biblioteca, por nome ou AppID..." className="pl-10 h-10" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    <div className="flex justify-between text-[10px] text-muted-foreground px-3"><span>SUA BIBLIOTECA</span><span>GABARITO</span></div>
    <div className="installed-list">{available.length === 0 ? <EmptyState title="Nenhum jogo disponível" description={search ? "Nenhum jogo corresponde à busca." : "Todos os jogos instalados já estão no painel."} /> : available.map((game) => <Button key={game.appid} type="button" variant="ghost" className="installed-row" data-selected={selected === game.appid} onClick={() => choose(game)}><img src={gameArt(game.appid)} alt="" /><span className="flex-1 text-xs font-semibold">{game.nome}{game.instalado === false && <span className="ml-2 text-[10px] font-normal text-muted-foreground">não instalado</span>}</span><span className={`text-[10px] flex gap-1 items-center ${game.tem_gabarito ? "text-success" : "text-warning"}`}>{game.tem_gabarito ? <Check className="size-3" /> : <Sparkles className="size-3" />}{game.tem_gabarito ? "Sim" : "Será gerado"}</span></Button>)}</div>
    {debounced.length >= 2 && <div className="grid gap-2"><div className="flex justify-between text-[10px] text-muted-foreground px-3"><span>RESULTADOS DA LOJA STEAM</span>{store.isFetching && <LoaderCircle className="size-3 animate-spin text-primary" />}</div>{store.isError ? <p className="text-xs text-warning px-3">{store.error instanceof Error ? store.error.message : "Não consegui buscar na loja."}</p> : fromStore.length === 0 && !store.isFetching ? <p className="text-xs text-muted-foreground px-3">Nada novo encontrado na loja.</p> : <div className="installed-list">{fromStore.map((game) => <Button key={game.appid} type="button" variant="ghost" className="installed-row" data-selected={selected === game.appid} onClick={() => choose(game)}><img src={gameArt(game.appid)} alt="" /><span className="flex-1 text-xs font-semibold">{game.nome}<span className="ml-2 text-[10px] font-normal text-muted-foreground">AppID {game.appid}</span></span><span className={`text-[10px] flex gap-1 items-center ${game.tem_gabarito ? "text-success" : "text-warning"}`}>{game.tem_gabarito ? <Check className="size-3" /> : <Sparkles className="size-3" />}{game.tem_gabarito ? "Sim" : "Será gerado"}</span></Button>)}</div>}</div>}
    <div className="form-field border-t border-border pt-5"><label className="form-label" htmlFor="plan-hours">Total de horas do plano</label><div className="flex items-center gap-3"><Input id="plan-hours" type="number" min="0.1" step="0.1" required className="max-w-36 h-10" value={totalHours} onChange={(event) => { setTotalHours(event.target.value); setEdited(true); }} /><span className="text-xs text-muted-foreground">horas</span>{template.isFetching && <LoaderCircle className="size-4 animate-spin text-primary" />}</div>{template.isError ? <p className="text-xs text-warning">Sugestão indisponível. Informe o total de horas.</p> : <p className="form-hint">{selectedGame ? `${template.data?.horas_sugeridas ?? "—"}h sugeridas para ${selectedGame.nome}` : "Selecione um jogo para ver as horas sugeridas."}</p>}</div>
    <div className="flex justify-end gap-2 border-t border-border pt-5"><Button type="button" variant="subtle" onClick={onDone}>Cancelar</Button><Button type="submit" variant="cyan" disabled={!selected || Number(totalHours) <= 0 || mutation.isPending}>{mutation.isPending ? <LoaderCircle className="animate-spin" /> : <Plus />}Adicionar</Button></div>
  </form>;
}