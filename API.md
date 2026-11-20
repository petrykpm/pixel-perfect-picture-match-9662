# API local — Gerenciador de Conquistas

Interface React + TypeScript em pt-BR. O front-end não desbloqueia conquistas: todas as operações reais são responsabilidade do programa local.

## Conexão

- URL padrão: `http://localhost:8765`. Pode ser alterada em **Configurações**.
- Todo acesso está centralizado em `src/lib/api.ts`.
- `VITE_USE_MOCK=true` ativa exemplos interativos. Defina `VITE_USE_MOCK=false` no ambiente de execução/compilação para usar a API real, sem alterar telas.
- O desenvolvimento inclui `.env.development` com o mock habilitado. Em produção, a ausência da variável também usa exemplos por segurança.
- As consultas usam React Query e polling de **1,5 segundo**, com timeout de 4 segundos e uma repetição em caso de falha.
- A URL fica salva neste navegador. Dados de demonstração ficam apenas na sessão da aba. Os dados reais pertencem ao programa local.
- Chamadas partem exclusivamente do navegador; `localhost` sempre significa o PC do usuário, nunca o servidor que hospeda o site.

## Endpoints

Todos retornam JSON, exceto ações que podem retornar `204 No Content`. Corpos de erros usam status HTTP não-2xx. Não há login.

| Método | Endpoint | Corpo | Retorno |
|---|---|---|---|
| GET | `/jogos` | — | `Game[]` |
| POST | `/jogos/{appid}/iniciar` | — | 204 ou JSON |
| POST | `/jogos/{appid}/pausar` | — | 204 ou JSON |
| DELETE | `/jogos/{appid}` | — | 204 ou JSON |
| GET | `/jogos/{appid}/conquistas` | — | `Achievement[]` |
| GET | `/jogos/{appid}/log` | — | `string[]` |
| GET | `/instalados` | — | `InstalledGame[]` (instalados e não instalados; campo `instalado`) |
| GET | `/buscar?q=` | — | `InstalledGame[]` (busca na loja Steam por nome ou AppID) |
| POST | `/jogos` | `{ "appid": "367520", "horas": 85, "nome": "opcional" }` | 204 ou JSON |
| GET | `/gabaritos/{appid}` | — | `Template` |
| PUT | `/gabaritos/{appid}` | `Template` | 204 ou JSON |
| GET | `/config` | — | `Settings` |
| PUT | `/config` | `Settings` | 204 ou JSON |

`POST /jogos` gera o gabarito quando necessário. A resposta de `/jogos` deve refletir `gerando_gabarito` enquanto trabalha. Duplicatas e horas não positivas devem ser rejeitadas. A posição enviada no gabarito é sempre calculada na ordem atual, começando em 1.

## Tipos

```ts
type Game = {
  appid: string;
  nome: string;
  estado: "rodando" | "pausado" | "parado" | "sessao_concluida" |
    "concluido" | "gerando_gabarito" | "erro";
  erro?: string;
  elapsed_s: number;
  total_s: number;
  restantes: number;
  total_conquistas: number;
  proxima?: string;
  falta_min?: number;
  ultima?: string;
};
type Achievement = {
  id: string; nome: string; descricao?: string; pos: number;
  agendada_s?: number; concluida: boolean;
};
type InstalledGame = { appid: string; nome: string; tem_gabarito: boolean };
type Settings = { dll: string; sessao_horas: number; api_url: string };
type Template = {
  appid: string; nome: string; horas_sugeridas: number;
  conquistas: { id: string; nome: string; pos: number }[];
};
```

`sessao_horas: 0` significa **sem limite**. Total do plano precisa ser maior que zero.

## Atividade e resumo do dia

Não há endpoint adicional. A interface consulta os logs documentados e deriva os eventos. Para fornecer o número exato de conquistas desbloqueadas hoje, o programa deve enviar linhas com data ISO e tipo:

```text
[2026-11-16T23:20:00.000Z] DESBLOQUEADA · Release
[2026-11-16T23:25:00.000Z] SESSÃO · Sessão concluída
```

Outras linhas aparecem no log, mas não são contadas no resumo. O dia é o dia local do usuário. Horas simuladas somam `elapsed_s` de todos os jogos. A demonstração tem três jogos e eventos ilustrativos.

## Segurança e acesso ao PC

- Vincule a API ao loopback (`127.0.0.1`), não exponha operações Steam publicamente.
- Configure CORS com as origens explícitas autorizadas. Responda ao preflight `OPTIONS` e permita `GET, POST, PUT, DELETE` e `Content-Type`.
- Navegadores podem solicitar permissão de acesso à rede local. HTTPS acessando HTTP e políticas de rede privada podem bloquear chamadas dependendo do navegador. Se necessário, use um certificado HTTPS local confiável ou abra a interface em uma origem local compatível.
- O botão **Testar conexão** consulta `GET /config` na URL digitada. No mock ele verifica somente a demonstração e informa isso; não comprova um programa externo.
- Se não for possível alcançar a API real, aparece o banner: “Programa local desconectado. Abra o Gerenciador de Conquistas no PC.”
- Capas oficiais dos jogos de exemplo foram obtidas da URL `https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg` e são servidas como assets do projeto. Jogos desconhecidos mostram um ícone quando não há asset disponível.