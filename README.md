# Gerenciador de Conquistas

Painel web + programa local para desbloquear as conquistas de um jogo da Steam **aos poucos**, simulando uma sessão de jogo. Cada jogo segue um _gabarito_ (a ordem e o ritmo de progressão), e o progresso fica salvo entre as sessões.

Tudo roda no seu computador. Nada é enviado para a internet, e o painel só conversa com o programa em `localhost`.

## Como funciona

| Parte | Onde | O que faz |
| --- | --- | --- |
| Painel (front) | `src/` | Interface em React + TanStack Start, em modo SPA. Atualiza a cada 1,5 s. |
| Programa local | `programa/conquistas_app.py` | Serve o painel e a API (`API.md`), e roda um processo por jogo que desbloqueia as conquistas pela Steam (`steam_api64.dll`). |
| Gabaritos | `programa/gabaritos/*.json` | Lista de conquistas de cada jogo, na ordem e com o tempo relativo de cada uma. |

## Requisitos

- Windows, com **Python 3.10+** instalado.
- **Steam aberta e logada** com a conta que tem o jogo.
- O `steam_api64.dll` de um jogo da sua biblioteca, de versão recente (o programa avisa se for antigo).
- Para gerar o painel a partir do código: [Bun](https://bun.sh) (ou Node 20+).

## Instalação

```sh
bun install
bun run empacotar   # compila o painel e copia para programa/web
```

Depois, na pasta `programa/`:

1. Dê um duplo clique em **`ABRIR.bat`**. O programa roda em segundo plano, sem janela de terminal, e abre o painel em <http://localhost:8765>.
2. Um ícone aparece perto do relógio, com "Abrir painel" e "Sair".
3. Em **Configurações**, informe o caminho do `steam_api64.dll` e as horas por sessão (`0` = sem limite).
4. Clique em **Adicionar jogo**, escolha o jogo e o total de horas do plano.

Você pode fechar o navegador: o programa continua rodando. Para encerrar, use `SAIR.bat` ou "Sair" no ícone. Isso pausa todos os jogos e salva o progresso.

Opcional: `INICIAR-COM-WINDOWS.bat` faz o programa abrir sozinho quando o PC liga. `build.bat` gera um `ConquistasManager.exe`.

## Gabaritos

Um gabarito é um arquivo JSON em `programa/gabaritos/`:

```json
{
  "appid": 367520,
  "nome": "Hollow Knight",
  "horas_sugeridas": 85,
  "conquistas": [
    { "id": "ID_NA_STEAM", "nome": "Nome", "descricao": "Opcional", "pos": 0.03 }
  ]
}
```

- `id` é o nome interno da conquista na Steam.
- `pos` vai de 0 a 1 e indica em que ponto do plano ela é desbloqueada.
- A página **Gabaritos** do painel permite reordenar as conquistas. O novo tempo vale para o que ainda está pendente.
- O repositório inclui o de Hollow Knight (63 conquistas).

## Dados e arquivos locais

Ficam ao lado do programa e não vão para o git:

- `plano_APPID.json`: plano e progresso de cada jogo.
- `estado/`: situação atual e log de cada jogo.
- `backup/`: cópia do plano quando um jogo é removido.
- `config.json`: caminho da DLL e horas por sessão.

## Desenvolvimento

```sh
bun run dev        # painel com dados de exemplo (VITE_USE_MOCK=true)
bun run test       # testes
bun run lint
bun run build      # build de produção (usa o programa local, sem mock)
```

- `.env.development` usa dados de exemplo, sem precisar do programa local.
- `.env.production` liga a API real (`VITE_USE_MOCK=false`).
- O contrato entre painel e programa está em [`API.md`](API.md). Veja também [`roadmap.md`](roadmap.md).

## Segurança

O servidor escuta só em `127.0.0.1`, aceita apenas os hosts `localhost` e `127.0.0.1`, valida a origem das requisições e exige JSON nos corpos de `POST` e `PUT`.

## Limites conhecidos

- O fluxo completo foi testado com uma Steam simulada; use por sua conta e risco. Desbloquear conquistas por programa pode ir contra os termos de uso da Steam.
- A Steam precisa estar aberta e o PC ligado durante a sessão.
- Quando o PC é suspenso, o tempo parado não conta no plano.
