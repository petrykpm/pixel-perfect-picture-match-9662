import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { TemplateEditor } from "@/components/template-editor";
import { DataState, LoadingState } from "@/components/data-state";
import { templateQuery } from "@/lib/queries";

export const Route = createFileRoute("/gabarito/$appid")({
  head: ({ params }) => ({ meta: [{ title: `Editor de gabarito ${params.appid} | Gerenciador de Conquistas` }, { name: "description", content: "Organize a ordem de progressão das conquistas e salve seu gabarito." }, { property: "og:title", content: `Editor de gabarito ${params.appid} | Gerenciador de Conquistas` }, { property: "og:description", content: "Seu plano de conquistas, na ordem que você escolher." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  loader: ({ context, params }) => { if (typeof window !== "undefined") void context.queryClient.ensureQueryData(templateQuery(params.appid)).catch(() => {}); },
  component: TemplatePage,
});
function TemplatePage() { const { appid } = Route.useParams(); return <ClientOnly fallback={<LoadingState />}><DataState key={appid}><TemplateEditor key={appid} appid={appid} /></DataState></ClientOnly>; }