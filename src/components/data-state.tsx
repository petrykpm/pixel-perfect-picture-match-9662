import { Component, Suspense, type ReactNode } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, RefreshCw, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadingState() {
  return <div role="status" aria-label="Carregando" className="py-12"><div className="flex items-center gap-3 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /><span className="text-xs">Carregando...</span></div><div className="game-grid">{[1,2,3].map((item) => <div key={item} className="h-72 loading-shimmer" />)}</div></div>;
}
export function EmptyState({ title = "Nenhum jogo por aqui", description, children }: { title?: string; description?: string; children?: ReactNode }) {
  return <div className="empty-state"><Gamepad2 className="size-9" /><h2 className="text-lg font-semibold">{title}</h2>{description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}{children}</div>;
}
class DataErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override render() {
    if (this.state.error) return <div className="empty-state" role="alert"><AlertCircle className="size-9 text-warning" /><h2 className="text-lg font-semibold">Não foi possível carregar os dados</h2><p className="max-w-md text-xs text-muted-foreground">{this.state.error.message}</p><Button variant="subtle" onClick={() => { this.props.onReset(); this.setState({ error: null }); }}><RefreshCw />Tentar de novo</Button></div>;
    return this.props.children;
  }
}
export function DataState({ children }: { children: ReactNode }) {
  return <QueryErrorResetBoundary>{({ reset }) => <DataErrorBoundary onReset={reset}><Suspense fallback={<LoadingState />}>{children}</Suspense></DataErrorBoundary>}</QueryErrorResetBoundary>;
}