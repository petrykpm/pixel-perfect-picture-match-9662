import { useState } from "react";
import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Save, PlugZap, LoaderCircle, CheckCircle2, XCircle, FileCode2, Clock3, Radio, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataState, LoadingState } from "@/components/data-state";
import { saveSettings, testConnection, getLocalSettings, USE_MOCK, type Settings } from "@/lib/api";
import { settingsQuery } from "@/lib/queries";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações | Gerenciador de Conquistas" }, { name: "description", content: "Configure o programa local, a duração das sessões e a conexão da API." }, { property: "og:title", content: "Configurações | Gerenciador de Conquistas" }, { property: "og:description", content: "Ajuste a conexão e as sessões ao seu ritmo." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  loader: ({ context }) => { if (typeof window !== "undefined") void context.queryClient.ensureQueryData(settingsQuery()).catch(() => {}); },
  component: SettingsPage,
});
function SettingsPage() { return <><h1 className="page-title">Configurações</h1><p className="page-subtitle">Seu programa local, do seu jeito.</p><ClientOnly fallback={<LoadingState />}><DataState><SettingsLoader /></DataState></ClientOnly></>; }
function SettingsLoader() {
  const query = useQuery(settingsQuery());
  if (query.isPending) return <LoadingState />;
  return <>{query.isError && <div className="flex flex-wrap gap-3 items-center mt-6 text-warning text-xs" role="alert"><XCircle className="size-4" /><span>Configurações locais indisponíveis. Você ainda pode corrigir a URL da API.</span><Button variant="subtle" size="sm" onClick={() => query.refetch()}>Tentar de novo</Button></div>}<SettingsContent initial={query.data || getLocalSettings()} /></>;
}
function SettingsContent({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState<Settings>(initial);
  const [baseline, setBaseline] = useState<Settings>(initial);
  const [testResult, setTestResult] = useState<{ success: boolean; text: string } | null>(null);
  const queryClient = useQueryClient();
  const dirty = JSON.stringify(settings) !== JSON.stringify(baseline);
  const save = useMutation({ mutationFn: saveSettings,
    onMutate: async (value) => { await queryClient.cancelQueries({ queryKey: ["settings"] }); const previous = queryClient.getQueryData<Settings>(["settings"]); queryClient.setQueryData(["settings"], value); return { previous }; },
    onError: (error, _value, context) => { if (context?.previous) queryClient.setQueryData(["settings"], context.previous); toast.error(error.message); },
    onSuccess: (_data, value) => { setBaseline(value); toast.success("Configurações salvas"); queryClient.invalidateQueries(); },
  });
  const test = useMutation({ mutationFn: testConnection, onMutate: () => setTestResult(null), onSuccess: (result) => setTestResult({ success: true, text: result.mock ? "Demonstração conectada. O programa real não foi testado." : "Programa local conectado com sucesso." }), onError: () => setTestResult({ success: false, text: "Não foi possível conectar. Verifique a URL e abra o programa local." }) });
  return <form className="settings-form" onSubmit={(event) => { event.preventDefault(); save.mutate(settings); }}>
    {USE_MOCK && <div className="flex items-center gap-2.5 text-primary bg-info-soft border border-primary/15 rounded-md px-4 py-3 text-xs mb-3"><Info className="size-4 shrink-0" />Modo de demonstração ativo</div>}
    <section className="settings-section"><div><h2 className="text-xs font-semibold flex gap-2 items-center"><FileCode2 className="size-4 text-primary" />Biblioteca Steam</h2><p className="form-hint mt-2">Arquivo utilizado pelo programa local.</p></div><div className="form-field"><label className="form-label" htmlFor="dll">Caminho do steam_api64.dll</label><Input id="dll" value={settings.dll} required onChange={(event) => setSettings({ ...settings, dll: event.target.value })} className="h-10 font-mono text-xs" /><p className="form-hint">Caminho completo no seu PC.</p></div></section>
    <section className="settings-section"><div><h2 className="text-xs font-semibold flex gap-2 items-center"><Clock3 className="size-4 text-warning" />Duração da sessão</h2><p className="form-hint mt-2">Limite de horas por execução.</p></div><div className="form-field"><label className="form-label" htmlFor="session-hours">Horas por sessão</label><div className="flex gap-3 items-center"><Input id="session-hours" type="number" min="0" step="0.5" required className="max-w-28 h-10" value={settings.sessao_horas} onChange={(event) => setSettings({ ...settings, sessao_horas: Number(event.target.value) })} /><span className="text-xs text-muted-foreground">horas</span>{settings.sessao_horas === 0 && <span className="status-badge rodando">Sem limite</span>}</div><p className="form-hint">0 = sem limite de sessão.</p></div></section>
    <section className="settings-section"><div><h2 className="text-xs font-semibold flex gap-2 items-center"><Radio className="size-4 text-success" />Conexão local</h2><p className="form-hint mt-2">Endereço do programa no seu PC.</p></div><div className="form-field"><label className="form-label" htmlFor="api-url">URL da API local</label><Input id="api-url" type="url" required value={settings.api_url} onChange={(event) => { setSettings({ ...settings, api_url: event.target.value }); setTestResult(null); }} className="h-10 font-mono text-xs" /><Button variant="subtle" type="button" className="w-fit mt-2" disabled={test.isPending || !settings.api_url} onClick={() => test.mutate(settings.api_url)}>{test.isPending ? <LoaderCircle className="animate-spin" /> : <PlugZap />}Testar conexão</Button>{testResult && <p role="status" className={`flex gap-2 text-xs items-start mt-2 ${testResult.success ? "text-success" : "text-destructive"}`}>{testResult.success ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}{testResult.text}</p>}</div></section>
    <div className="flex justify-between gap-4 items-center mt-7"><span className="text-[10px] text-muted-foreground">{dirty ? "Alterações não salvas" : "Todas as alterações salvas"}</span><Button variant="cyan" type="submit" disabled={!dirty || save.isPending}>{save.isPending ? <LoaderCircle className="animate-spin" /> : <Save />}Salvar alterações</Button></div>
  </form>;
}