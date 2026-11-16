import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ActivityList } from "@/components/activity-list";
import { DataState, LoadingState, EmptyState } from "@/components/data-state";
import { activityQuery } from "@/lib/queries";

export const Route = createFileRoute("/atividade")({
  head: () => ({ meta: [{ title: "Atividade | Gerenciador de Conquistas" }, { name: "description", content: "Histórico de conquistas desbloqueadas e sessões dos seus jogos." }, { property: "og:title", content: "Atividade | Gerenciador de Conquistas" }, { property: "og:description", content: "Cada conquista merece ser registrada." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  loader: ({ context }) => { if (typeof window !== "undefined") void context.queryClient.ensureQueryData(activityQuery()).catch(() => {}); },
  component: ActivityPage,
});
function ActivityPage() { return <><h1 className="page-title">Atividade</h1><p className="page-subtitle">O histórico da sua jornada, conquista por conquista.</p><ClientOnly fallback={<LoadingState />}><DataState><ActivityContent /></DataState></ClientOnly></>; }
function ActivityContent() { const { data: events } = useSuspenseQuery(activityQuery()); return <section className="mt-8 max-w-4xl">{events.length === 0 ? <EmptyState title="Sua jornada começa aqui" description="As próximas conquistas e sessões aparecerão nesta lista." /> : <ActivityList events={events} />}</section>; }