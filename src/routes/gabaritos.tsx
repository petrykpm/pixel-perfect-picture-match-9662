import { useState } from "react";
import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ListOrdered, Pencil, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataState, LoadingState, EmptyState } from "@/components/data-state";
import { installedQuery } from "@/lib/queries";
import { gameArt } from "@/lib/game-art";

export const Route = createFileRoute("/gabaritos")({
  head: () => ({ meta: [{ title: "Gabaritos | Gerenciador de Conquistas" }, { name: "description", content: "Biblioteca de gabaritos e planos de conquistas para seus jogos Steam." }, { property: "og:title", content: "Gabaritos | Gerenciador de Conquistas" }, { property: "og:description", content: "Organize a progressão dos seus jogos." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  loader: ({ context }) => { if (typeof window !== "undefined") void context.queryClient.ensureQueryData(installedQuery()).catch(() => {}); },
  component: TemplatesPage,
});
function TemplatesPage() { return <><h1 className="page-title">Gabaritos</h1><p className="page-subtitle">Cada jogo, um caminho para completar.</p><ClientOnly fallback={<LoadingState />}><DataState><TemplateList /></DataState></ClientOnly></>; }
function TemplateList() {
  const { data: games } = useSuspenseQuery(installedQuery());
  const [search, setSearch] = useState("");
  const filtered = games.filter((game) => game.nome.toLowerCase().includes(search.toLowerCase()));
  return <><div className="relative max-w-sm mt-7 mb-7"><Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input aria-label="Buscar gabarito" placeholder="Buscar jogo..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-10" /></div>{filtered.length === 0 ? <EmptyState title="Nenhum gabarito encontrado" /> : <div className="game-grid">{filtered.map((game) => <article key={game.appid} className="game-card"><img src={gameArt(game.appid)} alt={`Capa de ${game.nome}`} className="w-full aspect-[460/215] object-cover" /><div className="game-body"><h2 className="game-title">{game.nome}</h2><p className="text-xs text-muted-foreground flex gap-2 items-center mb-5">{game.tem_gabarito ? <ListOrdered className="size-3 text-success" /> : <Sparkles className="size-3 text-warning" />}{game.tem_gabarito ? "Gabarito disponível" : "Será gerado ao adicionar o jogo"}</p><Button variant="subtle" asChild className="w-full" disabled={!game.tem_gabarito}>{game.tem_gabarito ? <Link to="/gabarito/$appid" params={{ appid: game.appid }}><Pencil />Editar gabarito</Link> : <span><Sparkles />Gabarito pendente</span>}</Button></div></article>)}</div>}</>;
}