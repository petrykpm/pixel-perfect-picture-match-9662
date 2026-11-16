import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trophy, LayoutDashboard, ListOrdered, Activity, Settings, Menu, X, ChevronRight, Bell, Radio, ExternalLink, Unplug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gamesQuery } from "@/lib/queries";
import { isConnected, USE_MOCK } from "@/lib/api";
import { gameArt } from "@/lib/game-art";

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  useEffect(() => setHydrated(true), []);
  useEffect(() => setMenuOpen(false), [location.pathname]);
  const games = useQuery({ ...gamesQuery(), enabled: hydrated });
  const queryClient = useQueryClient();
  const disconnected = hydrated && !isConnected();
  const nav = [{ to: "/" as const, name: "Painel", icon: LayoutDashboard }, { to: "/gabaritos" as const, name: "Gabaritos", icon: ListOrdered }, { to: "/atividade" as const, name: "Atividade", icon: Activity }, { to: "/configuracoes" as const, name: "Configurações", icon: Settings }];
  const current = nav.find((item) => item.to === location.pathname)?.name || (location.pathname.startsWith("/gabarito/") ? "Editor de gabarito" : "Detalhes do jogo");
  return <div className="app-shell">
    {menuOpen && <div className="mobile-scrim" onClick={() => setMenuOpen(false)} />}
    <aside className="app-sidebar" data-open={menuOpen} aria-label="Navegação principal"><Link to="/" className="brand"><span className="brand-mark"><Trophy className="size-5" strokeWidth={1.7} /></span><span className="brand-name">Gerenciador<span>de Conquistas</span></span></Link>
      <nav className="sidebar-nav">{nav.map((item) => <Button key={item.to} variant="nav" asChild className="nav-item" data-active={item.to === location.pathname || (item.to === "/gabaritos" && location.pathname.startsWith("/gabarito/"))}><Link to={item.to}><item.icon className="size-4" />{item.name}{item.to === location.pathname && <span className="nav-indicator" />}</Link></Button>)}</nav>
      <div className="sidebar-section-label">SUA BIBLIOTECA</div><div className="library-list">{games.data?.map((game) => <Button key={game.appid} variant="nav" asChild className="library-item"><Link to="/jogo/$appid" params={{ appid: game.appid }}><img src={gameArt(game.appid)} className="library-thumb" alt="" /><span className="flex-1 text-left truncate">{game.nome}</span>{game.estado === "rodando" && <span className="status-dot text-success" />}</Link></Button>)}</div>
      <div className="sidebar-bottom"><div className="local-connection"><div className="flex items-center gap-2 text-[10px] font-semibold"><span className={disconnected ? "status-dot text-warning" : "live-dot"} />{disconnected ? "Programa desconectado" : "Programa local conectado"}</div><div className="flex justify-between mt-2.5 text-[9px] text-muted-foreground"><span>{USE_MOCK ? "Modo de demonstração" : "Conexão local"}</span><Radio className="size-3" /></div></div><div className="flex justify-between items-center mt-5 px-1 text-[9px] text-muted-foreground"><span>VERSÃO 1.0.0</span><Trophy className="size-3" /></div></div>
    </aside>
    <header className="app-topbar"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="mobile-menu" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</Button><span className="text-[11px] text-muted-foreground hidden sm:inline">Área de trabalho</span><ChevronRight className="size-3 text-muted-foreground hidden sm:inline" /><span className="text-[11px] font-medium">{current}</span></div><div className="flex gap-5 items-center"><span className="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground"><span className={disconnected ? "status-dot text-warning" : "live-dot"} />{disconnected ? "Desconectado" : "Tudo sincronizado"}</span><div className="h-5 border-l border-border hidden sm:block" /><Button variant="ghost" size="icon" asChild aria-label="Ver atividade recente" title="Atividade recente"><Link to="/atividade"><Bell className="text-muted-foreground" /></Link></Button><span className="grid place-items-center size-8 rounded-md bg-info-soft text-primary text-[10px] font-bold" title="Programa local">GC</span></div></header>
    {disconnected && <div className="connection-banner" role="alert"><Unplug className="size-4 shrink-0" /><span>Programa local desconectado. Abra o Gerenciador de Conquistas no PC.</span><Button variant="subtle" size="sm" onClick={() => { queryClient.resetQueries(); setRetryVersion((version) => version + 1); }} disabled={games.isFetching}><RefreshCw className={games.isFetching ? "animate-spin" : ""} />Tentar de novo</Button></div>}
    <main className="page-content"><div key={retryVersion}>{children}</div><footer className="app-footer"><span>Gerenciador de Conquistas <span className="mx-2">·</span> Seu progresso, no seu ritmo.</span><span className="flex gap-1.5 items-center"><ExternalLink className="size-3" />{USE_MOCK ? "Dados de exemplo" : "Programa local"}<span className="mx-1">·</span>Steam</span></footer></main>
  </div>;
}