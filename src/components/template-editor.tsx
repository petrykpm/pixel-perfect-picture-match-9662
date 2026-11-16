import { useEffect, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ArrowUp, ArrowDown, GripVertical, Save, RotateCcw, AlertTriangle, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { normalizePositions, saveTemplate, type Template, type Achievement } from "@/lib/api";
import { templateQuery } from "@/lib/queries";
import { EmptyState } from "./data-state";

type Row = Pick<Achievement, "id" | "nome" | "pos">;
function SortableRow({ item, index, count, onMove }: { item: Row; index: number; count: number; onMove: (index: number, direction: number) => void }) {
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } = useSortable({ id: item.id });
  return <tr ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), ...(transition ? { transition } : {}) }} data-dragging={isDragging}><td className="w-10"><Button variant="ghost" size="icon" className="touch-none text-muted-foreground" title="Reordenar conquista" aria-label={`Reordenar ${item.nome}`} {...attributes} {...listeners}><GripVertical /></Button></td><td className="w-16 text-muted-foreground tabular-nums">{String(item.pos).padStart(2, "0")}</td><td className="font-semibold">{item.nome}</td><td className="achievement-id font-mono text-[10px] text-muted-foreground">{item.id}</td><td className="w-20"><div className="flex"><Button variant="ghost" size="icon" className="size-7" aria-label={`Mover ${item.nome} para cima`} title="Mover para cima" disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp className="size-3" /></Button><Button variant="ghost" size="icon" className="size-7" aria-label={`Mover ${item.nome} para baixo`} title="Mover para baixo" disabled={index === count - 1} onClick={() => onMove(index, 1)}><ArrowDown className="size-3" /></Button></div></td></tr>;
}
export function TemplateEditor({ appid }: { appid: string }) {
  const { data: template } = useSuspenseQuery(templateQuery(appid));
  const [items, setItems] = useState<Row[]>(() => template.conquistas);
  const [baseline, setBaseline] = useState<Row[]>(() => template.conquistas);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const dirty = JSON.stringify(items) !== JSON.stringify(baseline);
  const queryClient = useQueryClient();
  const blocker = useBlocker({ shouldBlockFn: () => dirty, enableBeforeUnload: dirty, withResolver: true });
  useEffect(() => { if (!dirty) { setItems(template.conquistas); setBaseline(template.conquistas); } }, [template.conquistas, dirty]);
  const mutation = useMutation({ mutationFn: (value: Template) => saveTemplate(value),
    onMutate: async (value) => { await queryClient.cancelQueries({ queryKey: ["template", appid] }); const previous = queryClient.getQueryData<Template>(["template", appid]); queryClient.setQueryData(["template", appid], value); return { previous }; },
    onError: (error, _value, context) => { if (context?.previous) queryClient.setQueryData(["template", appid], context.previous); toast.error(error.message); },
    onSuccess: (_result, value) => { setBaseline(value.conquistas); setItems(value.conquistas); toast.success("Gabarito salvo com sucesso"); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["template", appid] }); queryClient.invalidateQueries({ queryKey: ["achievements", appid] }); },
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function dragEnd(event: DragEndEvent) { if (!event.over || event.active.id === event.over.id) return; const oldIndex = items.findIndex((item) => item.id === event.active.id); const newIndex = items.findIndex((item) => item.id === event.over?.id); if (oldIndex >= 0 && newIndex >= 0) setItems(normalizePositions(arrayMove(items, oldIndex, newIndex))); }
  function move(index: number, direction: number) { setItems(normalizePositions(arrayMove(items, index, index + direction))); }
  return <><Button variant="link" asChild className="px-0 text-muted-foreground text-xs mb-5"><Link to="/gabaritos"><ArrowLeft />Gabaritos</Link></Button><div className="page-heading"><div><h1 className="page-title">Gabarito de {template.nome}</h1><p className="page-subtitle">{items.length} conquistas <span className="mx-2">·</span> Plano sugerido de {template.horas_sugeridas}h</p></div><div className="flex gap-2"><Button variant="subtle" disabled={!dirty || mutation.isPending} onClick={() => setConfirmRestore(true)}><RotateCcw />Restaurar</Button><Button variant="cyan" disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate({ ...template, conquistas: normalizePositions(items) })}>{mutation.isPending ? <LoaderCircle className="animate-spin" /> : <Save />}Salvar</Button></div></div>
    {dirty && <div className="mt-6 p-3 rounded-md border border-warning/20 bg-warning-soft text-warning text-xs flex items-center gap-2" role="status"><AlertTriangle className="size-4" />Você tem alterações não salvas.</div>}
    {items.length === 0 ? <EmptyState title="Nenhuma conquista no gabarito" /> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}><table className="template-table"><thead><tr><th /><th>POSIÇÃO</th><th>CONQUISTA</th><th className="achievement-id">ID INTERNO</th><th>ORDEM</th></tr></thead><tbody>{items.map((item, index) => <SortableRow key={item.id} item={item} index={index} count={items.length} onMove={move} />)}</tbody></table></SortableContext></DndContext>}
    <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}><AlertDialogContent className="modal-content"><AlertDialogHeader><AlertDialogTitle>Restaurar a última versão salva?</AlertDialogTitle><AlertDialogDescription>As alterações feitas na ordem das conquistas serão descartadas.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => { setItems(baseline); toast.success("Última versão restaurada"); }}>Restaurar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={blocker.status === "blocked"}><AlertDialogContent className="modal-content"><AlertDialogHeader><AlertDialogTitle>Sair sem salvar?</AlertDialogTitle><AlertDialogDescription>As alterações na ordem das conquistas ainda não foram salvas.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => blocker.reset?.()}>Continuar editando</AlertDialogCancel><AlertDialogAction onClick={() => blocker.proceed?.()}>Descartar e sair</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}