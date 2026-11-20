# Gerenciador de Conquistas

Painel web + programa local para desbloquear as conquistas de um jogo da Steam **aos poucos**, simulando uma sessão de jogo. Cada jogo segue um _gabarito_ (a ordem e o ritmo de progressão), e o progresso fica salvo entre as sessões.

Tudo roda no seu computador. Nada é enviado para a internet, e o painel só conversa com o programa em `localhost`.

## Como funciona

| Parte | Onde | O que faz |
| --- | --- | --- |
| Painel (front) | `src/` | Interface em React + TanStack Start, em modo SPA. Atualiza a cada 1,5 s. |
| Programa local | `programa/conquistas_app.py` | Serve o painel e a API (`API.md`), e roda um processo por jogo que desbloqueia as conquistas pela Steam (`steam_api64.dll`). |
| Gabaritos | `programa/gabaritos/*.json` | Lista de conquistas de cada jogo, na ordem e com o tempo relativo de cada uma. |

## Instalar (programa normal do Windows)

A forma mais simples é o instalador, que não precisa de Python nem de terminal:

1. Baixe o `GerenciadorConquistas-Setup-X.Y.Z.exe` na aba **Releases** do repositório (ou em **Actions → Instalador Windows → Artifacts**).
2. Execute e siga o assistente. Ele instala só para o seu usuário, sem pedir administrador, e cria o atalho no Menu Iniciar. Atalho na área de trabalho e "Iniciar com o Windows" são opcionais.
3. Abra o **Gerenciador de Conquistas**. O painel abre numa janela própria (usa o Edge ou o Chrome em modo aplicativo, sem abas nem barra de endereço) e o programa roda em segundo plano, com um ícone perto do relógio ("Abrir painel", "Abrir pasta de dados", "Sair"). O endereço continua sendo <http://localhost:8765>.
4. Em **Configurações**, informe o caminho do `steam_api64.dll` e as horas por sessão (`0` = sem limite).
5. Clique em **Adicionar jogo**, escolha o jogo e o total de horas do plano.

Requisitos: Windows 10/11 e **Steam aberta e logada** com a conta que tem o jogo. O `steam_api64.dll` precisa ser de um jogo da sua biblioteca, de versão recente (o programa avisa se for antigo).

Seus dados (planos, progresso, configurações, gabaritos) ficam em `%APPDATA%\Gerenciador de Conquistas`. Desinstalar não apaga essa pasta. Na primeira execução, o programa importa sozinho o progresso e as configurações da versão antiga em `C:\conquistas` (fica com o plano mais adiantado).

Você pode fechar o navegador: o programa continua rodando até você escolher **Sair** no ícone da bandeja, que pausa tudo e salva o progresso.

### Jogos sem instalar

Você não precisa instalar o jogo. A lista mostra toda a sua biblioteca (marcando os não instalados) e a busca encontra qualquer jogo por nome ou AppID.

- Para listar a biblioteca inteira, deixe **Detalhes dos jogos** como **Público** no perfil da Steam.
- O programa usa o `steam_api64.dll` da Steam; na primeira vez ele é copiado de qualquer jogo instalado e guardado na pasta de dados.
- A Steam precisa estar aberta e logada na conta que possui o jogo.

### Gerar o instalador

- **Pelo GitHub (recomendado):** em **Actions → Instalador Windows → Run workflow**, ou crie uma tag (`git tag v1.0.0 && git push --tags`) e o instalador é anexado à Release.
- **No seu PC:** instale Python 3.10+, [Bun](https://bun.sh) e o [Inno Setup 6](https://jrsoftware.org/isdl.php); rode `bun install && bun run empacotar` e depois `programa\build.bat`. O instalador sai em `programa\saida`.

## Rodar sem instalar (a partir do código)

Precisa de Python 3.10+ e Bun.

```sh
bun install
bun run empacotar   # compila o painel e copia para programa/web
```

Na pasta `programa/`, dê um duplo clique em `ABRIR.bat` (roda sem janela de terminal; `SAIR.bat` encerra). `INICIAR-COM-WINDOWS.bat` faz abrir sozinho ao ligar o PC.

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

Na versão instalada ficam em `%APPDATA%\\Gerenciador de Conquistas`; rodando do código, ficam ao lado do programa (e não vão para o git):

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

- O servidor escuta só em `127.0.0.1` (nunca na rede) e confere o `Host`, o que bloqueia ataques de DNS rebinding.
- Só o próprio painel (mesma porta) pode usar a API: requisições de outros sites ou de outras portas locais recebem 403. Em desenvolvimento, libere uma origem extra com `CONQUISTAS_ORIGENS=http://localhost:5173`.
- Os corpos de `POST` e `PUT` precisam ser JSON, com limite de 1 MB, e o `Content-Length` é validado.
- Os arquivos do painel são servidos só de dentro da pasta `web` (protegido contra `..`), com `X-Frame-Options: DENY`, `nosniff` e `frame-ancestors 'none'`.
- Os `AppID` são validados como números antes de virarem nomes de arquivo, e o caminho da DLL só é aceito se o arquivo se chamar `steam_api64.dll` e for um SDK compatível.
- Nada sai do seu computador, exceto as capas dos jogos (CDN da Steam) e as fontes do Google.
- O instalador roda sem administrador e ainda não é assinado digitalmente.

## Limites conhecidos

- O fluxo completo foi testado com uma Steam simulada; use por sua conta e risco. Desbloquear conquistas por programa pode ir contra os termos de uso da Steam.
- A Steam precisa estar aberta e o PC ligado durante a sessão.
- O instalador e o executável ainda não são assinados digitalmente, então o Windows SmartScreen pode avisar na primeira execução ("Mais informações → Executar assim mesmo").
- Quando o PC é suspenso, o tempo parado não conta no plano.
