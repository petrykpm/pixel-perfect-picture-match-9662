// Gera o painel (vite build) e copia para programa/web, de onde o programa local o serve.
import { cpSync, rmSync, existsSync } from "node:fs";

const origem = "dist/client";
const destino = "programa/web";
if (!existsSync(origem)) throw new Error("Rode o build antes: " + origem + " não existe.");
rmSync(destino, { recursive: true, force: true });
cpSync(origem, destino, { recursive: true });
rmSync(destino + "/_headers", { force: true });
console.log("Painel copiado para " + destino);
