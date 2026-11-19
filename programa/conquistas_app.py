"""
Gerenciador de Conquistas.

Uso:
    python conquistas_app.py            abre o painel web em http://localhost:8765
    python conquistas_app.py --gui      abre a janela simples (sem o painel)
    python conquistas_app.py --sem-navegador   só sobe o servidor

- Cada jogo roda em um processo separado (a API da Steam aceita um AppID por processo).
- O progresso fica em plano_APPID.json (o mesmo formato do unlock_longo.py).
- Gabaritos (.json) ficam na pasta "gabaritos"; o painel web fica na pasta "web".
- A API só aceita conexões de localhost.
"""
import atexit
import ctypes
import http.server
import json
import os
import random
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser

FROZEN = getattr(sys, "frozen", False)
BASE = os.path.dirname(sys.executable if FROZEN else os.path.abspath(__file__))
GAB_DIR = os.path.join(BASE, "gabaritos")
EST_DIR = os.path.join(BASE, "estado")
CONFIG = os.path.join(BASE, "config.json")
WEB_DIR = os.path.join(BASE, "web")
if not os.path.isdir(WEB_DIR) and getattr(sys, "_MEIPASS", None):
    WEB_DIR = os.path.join(sys._MEIPASS, "web")


def plano_path(appid):
    return os.path.join(BASE, f"plano_{appid}.json")


def estado_path(appid):
    return os.path.join(EST_DIR, f"{appid}.json")


def flag_path(appid):
    return os.path.join(EST_DIR, f"parar_{appid}.flag")


def log_path(appid):
    return os.path.join(EST_DIR, f"log_{appid}.txt")


def escrever_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def ler_json(path, padrao=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return padrao


# ----------------------------------------------------------------------------
# Detecção de jogos instalados na Steam
# ----------------------------------------------------------------------------
IGNORAR = ("redistributable", "steamworks", "proton", "steam linux runtime", "steamvr", "wallpaper engine")


def pastas_steam():
    """Todas as bibliotecas Steam (pastas que contêm 'steamapps')."""
    import re
    raizes = [p for p in os.environ.get("CONQUISTAS_STEAM_LIBS", "").split(os.pathsep) if p]
    if os.name == "nt":
        try:
            import winreg
            for hive, chave in ((winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam"),
                                (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam")):
                try:
                    with winreg.OpenKey(hive, chave) as k:
                        for nome in ("SteamPath", "InstallPath"):
                            try:
                                raizes.append(winreg.QueryValueEx(k, nome)[0])
                            except OSError:
                                pass
                except OSError:
                    pass
        except ImportError:
            pass
    for env in ("ProgramFiles(x86)", "ProgramFiles"):
        if os.environ.get(env):
            raizes.append(os.path.join(os.environ[env], "Steam"))
    # bibliotecas em outros discos (ex: F:\SteamLibrary)
    for letra in "CDEFGHIJKLMNOPQRSTUVWXYZ":
        for nome in ("SteamLibrary", "Steam", "Games\\Steam", "Games\\SteamLibrary"):
            raizes.append(f"{letra}:\\{nome}")
    bibliotecas, vistos = [], set()

    def add(pasta):
        pasta = os.path.normpath(pasta)
        if os.path.isdir(os.path.join(pasta, "steamapps")) and pasta.lower() not in vistos:
            vistos.add(pasta.lower())
            bibliotecas.append(pasta)

    for r in raizes:
        add(r)
    for lib in list(bibliotecas):  # lê libraryfolders.vdf pra achar as outras
        vdf = os.path.join(lib, "steamapps", "libraryfolders.vdf")
        try:
            with open(vdf, encoding="utf-8", errors="ignore") as f:
                for m in re.finditer(r'"path"\s+"([^"]+)"', f.read()):
                    add(m.group(1).replace("\\\\", "\\"))
        except OSError:
            pass
    return bibliotecas


def listar_jogos_instalados(bibliotecas=None):
    """Retorna lista de dicts {appid, nome, pasta} lendo os appmanifest_*.acf."""
    import re
    jogos, vistos = [], set()
    for lib in (bibliotecas if bibliotecas is not None else pastas_steam()):
        apps = os.path.join(lib, "steamapps")
        try:
            arquivos = os.listdir(apps)
        except OSError:
            continue
        for fn in arquivos:
            if not (fn.startswith("appmanifest_") and fn.endswith(".acf")):
                continue
            try:
                with open(os.path.join(apps, fn), encoding="utf-8", errors="ignore") as f:
                    txt = f.read()
            except OSError:
                continue
            mid = re.search(r'"appid"\s+"(\d+)"', txt)
            mnome = re.search(r'"name"\s+"([^"]*)"', txt)
            mdir = re.search(r'"installdir"\s+"([^"]*)"', txt)
            if not (mid and mnome):
                continue
            nome = mnome.group(1)
            if mid.group(1) in vistos or any(x in nome.lower() for x in IGNORAR):
                continue
            vistos.add(mid.group(1))
            pasta = os.path.join(apps, "common", mdir.group(1)) if mdir else ""
            jogos.append({"appid": mid.group(1), "nome": nome, "pasta": pasta})
    return sorted(jogos, key=lambda j: j["nome"].lower())


def dll_compativel(caminho):
    """DLLs de SDKs antigos não têm a API 'flat' que o programa usa. Confere os nomes exportados."""
    try:
        with open(caminho, "rb") as f:
            dados = f.read()
    except OSError:
        return False
    return (b"SteamAPI_ISteamUserStats_RequestCurrentStats" in dados
            and b"SteamAPI_ISteamUserStats_SetAchievement" in dados
            and (b"SteamAPI_InitFlat" in dados or b"SteamAPI_Init" in dados))


def achar_dll(pasta):
    """Procura um steam_api64.dll COMPATÍVEL dentro da pasta do jogo."""
    if not pasta or not os.path.isdir(pasta):
        return None
    for raiz, _, arqs in os.walk(pasta):
        for a in arqs:
            if a.lower() == "steam_api64.dll":
                c = os.path.join(raiz, a)
                if dll_compativel(c):
                    return c
    return None


def achar_dll_qualquer(jogos):
    """Qualquer steam_api64.dll compatível serve: pega a primeira que achar entre os jogos instalados."""
    for j in jogos:
        d = achar_dll(j["pasta"])
        if d:
            return d
    return None


def achar_gabarito(appid):
    """Procura na pasta gabaritos um .json cujo appid bate."""
    try:
        nomes = os.listdir(GAB_DIR)
    except OSError:
        return None
    for fn in nomes:
        if fn.endswith(".json"):
            g = ler_json(os.path.join(GAB_DIR, fn))
            if isinstance(g, dict) and str(g.get("appid")) == str(appid) and "conquistas" in g:
                return os.path.join(GAB_DIR, fn)
    return None


# ----------------------------------------------------------------------------
# Lógica do plano (pura, sem Steam)
# ----------------------------------------------------------------------------
def montar_agenda(faltam, posg, duracao):
    """Retorna {id: segundos}. Mantém a ordem do gabarito; reescala pras conquistas que faltam."""
    com = sorted((n for n in faltam if n in posg), key=lambda n: posg[n])
    sem = [n for n in faltam if n not in posg]
    if len(com) > 1:
        lo, hi = posg[com[0]], posg[com[-1]]
        esc = [0.02 + 0.96 * ((posg[n] - lo) / ((hi - lo) or 1)) for n in com]
    else:
        esc = [0.5] * len(com)
    esc += [0.98] * len(sem)
    tempos, anterior = [], 0.0
    for e in esc:
        t = max(anterior + 60, e * duracao + random.uniform(-0.004, 0.004) * duracao)
        tempos.append(min(t, duracao - 60))
        anterior = t
    tempos.sort()
    return dict(zip(com + sem, tempos))


# ----------------------------------------------------------------------------
# Acesso à Steam: real (steam_api64.dll) e simulado (só para testes automatizados)
# ----------------------------------------------------------------------------
class RealSteam:
    def __init__(self, dll_path, appid):
        dll_path = os.path.abspath(dll_path or "")
        if not os.path.exists(dll_path):
            sys.exit("steam_api64.dll não encontrada. Ajuste o caminho nas Configurações.")
        if not dll_compativel(dll_path):
            sys.exit("steam_api64.dll de SDK antigo (sem a API necessária). Use a do Hollow Knight.")
        work = os.path.join(EST_DIR, f"work_{appid}")
        os.makedirs(work, exist_ok=True)
        os.chdir(work)
        with open("steam_appid.txt", "w") as f:
            f.write(appid)
        os.environ["SteamAppId"] = appid
        os.environ["SteamGameId"] = appid
        self.api = ctypes.CDLL(dll_path)
        self.stats = None

    def init(self):
        api = self.api
        ok = False
        if hasattr(api, "SteamAPI_InitFlat"):
            api.SteamAPI_InitFlat.restype = ctypes.c_int
            err = ctypes.create_string_buffer(1024)
            ok = api.SteamAPI_InitFlat(err) == 0
            if not ok:
                print("Erro ao iniciar:", err.value.decode(errors="ignore"))
        elif hasattr(api, "SteamAPI_Init"):
            api.SteamAPI_Init.restype = ctypes.c_bool
            ok = api.SteamAPI_Init()
        if not ok:
            sys.exit("Falha ao iniciar a Steam API. A Steam está aberta e logada? AppID certo?")
        for v in range(15, 9, -1):
            fn = getattr(api, f"SteamAPI_SteamUserStats_v{v:03d}", None)
            if fn:
                fn.restype = ctypes.c_void_p
                self.stats = fn()
                if self.stats:
                    break
        if not self.stats:
            sys.exit("Não consegui acessar ISteamUserStats (DLL incompatível).")

        p = ctypes.c_void_p
        U = "SteamAPI_ISteamUserStats_"

        def F(nome, argtypes, restype=None):
            fn = getattr(api, U + nome)
            fn.argtypes = argtypes
            if restype is not None:
                fn.restype = restype
            return fn

        self._Req = F("RequestCurrentStats", [p])
        self._Num = F("GetNumAchievements", [p], ctypes.c_uint32)
        self._Name = F("GetAchievementName", [p, ctypes.c_uint32], ctypes.c_char_p)
        self._Get = F("GetAchievement", [p, ctypes.c_char_p, ctypes.POINTER(ctypes.c_bool)])
        self._Set = F("SetAchievement", [p, ctypes.c_char_p], ctypes.c_bool)
        self._Store = F("StoreStats", [p], ctypes.c_bool)
        self._ReqPct = F("RequestGlobalAchievementPercentages", [p], ctypes.c_uint64)
        self._Pct = F("GetAchievementAchievedPercent", [p, ctypes.c_char_p, ctypes.POINTER(ctypes.c_float)])
        self._Attr = F("GetAchievementDisplayAttribute", [p, ctypes.c_char_p, ctypes.c_char_p], ctypes.c_char_p)

    def request_stats(self):
        self._Req(self.stats)
        for _ in range(30):
            self.api.SteamAPI_RunCallbacks()
            time.sleep(0.1)

    def run_callbacks(self):
        self.api.SteamAPI_RunCallbacks()

    def names(self):
        return [self._Name(self.stats, i).decode() for i in range(self._Num(self.stats))]

    def has(self, n):
        got = ctypes.c_bool(False)
        self._Get(self.stats, n.encode(), ctypes.byref(got))
        return got.value

    def unlock(self, n):
        ok1 = self._Set(self.stats, n.encode())
        ok2 = self._Store(self.stats)
        self.api.SteamAPI_RunCallbacks()
        return bool(ok1 and ok2)

    def _attr(self, n, chave):
        r = self._Attr(self.stats, n.encode(), chave)
        return r.decode(errors="ignore") if r else ""

    def title(self, n):
        return self._attr(n, b"name") or n

    def desc(self, n):
        return self._attr(n, b"desc")

    def percentages(self, ids):
        self._ReqPct(self.stats)
        pct = {}
        for _ in range(100):
            self.api.SteamAPI_RunCallbacks()
            time.sleep(0.1)
            for n in ids:
                v = ctypes.c_float(0)
                if self._Pct(self.stats, n.encode(), ctypes.byref(v)):
                    pct[n] = v.value
            if len(pct) == len(ids) and any(pct.values()):
                break
        return pct

    def shutdown(self):
        try:
            self.api.SteamAPI_Shutdown()
        except Exception:
            pass


class FakeSteam:
    """Steam simulada, ativada pela variável CONQUISTAS_FAKE_STEAM (só testes)."""

    def __init__(self, path):
        self.path = path
        self.d = ler_json(path, {"achievements": []})
        self.got = {a["id"] for a in self.d["achievements"] if a.get("has")} | set(self.d.get("unlocked", []))
        self.por_id = {a["id"]: a for a in self.d["achievements"]}

    def init(self): pass
    def request_stats(self): pass
    def run_callbacks(self): pass
    def names(self): return [a["id"] for a in self.d["achievements"]]
    def has(self, n): return n in self.got
    def title(self, n): return self.por_id.get(n, {}).get("nome", n)
    def desc(self, n): return self.por_id.get(n, {}).get("desc", "")
    def percentages(self, ids): return {n: self.por_id.get(n, {}).get("pct", 0) for n in ids}
    def shutdown(self): pass

    def unlock(self, n):
        self.got.add(n)
        self.d["unlocked"] = sorted(self.got)
        escrever_json(self.path, self.d)
        return True


# ----------------------------------------------------------------------------
# Worker: um processo por jogo
# ----------------------------------------------------------------------------
ATIVOS = ("iniciando", "conectando", "rodando", "importando")
TICK = float(os.environ.get("CONQUISTAS_TICK", "1"))    # só testes: acelera o relógio
SCALE = float(os.environ.get("CONQUISTAS_SCALE", "1"))  # só testes


def log(tipo, msg, iso=False):
    """Linhas lidas pelo painel: eventos usam data ISO (UTC), o resto a hora local."""
    if iso:
        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    else:
        ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] {tipo} · {msg}", flush=True)


def aparar_log(path, max_bytes=1_000_000, manter=600):
    try:
        if os.path.getsize(path) > max_bytes:
            with open(path, encoding="utf-8", errors="replace") as f:
                linhas = f.read().splitlines()[-manter:]
            with open(path, "w", encoding="utf-8") as f:
                f.write("\n".join(linhas) + "\n")
    except OSError:
        pass


def worker(args):
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--worker", action="store_true")
    ap.add_argument("--appid", required=True)
    ap.add_argument("--dll", default="")
    ap.add_argument("--gabarito")
    ap.add_argument("--horas", type=float, default=0)
    ap.add_argument("--sessao", type=float, default=0)
    ap.add_argument("--importar", help="nome do jogo: só gera o gabarito e sai")
    a = ap.parse_args(args)
    appid = a.appid

    os.makedirs(EST_DIR, exist_ok=True)
    os.makedirs(GAB_DIR, exist_ok=True)
    aparar_log(log_path(appid))
    sys.stdout = sys.stderr = open(log_path(appid), "a", encoding="utf-8", buffering=1)

    est = {"estado": "iniciando", "pid": os.getpid()}

    def status(**kw):
        est.update(kw)
        est["ts"] = time.time()
        try:
            escrever_json(estado_path(appid), est)
        except Exception:
            pass

    status(estado="iniciando")
    try:
        _worker(a, appid, status, est)
    except SystemExit as e:
        if e.code not in (0, None):
            status(estado=f"erro: {e.code}")
            log("ERRO", e.code)
    except Exception as e:  # noqa
        import traceback
        traceback.print_exc()
        status(estado=f"erro: {e}")


def _worker(a, appid, status, est):
    fake = os.environ.get("CONQUISTAS_FAKE_STEAM")
    steam = FakeSteam(fake) if fake else RealSteam(a.dll, appid)
    steam.init()
    status(estado="importando" if a.importar else "conectando")
    steam.request_stats()
    todas = steam.names()
    if not todas:
        sys.exit("Nenhuma conquista encontrada (o jogo não tem conquistas ou os dados não carregaram).")

    # ---- modo importar: gera o gabarito a partir da % global ----
    if a.importar:
        log("INFO", f"Gerando gabarito de {a.importar} ({len(todas)} conquistas)")
        pct = steam.percentages(todas)
        ordem = sorted(todas, key=lambda n: -pct.get(n, 0))
        k = max(len(ordem) - 1, 1)
        gab = {
            "appid": int(appid), "nome": a.importar, "horas_sugeridas": 0,
            "obs": "Gerado automaticamente: ordem da mais comum pra mais rara (% global). "
                   "Reordene na tela de gabarito.",
            "conquistas": [{"id": n, "nome": steam.title(n), "descricao": steam.desc(n),
                            "pos": round(0.02 + 0.96 * i / k, 4)} for i, n in enumerate(ordem)],
        }
        escrever_json(os.path.join(GAB_DIR, f"{appid}.json"), gab)
        log("INFO", "Gabarito gerado com sucesso")
        status(estado="gabarito_gerado")
        steam.shutdown()
        return

    # ---- plano ----
    pp = plano_path(appid)
    plano = ler_json(pp)
    if plano is None:
        gab = ler_json(a.gabarito) if a.gabarito else None
        if not gab:
            sys.exit("Gabarito não encontrado.")
        if str(gab.get("appid")) != str(appid):
            sys.exit(f"Gabarito é do AppID {gab.get('appid')}, não do {appid}.")
        horas = a.horas or float(gab.get("horas_sugeridas") or 0)
        if not horas:
            sys.exit("Defina o total de horas do plano.")
        duracao = horas * 3600
        faltam = [n for n in todas if not steam.has(n)]
        posg = {c["id"]: c["pos"] for c in gab["conquistas"]}
        sem = [n for n in faltam if n not in posg]
        if sem:
            log("AVISO", "Fora do gabarito, vão pro final: " + ", ".join(steam.title(n) for n in sem))
        plano = {"total_s": duracao, "elapsed_s": 0.0, "agenda": montar_agenda(faltam, posg, duracao), "feitas": {}}
        log("INFO", f"Plano de {horas:g}h criado com {len(plano['agenda'])} conquistas pendentes")
    plano.setdefault("feitas", {})
    pend = {n: t for n, t in plano["agenda"].items() if not steam.has(n)}
    plano["agenda"] = dict(pend)
    escrever_json(pp, plano)
    if not pend:
        status(estado="concluido", restantes=0, elapsed_s=plano["elapsed_s"], total_s=plano["total_s"])
        log("SESSÃO", "Plano concluído", iso=True)
        steam.shutdown()
        return

    titulos = {n: steam.title(n) for n in pend}
    if os.name == "nt":
        try:
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)  # PC não suspende
        except Exception:
            pass

    flag = flag_path(appid)  # quem pede a pausa cria o arquivo; quem inicia o processo apaga o antigo ANTES de criá-lo
    limite = plano["elapsed_s"] + a.sessao * 3600 if a.sessao else float("inf")
    log("INFO", "Sessão iniciada" + (f" (limite de {a.sessao:g}h)" if a.sessao else " (sem limite)"))
    ultima = ""
    final = "pausado"
    ultimo = ultimo_save = time.monotonic()
    while True:
        if plano["elapsed_s"] >= plano["total_s"]:
            final = "tempo_esgotado"
            break
        if plano["elapsed_s"] >= limite:
            final = "sessao_concluida"
            break
        if os.path.exists(flag):
            break
        time.sleep(TICK)
        steam.run_callbacks()
        agora = time.monotonic()
        plano["elapsed_s"] += min(agora - ultimo, 5) * SCALE  # tempo com o PC suspenso não conta
        ultimo = agora

        for nome, t in sorted(pend.items(), key=lambda x: x[1]):
            if t > plano["elapsed_s"]:
                break
            if not steam.unlock(nome):
                pend[nome] = plano["agenda"][nome] = plano["elapsed_s"] + 120
                log("AVISO", f"Falhou ao desbloquear {titulos.get(nome, nome)}; nova tentativa em 2 min")
                continue
            del pend[nome]
            plano["feitas"][nome] = plano["agenda"].pop(nome)
            escrever_json(pp, plano)
            ultima = titulos.get(nome, nome)
            log("DESBLOQUEADA", ultima, iso=True)

        prox, falta_min = "", 0
        if pend:
            pn, pt = min(pend.items(), key=lambda x: x[1])
            prox, falta_min = titulos.get(pn, pn), max(0, (pt - plano["elapsed_s"]) / 60)
        status(estado="rodando", elapsed_s=plano["elapsed_s"], total_s=plano["total_s"],
               restantes=len(pend), proxima=prox, falta_min=falta_min, ultima=ultima)
        if agora - ultimo_save > 30:
            escrever_json(pp, plano)
            ultimo_save = agora
        if not pend:
            final = "concluido"
            break

    escrever_json(pp, plano)
    status(estado=final, elapsed_s=plano["elapsed_s"], total_s=plano["total_s"], restantes=len(pend),
           ultima=ultima)
    if final == "sessao_concluida":
        log("SESSÃO", "Sessão concluída", iso=True)
    elif final in ("concluido", "tempo_esgotado"):
        log("SESSÃO", "Plano concluído", iso=True)
    else:
        log("INFO", "Sessão pausada")
    steam.shutdown()


# ----------------------------------------------------------------------------
# Gerenciador + API local (o painel web conversa com isto)
# ----------------------------------------------------------------------------
class ApiError(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status, self.msg = status, msg


def pid_vivo(pid):
    try:
        pid = int(pid)
        if os.name == "nt":
            k32 = ctypes.windll.kernel32
            h = k32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
            if not h:
                return False
            code = ctypes.c_ulong()
            k32.GetExitCodeProcess(h, ctypes.byref(code))
            k32.CloseHandle(h)
            return code.value == 259  # STILL_ACTIVE
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def spawn(extra):
    if FROZEN:
        cmd = [sys.executable, "--worker"] + extra
    else:
        cmd = [sys.executable, os.path.abspath(__file__), "--worker"] + extra
    flags = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW
    return subprocess.Popen(cmd, creationflags=flags, stdin=subprocess.DEVNULL,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def ler_cauda(path, n=400):
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            tam = f.tell()
            f.seek(max(0, tam - 200_000))
            dados = f.read()
        return dados.decode("utf-8", errors="replace").splitlines()[-n:]
    except OSError:
        return []


def indice_gabaritos():
    """{appid: caminho} de todos os gabaritos válidos na pasta."""
    ind = {}
    try:
        nomes = os.listdir(GAB_DIR)
    except OSError:
        return ind
    for fn in sorted(nomes):
        if fn.endswith(".json"):
            g = ler_json(os.path.join(GAB_DIR, fn))
            if isinstance(g, dict) and "conquistas" in g and g.get("appid") is not None:
                ind.setdefault(str(g["appid"]), os.path.join(GAB_DIR, fn))
    return ind


class Manager:
    def __init__(self):
        self.lock = threading.RLock()
        cfg = ler_json(CONFIG, {}) or {}
        cfg.setdefault("dll", "")
        cfg.setdefault("sessao", 4)
        cfg.setdefault("jogos", [])
        self.cfg = cfg
        self.procs = {}
        self._inst = (0.0, [])
        self._dll_auto = None
        os.makedirs(GAB_DIR, exist_ok=True)
        os.makedirs(EST_DIR, exist_ok=True)

    # ---- utilidades ----
    def salvar(self):
        escrever_json(CONFIG, self.cfg)

    def jogo(self, appid):
        return next((j for j in self.cfg["jogos"] if str(j["appid"]) == str(appid)), None)

    def instalados(self):
        agora = time.time()
        if agora - self._inst[0] > 20:
            try:
                self._inst = (agora, listar_jogos_instalados())
            except Exception:
                self._inst = (agora, [])
        return self._inst[1]

    def dll(self):
        d = self.cfg.get("dll", "")
        if d and os.path.exists(d) and dll_compativel(d):
            return d
        if self._dll_auto is None:
            try:
                self._dll_auto = achar_dll_qualquer(self.instalados()) or ""
            except Exception:
                self._dll_auto = ""
        return self._dll_auto

    def vivo(self, appid):
        p = self.procs.get(appid)
        if p is not None and p.poll() is None:
            return True
        e = ler_json(estado_path(appid), {}) or {}
        return (e.get("estado") in ATIVOS and bool(e.get("pid")) and time.time() - e.get("ts", 0) < 20
                and pid_vivo(e["pid"]))

    def gab_path(self, appid):
        j = self.jogo(appid)
        if j and j.get("gabarito") and os.path.exists(j["gabarito"]):
            return j["gabarito"]
        return indice_gabaritos().get(str(appid)) or os.path.join(GAB_DIR, f"{appid}.json")

    def gab(self, appid):
        g = ler_json(self.gab_path(appid))
        return g if isinstance(g, dict) and "conquistas" in g else None

    # ---- leitura ----
    def view(self, j):
        appid = str(j["appid"])
        e = ler_json(estado_path(appid), {}) or {}
        plano = ler_json(plano_path(appid))
        gab = self.gab(appid)
        nomes = {c["id"]: c.get("nome", c["id"]) for c in (gab or {}).get("conquistas", [])}
        vivo = self.vivo(appid)
        est = e.get("estado", "parado")
        erro = None
        if est in ATIVOS:
            if not vivo:
                estado = "erro" if est == "importando" else "parado"
                if est == "importando":
                    erro = "Não foi possível gerar o gabarito (o processo foi encerrado)."
            elif est == "importando":
                estado = "gerando_gabarito"
            elif os.path.exists(flag_path(appid)):
                estado = "pausado"
            else:
                estado = "rodando"
        elif est in ("tempo_esgotado", "concluido"):
            estado = "concluido"
        elif est.startswith("erro"):
            estado, erro = "erro", est[4:].lstrip(": ").strip() or "Erro desconhecido."
        elif est in ("sessao_concluida", "pausado"):
            estado = est
        else:  # parado, gabarito_gerado, sem arquivo
            estado = "parado"
        agenda = (plano or {}).get("agenda", {})
        feitas = (plano or {}).get("feitas", {})
        if estado in ("parado", "pausado", "sessao_concluida") and plano and not agenda and plano.get("total_s"):
            estado = "concluido"
        total_s = (plano or {}).get("total_s") or float(j.get("horas", 0) or 0) * 3600
        elapsed = (plano or {}).get("elapsed_s", 0.0)
        if vivo and est == "rodando":
            elapsed = e.get("elapsed_s", elapsed)
        if gab:
            total_c = len(gab["conquistas"])
        elif plano:
            total_c = len(agenda) + len(feitas)
        else:
            total_c = 0
        restantes = len(agenda) if plano else total_c
        out = {"appid": appid, "nome": j.get("nome") or (gab or {}).get("nome") or appid, "estado": estado,
               "elapsed_s": float(elapsed or 0), "total_s": float(total_s or 0), "restantes": restantes,
               "total_conquistas": max(total_c, restantes)}
        if erro:
            out["erro"] = erro
        if agenda:
            pid, t = min(agenda.items(), key=lambda x: x[1])
            out["proxima"] = nomes.get(pid, pid)
            out["falta_min"] = max(0, int(-(-(t - elapsed) // 60)))
        ultima = e.get("ultima") if vivo else ""
        if not ultima:
            for linha in reversed(ler_cauda(log_path(appid), 300)):
                m = re.match(r"^\[[^\]]+\]\s+DESBLOQUEADA\s*·\s*(.+)$", linha)
                if m:
                    ultima = m.group(1)
                    break
        if ultima:
            out["ultima"] = ultima
        return out

    def listar(self):
        return [self.view(j) for j in list(self.cfg["jogos"])]

    def conquistas(self, appid):
        j = self.jogo(appid)
        if not j:
            raise ApiError(404, "Jogo não está no painel.")
        gab = self.gab(appid)
        plano = ler_json(plano_path(appid))
        if not gab:
            raise ApiError(404, "Gabarito ainda não gerado para este jogo.")
        itens = sorted(gab["conquistas"], key=lambda c: c.get("pos", 0))
        res = []
        if plano:
            agenda, feitas = plano.get("agenda", {}), plano.get("feitas", {})
            for c in itens:
                it = {"id": c["id"], "nome": c.get("nome", c["id"]), "pos": len(res) + 1}
                if c.get("descricao"):
                    it["descricao"] = c["descricao"]
                if c["id"] in agenda:
                    it["agendada_s"], it["concluida"] = agenda[c["id"]], False
                else:
                    it["concluida"] = True
                    if c["id"] in feitas:
                        it["agendada_s"] = feitas[c["id"]]
                res.append(it)
        else:  # ainda sem plano: prévia proporcional (o plano real exclui o que você já tem)
            horas = float(j.get("horas") or gab.get("horas_sugeridas") or 50)
            for c in itens:
                it = {"id": c["id"], "nome": c.get("nome", c["id"]), "pos": len(res) + 1,
                      "agendada_s": float(c.get("pos", 0)) * horas * 3600, "concluida": False}
                if c.get("descricao"):
                    it["descricao"] = c["descricao"]
                res.append(it)
        return res

    def log_jogo(self, appid):
        if not self.jogo(appid):
            raise ApiError(404, "Jogo não está no painel.")
        return ler_cauda(log_path(appid), 400)

    def lista_instalados(self):
        ind = indice_gabaritos()
        return [{"appid": g["appid"], "nome": g["nome"], "tem_gabarito": g["appid"] in ind}
                for g in self.instalados()]

    def template(self, appid):
        gab = self.gab(appid)
        if not gab:
            raise ApiError(404, "Este jogo ainda não tem gabarito. Ele é gerado ao adicionar o jogo.")
        j = self.jogo(appid) or {}
        itens = sorted(gab["conquistas"], key=lambda c: c.get("pos", 0))
        conq = []
        for i, c in enumerate(itens):
            it = {"id": c["id"], "nome": c.get("nome", c["id"]), "pos": i + 1}
            if c.get("descricao"):
                it["descricao"] = c["descricao"]
            conq.append(it)
        return {"appid": str(appid), "nome": gab.get("nome") or j.get("nome") or str(appid),
                "horas_sugeridas": float(gab.get("horas_sugeridas") or j.get("horas") or 50), "conquistas": conq}

    # ---- escrita ----
    def salvar_template(self, appid, body):
        if str(body.get("appid")) != str(appid):
            raise ApiError(400, "O appid do corpo não confere com a URL.")
        itens = body.get("conquistas")
        if not isinstance(itens, list) or not itens:
            raise ApiError(400, "O gabarito precisa ter ao menos uma conquista.")
        ids = []
        for c in itens:
            if not isinstance(c, dict) or not isinstance(c.get("id"), str) or not c["id"].strip():
                raise ApiError(400, "Conquista inválida no gabarito.")
            ids.append(c["id"])
        if len(set(ids)) != len(ids):
            raise ApiError(400, "O gabarito tem conquistas repetidas.")
        with self.lock:
            if self.vivo(appid):
                raise ApiError(409, "Pause o jogo antes de salvar o gabarito.")
            old = self.gab(appid) or {}
            velhos = {c["id"]: c for c in old.get("conquistas", [])}
            tempos = sorted(float(c.get("pos", 0)) for c in old.get("conquistas", []))
            n, m = len(itens), len(tempos)
            if m == n:
                novos = tempos
            elif m >= 2 and n >= 2:
                novos = []
                for i in range(n):
                    x = i * (m - 1) / (n - 1)
                    lo = int(x)
                    hi = min(lo + 1, m - 1)
                    novos.append(tempos[lo] + (tempos[hi] - tempos[lo]) * (x - lo))
            else:
                novos = [0.02 + 0.96 * i / max(n - 1, 1) for i in range(n)]
            conq = []
            for c, t in zip(itens, novos):
                it = {"id": c["id"], "nome": str(c.get("nome") or velhos.get(c["id"], {}).get("nome") or c["id"]),
                      "pos": round(t, 4)}
                desc = c.get("descricao") or velhos.get(c["id"], {}).get("descricao")
                if desc:
                    it["descricao"] = desc
                conq.append(it)
            horas = body.get("horas_sugeridas")
            horas = float(horas) if isinstance(horas, (int, float)) and horas > 0 else old.get("horas_sugeridas", 0)
            gab = {"appid": int(appid) if str(appid).isdigit() else appid,
                   "nome": body.get("nome") or old.get("nome") or str(appid),
                   "horas_sugeridas": horas, "obs": old.get("obs", "Editado na tela de gabarito."),
                   "conquistas": conq}
            escrever_json(self.gab_path(appid), gab)
            # reaplica a nova ordem às conquistas ainda pendentes do plano, mantendo os horários
            plano = ler_json(plano_path(appid))
            if plano and plano.get("agenda"):
                ordem = {c["id"]: i for i, c in enumerate(conq)}
                pend = sorted(plano["agenda"], key=lambda k: ordem.get(k, 10**6))
                horarios = sorted(plano["agenda"].values())
                plano["agenda"] = dict(zip(pend, horarios))
                escrever_json(plano_path(appid), plano)

    def iniciar(self, appid):
        with self.lock:
            j = self.jogo(appid)
            if not j:
                raise ApiError(404, "Jogo não está no painel.")
            if self.vivo(appid):
                e = ler_json(estado_path(appid), {}) or {}
                if e.get("estado") == "importando":
                    raise ApiError(409, "Aguarde: o gabarito ainda está sendo gerado.")
                if os.path.exists(flag_path(appid)):
                    raise ApiError(409, "A sessão ainda está sendo pausada. Tente de novo em instantes.")
                return
            plano = ler_json(plano_path(appid))
            if plano and not plano.get("agenda") and plano.get("total_s"):
                raise ApiError(409, "Este plano já foi concluído.")
            gp = self.gab_path(appid)
            if not os.path.exists(gp) and not plano:
                raise ApiError(409, "O gabarito ainda não foi gerado.")
            dll = self.dll()
            if not os.environ.get("CONQUISTAS_FAKE_STEAM") and not (dll and dll_compativel(dll)):
                raise ApiError(400, "Não há um steam_api64.dll compatível. Ajuste o caminho em Configurações.")
            try:
                os.remove(flag_path(appid))
            except OSError:
                pass
            sess = float(self.cfg.get("sessao", 0) or 0)
            self.procs[appid] = spawn(["--appid", appid, "--dll", dll, "--gabarito", gp,
                                       "--horas", str(j.get("horas", 0)), "--sessao", str(sess)])
            self._marcar(appid, self.procs[appid], "iniciando")

    def pausar(self, appid):
        if not self.jogo(appid):
            raise ApiError(404, "Jogo não está no painel.")
        if self.vivo(appid):
            with open(flag_path(appid), "w") as f:
                f.write("parar")

    def _marcar(self, appid, proc, estado):
        """Grava o estado já na criação do processo, pra o painel não mostrar 'parado' por um instante."""
        try:
            escrever_json(estado_path(appid), {"estado": estado, "pid": proc.pid, "ts": time.time()})
        except Exception:
            pass

    def aguardar_parada(self, appids, limite=8.0):
        t0 = time.time()
        while time.time() - t0 < limite and any(self.vivo(a) for a in appids):
            time.sleep(0.2)

    def remover(self, appid):
        with self.lock:
            j = self.jogo(appid)
            if not j:
                raise ApiError(404, "Jogo não está no painel.")
            if self.vivo(appid):
                self.pausar(appid)
                self.aguardar_parada([appid])
                if self.vivo(appid):
                    raise ApiError(409, "Não consegui pausar o jogo a tempo. Tente de novo.")
            pp = plano_path(appid)
            if os.path.exists(pp):  # guarda uma cópia: o progresso nunca é apagado de vez
                bkp = os.path.join(BASE, "backup")
                os.makedirs(bkp, exist_ok=True)
                os.replace(pp, os.path.join(bkp, f"plano_{appid}_{time.strftime('%Y%m%d-%H%M%S')}.json"))
            for p in (estado_path(appid), flag_path(appid)):
                try:
                    os.remove(p)
                except OSError:
                    pass
            self.procs.pop(appid, None)
            self.cfg["jogos"] = [x for x in self.cfg["jogos"] if str(x["appid"]) != str(appid)]
            self.salvar()

    def adicionar(self, body):
        appid = str(body.get("appid", "")).strip()
        horas = body.get("horas")
        if not appid.isdigit():
            raise ApiError(400, "AppID inválido.")
        if isinstance(horas, bool) or not isinstance(horas, (int, float)) or not horas > 0 or horas > 5000:
            raise ApiError(400, "Informe um total de horas maior que zero.")
        with self.lock:
            if self.jogo(appid):
                raise ApiError(409, "Este jogo já está no painel.")
            inst = next((g for g in self.instalados() if g["appid"] == appid), None)
            gp = indice_gabaritos().get(appid)
            gab = ler_json(gp) if gp else None
            nome = (inst or {}).get("nome") or (gab or {}).get("nome")
            if not nome:
                raise ApiError(404, "Jogo não encontrado na sua biblioteca Steam.")
            j = {"appid": appid, "nome": nome, "gabarito": gp or os.path.join(GAB_DIR, f"{appid}.json"),
                 "horas": float(horas)}
            if not gp:  # sem gabarito: gera a partir da Steam
                dll = self.dll()
                if not os.environ.get("CONQUISTAS_FAKE_STEAM") and not (dll and dll_compativel(dll)):
                    raise ApiError(400, "Não há um steam_api64.dll compatível. Ajuste o caminho em Configurações.")
                for p in (estado_path(appid), flag_path(appid)):
                    try:
                        os.remove(p)
                    except OSError:
                        pass
                self.procs[appid] = spawn(["--appid", appid, "--dll", dll, "--importar", nome])
                self._marcar(appid, self.procs[appid], "importando")
            self.cfg["jogos"].append(j)
            self.salvar()

    def config(self, host):
        return {"dll": self.dll() or self.cfg.get("dll", ""), "sessao_horas": float(self.cfg.get("sessao", 0) or 0),
                "api_url": f"http://{host}"}

    def salvar_config(self, body):
        dll = body.get("dll")
        sess = body.get("sessao_horas")
        if isinstance(sess, bool) or not isinstance(sess, (int, float)) or sess < 0 or sess > 1000:
            raise ApiError(400, "As horas por sessão devem ser zero ou um número positivo.")
        if not isinstance(dll, str) or not dll.strip():
            raise ApiError(400, "Informe o caminho do steam_api64.dll.")
        dll = dll.strip().strip('"')
        if os.path.basename(dll).lower() != "steam_api64.dll":
            raise ApiError(400, "O arquivo precisa se chamar steam_api64.dll.")
        if not os.path.isfile(dll):
            raise ApiError(400, "Esse arquivo não existe.")
        if not dll_compativel(dll):
            raise ApiError(400, "Essa DLL é de um SDK antigo e não funciona. Use a do Hollow Knight.")
        with self.lock:
            self.cfg["dll"], self.cfg["sessao"] = dll, float(sess)
            self.salvar()

    def parar_todos(self):
        vivos = [str(j["appid"]) for j in self.cfg["jogos"] if self.vivo(str(j["appid"]))]
        for a in vivos:
            try:
                with open(flag_path(a), "w") as f:
                    f.write("parar")
            except OSError:
                pass
        self.aguardar_parada(vivos, 8.0)


ORIGEM_OK = re.compile(r"^http://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$")
HOST_OK = re.compile(r"^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$")
TIPOS = {".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
         ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon",
         ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2",
         ".txt": "text/plain; charset=utf-8"}

SAIR_CB = [None]


def _pedir_saida():
    if SAIR_CB[0]:
        threading.Timer(0.3, SAIR_CB[0]).start()
    return {"ok": True}


ROTAS = [
    ("GET", r"/jogos", lambda m, h, c, b: m.listar()),
    ("POST", r"/jogos", lambda m, h, c, b: m.adicionar(b)),
    ("POST", r"/jogos/([^/]+)/iniciar", lambda m, h, c, b: m.iniciar(c[0])),
    ("POST", r"/jogos/([^/]+)/pausar", lambda m, h, c, b: m.pausar(c[0])),
    ("DELETE", r"/jogos/([^/]+)", lambda m, h, c, b: m.remover(c[0])),
    ("GET", r"/jogos/([^/]+)/conquistas", lambda m, h, c, b: m.conquistas(c[0])),
    ("GET", r"/jogos/([^/]+)/log", lambda m, h, c, b: m.log_jogo(c[0])),
    ("GET", r"/instalados", lambda m, h, c, b: m.lista_instalados()),
    ("GET", r"/gabaritos/([^/]+)", lambda m, h, c, b: m.template(c[0])),
    ("PUT", r"/gabaritos/([^/]+)", lambda m, h, c, b: m.salvar_template(c[0], b)),
    ("GET", r"/config", lambda m, h, c, b: m.config(h)),
    ("PUT", r"/config", lambda m, h, c, b: m.salvar_config(b)),
    ("POST", r"/__sair", lambda m, h, c, b: _pedir_saida()),
]
ROTAS = [(met, re.compile("^" + pad + "$"), fn) for met, pad, fn in ROTAS]


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ConquistasManager"
    mgr = None

    def log_message(self, *a):
        pass

    # -- respostas --
    def _cors(self):
        origem = self.headers.get("Origin")
        if origem and ORIGEM_OK.match(origem):
            self.send_header("Access-Control-Allow-Origin", origem)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            if self.headers.get("Access-Control-Request-Private-Network"):
                self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, status, obj):
        corpo = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(corpo)

    def _vazio(self, status=204):
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()

    def _arquivo(self, caminho, cache):
        try:
            with open(caminho, "rb") as f:
                dados = f.read()
        except OSError:
            return self._json(404, {"erro": "Arquivo não encontrado."})
        ext = os.path.splitext(caminho)[1].lower()
        self.send_response(200)
        self.send_header("Content-Type", TIPOS.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(dados)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(dados)

    def _estatico(self, caminho):
        raiz = os.path.realpath(WEB_DIR)
        shell = os.path.join(raiz, "_shell.html")
        if not os.path.isfile(shell):
            corpo = "Pasta 'web' não encontrada ao lado do programa.".encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)
            return
        rel = urllib.parse.unquote(caminho).lstrip("/")
        alvo = os.path.realpath(os.path.join(raiz, rel)) if rel else ""
        if rel and os.path.commonpath([raiz, alvo]) == raiz and os.path.isfile(alvo) \
                and os.path.basename(alvo) != "_headers":
            cache = "public, max-age=31536000, immutable" if rel.startswith("assets/") else "no-cache"
            return self._arquivo(alvo, cache)
        if rel and os.path.splitext(rel)[1]:  # parece um arquivo que não existe
            return self._json(404, {"erro": "Arquivo não encontrado."})
        return self._arquivo(shell, "no-cache")  # rotas do painel (SPA)

    # -- despacho --
    def _tratar(self):
        host = self.headers.get("Host", "")
        if not HOST_OK.match(host):
            return self._json(403, {"erro": "Host não permitido."})
        origem = self.headers.get("Origin")
        if origem and not ORIGEM_OK.match(origem):
            return self._json(403, {"erro": "Origem não permitida."})
        if self.command == "OPTIONS":
            return self._vazio(204)
        caminho = urllib.parse.urlsplit(self.path).path
        if len(caminho) > 1:
            caminho = caminho.rstrip("/")
        achou_caminho = False
        for met, rx, fn in ROTAS:
            m = rx.match(caminho)
            if not m:
                continue
            achou_caminho = True
            if met != self.command:
                continue
            corpo = {}
            if self.command in ("POST", "PUT"):
                tam = int(self.headers.get("Content-Length") or 0)
                if tam > 1_000_000:
                    return self._json(413, {"erro": "Corpo grande demais."})
                if tam:
                    if not (self.headers.get("Content-Type") or "").lower().startswith("application/json"):
                        return self._json(415, {"erro": "Use Content-Type: application/json."})
                    try:
                        corpo = json.loads(self.rfile.read(tam).decode("utf-8"))
                    except Exception:
                        return self._json(400, {"erro": "JSON inválido."})
                    if not isinstance(corpo, dict):
                        return self._json(400, {"erro": "O corpo precisa ser um objeto JSON."})
            try:
                res = fn(self.mgr, host, m.groups(), corpo)
            except ApiError as e:
                return self._json(e.status, {"erro": e.msg})
            except Exception as e:  # noqa
                import traceback
                traceback.print_exc()
                return self._json(500, {"erro": f"Erro interno: {e}"})
            return self._vazio(204) if res is None else self._json(200, res)
        if achou_caminho:
            return self._json(405, {"erro": "Método não permitido."})
        if self.command in ("GET", "HEAD"):
            return self._estatico(caminho)
        return self._json(404, {"erro": "Rota não encontrada."})

    do_GET = do_HEAD = do_POST = do_PUT = do_DELETE = do_OPTIONS = _tratar


class Servidor(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"  # no Windows, reuso permitiria dois servidores na mesma porta


def outra_instancia(porta):
    try:
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{porta}/config", timeout=1.5) as r:
            return "sessao_horas" in json.loads(r.read().decode("utf-8"))
    except Exception:
        return False


def run_server(abrir=True, porta_inicial=8765):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    mgr = Manager()
    Handler.mgr = mgr
    srv, porta = None, porta_inicial
    for porta in range(porta_inicial, porta_inicial + 10):
        try:
            srv = Servidor(("127.0.0.1", porta), Handler)
            break
        except OSError:
            if outra_instancia(porta):
                url = f"http://localhost:{porta}"
                print(f"O Gerenciador já está aberto em {url}.")
                if abrir:
                    webbrowser.open(url)
                return
    if srv is None:
        sys.exit("Não consegui abrir nenhuma porta entre %d e %d." % (porta_inicial, porta_inicial + 9))
    url = f"http://localhost:{porta}"
    parado = threading.Event()

    def encerrar(*_):
        if parado.is_set():
            return
        parado.set()
        print("\nPausando os jogos e salvando o progresso…")
        mgr.parar_todos()
        threading.Thread(target=srv.shutdown, daemon=True).start()

    SAIR_CB[0] = encerrar
    bandeja = iniciar_bandeja(url, encerrar)
    atexit.register(lambda: mgr.parar_todos() if not parado.is_set() else None)
    try:
        signal.signal(signal.SIGINT, encerrar)
        signal.signal(signal.SIGTERM, encerrar)
    except Exception:
        pass
    if os.name == "nt":  # fechar a janela do terminal também pausa tudo
        try:
            tipo = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_uint)

            def _ctrl(ev):
                if ev in (0, 2, 5, 6):
                    encerrar()
                    return 1
                return 0

            Servidor._ctrl_ref = tipo(_ctrl)  # mantém referência viva
            ctypes.windll.kernel32.SetConsoleCtrlHandler(Servidor._ctrl_ref, True)
        except Exception:
            pass
    print("=" * 60)
    print(f" Gerenciador de Conquistas rodando em {url}")
    print(" Deixe esta janela aberta. Ctrl+C pausa tudo e fecha.")
    print("=" * 60)
    if abrir:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt:
        encerrar()
    finally:
        srv.server_close()
        try:
            if bandeja:
                bandeja.stop()
        except Exception:
            pass


def iniciar_bandeja(url, encerrar):
    """Ícone perto do relógio (opcional: precisa de pystray + pillow)."""
    try:
        import pystray
        from PIL import Image, ImageDraw
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.ellipse((4, 4, 60, 60), fill=(0, 200, 220, 255))
        d.rectangle((22, 18, 42, 34), fill=(10, 20, 30, 255))
        d.rectangle((29, 34, 35, 46), fill=(10, 20, 30, 255))
        d.rectangle((22, 46, 42, 50), fill=(10, 20, 30, 255))
        menu = pystray.Menu(
            pystray.MenuItem("Abrir painel", lambda *a: webbrowser.open(url), default=True),
            pystray.MenuItem("Sair (pausa tudo)", lambda *a: encerrar()),
        )
        icone = pystray.Icon("conquistas", img, "Gerenciador de Conquistas", menu)
        icone.run_detached()
        return icone
    except Exception:
        return None


def sair_do_servidor(porta_inicial=8765):
    import urllib.request
    for porta in range(porta_inicial, porta_inicial + 10):
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{porta}/__sair", data=b"{}", method="POST",
                                         headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=2).read()
            return True
        except Exception:
            continue
    return False


# ----------------------------------------------------------------------------
# Janela
# ----------------------------------------------------------------------------
def gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox, simpledialog, ttk

    os.makedirs(GAB_DIR, exist_ok=True)
    os.makedirs(EST_DIR, exist_ok=True)
    cfg = ler_json(CONFIG, {"dll": "", "sessao": 4, "jogos": []})
    procs = {}  # appid -> Popen

    root = tk.Tk()
    root.title("Gerenciador de Conquistas")
    root.geometry("900x520")

    def salvar_cfg():
        cfg["dll"] = dll_var.get()
        try:
            cfg["sessao"] = float(sessao_var.get())
        except ValueError:
            pass
        escrever_json(CONFIG, cfg)

    if not (os.path.exists(cfg.get("dll", "")) and dll_compativel(cfg.get("dll", ""))):
        try:
            auto = achar_dll_qualquer(listar_jogos_instalados())
            if auto:
                cfg["dll"] = auto
        except Exception:
            pass

    # --- topo: DLL e sessão ---
    topo = ttk.Frame(root, padding=8)
    topo.pack(fill="x")
    ttk.Label(topo, text="steam_api64.dll:").grid(row=0, column=0, sticky="w")
    dll_var = tk.StringVar(value=cfg.get("dll", ""))
    ttk.Entry(topo, textvariable=dll_var, width=70).grid(row=0, column=1, padx=4)

    def procurar_dll():
        f = filedialog.askopenfilename(title="Escolha o steam_api64.dll",
                                       filetypes=[("DLL", "steam_api64.dll"), ("Todos", "*.*")])
        if f:
            dll_var.set(f)
            salvar_cfg()

    ttk.Button(topo, text="Procurar…", command=procurar_dll).grid(row=0, column=2)
    ttk.Label(topo, text="Horas por sessão (0 = sem limite):").grid(row=1, column=0, columnspan=2,
                                                                  sticky="e", pady=4)
    sessao_var = tk.StringVar(value=str(cfg.get("sessao", 4)))
    ttk.Entry(topo, textvariable=sessao_var, width=6).grid(row=1, column=2, sticky="w")

    # --- lista ---
    cols = ("jogo", "appid", "progresso", "restantes", "proxima", "estado")
    tree = ttk.Treeview(root, columns=cols, show="headings", height=10)
    for c, t, w in [("jogo", "Jogo", 170), ("appid", "AppID", 70), ("progresso", "Progresso", 130),
                    ("restantes", "Restam", 60), ("proxima", "Próxima conquista", 250),
                    ("estado", "Estado", 170)]:
        tree.heading(c, text=t)
        tree.column(c, width=w, anchor="w")
    tree.pack(fill="both", expand=True, padx=8)

    logbox = tk.Text(root, height=7, state="disabled", font=("Consolas", 9))
    logbox.pack(fill="x", padx=8, pady=6)

    def jogo_sel():
        s = tree.selection()
        if not s:
            messagebox.showinfo("Selecione", "Selecione um jogo na lista.")
            return None
        return next(j for j in cfg["jogos"] if str(j["appid"]) == s[0])

    def spawn(extra):
        if FROZEN:
            cmd = [sys.executable, "--worker"] + extra
        else:
            cmd = [sys.executable, os.path.abspath(__file__), "--worker"] + extra
        flags = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW
        return subprocess.Popen(cmd, creationflags=flags)

    def dll_ok():
        if not os.path.exists(dll_var.get()):
            messagebox.showwarning("steam_api64.dll", "Escolha o caminho do steam_api64.dll primeiro.")
            return False
        if not dll_compativel(dll_var.get()):
            messagebox.showwarning("steam_api64.dll", "Essa DLL é de um SDK antigo e não funciona. Use a do "
                                   "Hollow Knight (hollow_knight_Data\\Plugins\\x86_64) ou clique em "
                                   "'Detectar jogos…' que ele escolhe uma compatível.")
            return False
        salvar_cfg()
        return True

    # --- ações ---
    def adicionar():
        f = filedialog.askopenfilename(title="Escolha o gabarito do jogo", initialdir=GAB_DIR,
                                       filetypes=[("Gabarito", "*.json")])
        if not f:
            return
        gab = ler_json(f)
        if not gab or "appid" not in gab or "conquistas" not in gab:
            messagebox.showerror("Gabarito", "Arquivo inválido.")
            return
        horas = simpledialog.askfloat("Horas do plano", "Total de horas simuladas a partir de agora:",
                                      initialvalue=gab.get("horas_sugeridas") or 50, minvalue=1,
                                      parent=root)
        if not horas:
            return
        cfg["jogos"] = [j for j in cfg["jogos"] if str(j["appid"]) != str(gab["appid"])]
        cfg["jogos"].append({"appid": gab["appid"], "nome": gab.get("nome", str(gab["appid"])),
                             "gabarito": f, "horas": horas})
        salvar_cfg()
        atualizar()

    def importar():
        appid = simpledialog.askstring("Importar jogo", "AppID do jogo (está na URL da loja Steam):",
                                       parent=root)
        if not appid or not appid.strip().isdigit():
            return
        nome = simpledialog.askstring("Importar jogo", "Nome do jogo:", parent=root) or appid
        if not dll_ok():
            return
        appid = appid.strip()
        try:
            os.remove(estado_path(appid))
        except OSError:
            pass
        p = spawn(["--appid", appid, "--dll", dll_var.get(), "--importar", nome])
        messagebox.showinfo("Importando", "Lendo as conquistas da Steam… (a Steam precisa estar aberta).\n"
                            "Quando terminar, o gabarito aparece em:\n" + GAB_DIR +
                            "\n\nDepois é só clicar em 'Adicionar jogo' e escolher o arquivo.")

    def adicionar_detectado(jg):
        if not (os.path.exists(dll_var.get()) and dll_compativel(dll_var.get())):
            d = achar_dll(jg["pasta"]) or achar_dll_qualquer(listar_jogos_instalados())
            if not d:
                messagebox.showwarning("steam_api64.dll", "Não achei nenhum steam_api64.dll nos seus jogos. "
                                       "Escolha o caminho manualmente.")
                return
            dll_var.set(d)
        salvar_cfg()
        appid = jg["appid"]
        gab_path = achar_gabarito(appid)
        gab = ler_json(gab_path) if gab_path else None
        sugerido = (gab or {}).get("horas_sugeridas") or 50
        horas = simpledialog.askfloat("Horas do plano", f"{jg['nome']}\nTotal de horas simuladas a partir de agora:",
                                      initialvalue=sugerido, minvalue=1, parent=root)
        if not horas:
            return
        gerando = False
        if not gab_path:
            gab_path = os.path.join(GAB_DIR, f"{appid}.json")
            try:
                os.remove(estado_path(appid))
            except OSError:
                pass
            procs[appid] = spawn(["--appid", appid, "--dll", dll_var.get(), "--importar", jg["nome"]])
            gerando = True
        cfg["jogos"] = [x for x in cfg["jogos"] if str(x["appid"]) != str(appid)]
        cfg["jogos"].append({"appid": appid, "nome": jg["nome"], "gabarito": gab_path, "horas": horas})
        salvar_cfg()
        atualizar()
        if gerando:
            messagebox.showinfo("Gabarito", "Não tinha gabarito pra esse jogo, então estou gerando um a "
                                "partir da Steam (ordem da conquista mais comum pra mais rara).\n"
                                "Quando o estado mudar pra 'gabarito pronto', clique em Iniciar.")

    def detectar():
        jogos = listar_jogos_instalados()
        if not jogos:
            messagebox.showinfo("Jogos", "Não encontrei jogos da Steam instalados.")
            return
        win = tk.Toplevel(root)
        win.title("Jogos instalados")
        win.geometry("560x480")
        busca = tk.StringVar()
        ttk.Entry(win, textvariable=busca).pack(fill="x", padx=8, pady=6)
        lt = ttk.Treeview(win, columns=("nome", "appid", "gab"), show="headings")
        for c, t, w in (("nome", "Jogo", 300), ("appid", "AppID", 80), ("gab", "Gabarito", 100)):
            lt.heading(c, text=t)
            lt.column(c, width=w)
        lt.pack(fill="both", expand=True, padx=8)
        por_id = {j["appid"]: j for j in jogos}

        def preencher(*_):
            lt.delete(*lt.get_children())
            q = busca.get().lower().strip()
            for j in jogos:
                if q in j["nome"].lower() or q in j["appid"]:
                    lt.insert("", "end", iid=j["appid"],
                              values=(j["nome"], j["appid"], "sim" if achar_gabarito(j["appid"]) else "gerar"))

        def escolher(*_):
            s = lt.selection()
            if not s:
                return
            win.destroy()
            adicionar_detectado(por_id[s[0]])

        busca.trace_add("write", preencher)
        lt.bind("<Double-1>", escolher)
        ttk.Button(win, text="Adicionar selecionado", command=escolher).pack(pady=8)
        preencher()

    def iniciar():
        j = jogo_sel()
        if not j or not dll_ok():
            return
        appid = str(j["appid"])
        if appid in procs and procs[appid].poll() is None:
            messagebox.showinfo("Em andamento", "Esse jogo já está em execução (ou gerando o gabarito).")
            return
        if not os.path.exists(j["gabarito"]) and not os.path.exists(plano_path(appid)):
            messagebox.showinfo("Gabarito", "O gabarito desse jogo ainda não foi gerado. Espere o estado "
                                "'gabarito pronto' (a Steam precisa estar aberta) e tente de novo.")
            return
        salvar_cfg()
        try:
            os.remove(flag_path(appid))
        except OSError:
            pass
        sess = float(cfg.get("sessao", 0) or 0)
        procs[appid] = spawn(["--appid", appid, "--dll", dll_var.get(), "--gabarito", j["gabarito"],
                              "--horas", str(j["horas"]), "--sessao", str(sess)])

    def pausar():
        j = jogo_sel()
        if not j:
            return
        appid = str(j["appid"])
        with open(flag_path(appid), "w") as f:
            f.write("parar")

    def remover():
        j = jogo_sel()
        if not j:
            return
        if messagebox.askyesno("Remover", f"Tirar {j['nome']} da lista?\n(O progresso salvo é mantido.)"):
            cfg["jogos"] = [x for x in cfg["jogos"] if x is not j]
            salvar_cfg()
            atualizar()

    def abrir_pasta():
        if os.name == "nt":
            os.startfile(BASE)  # noqa

    barra = ttk.Frame(root, padding=8)
    barra.pack(fill="x")
    for txt, cmd in [("Iniciar", iniciar), ("Pausar", pausar), ("Detectar jogos…", detectar),
                     ("Adicionar gabarito…", adicionar),
                     ("Importar jogo novo…", importar), ("Remover", remover), ("Abrir pasta", abrir_pasta)]:
        ttk.Button(barra, text=txt, command=cmd).pack(side="left", padx=3)

    def mostrar_log(appid):
        logbox.config(state="normal")
        logbox.delete("1.0", "end")
        try:
            with open(log_path(appid), encoding="utf-8") as f:
                linhas = f.read().splitlines()[-30:]
            logbox.insert("end", "\n".join(linhas))
            logbox.see("end")
        except OSError:
            pass
        logbox.config(state="disabled")

    def atualizar():
        sel = tree.selection()
        tree.delete(*tree.get_children())
        for j in cfg["jogos"]:
            appid = str(j["appid"])
            e = ler_json(estado_path(appid), {}) or {}
            vivo = appid in procs and procs[appid].poll() is None
            estado = e.get("estado", "parado")
            if estado in ("rodando", "conectando", "iniciando") and not vivo:
                estado = "parado"
            prog = ""
            tot = e.get("total_s") or (ler_json(plano_path(appid), {}) or {}).get("total_s")
            el = e.get("elapsed_s")
            if el is None:
                el = (ler_json(plano_path(appid), {}) or {}).get("elapsed_s")
            if tot and el is not None:
                prog = f"{el/3600:.1f}h / {tot/3600:.0f}h  ({100*el/tot:.0f}%)"
            prox = e.get("proxima", "")
            if prox and estado == "rodando":
                prox += f" (em {e.get('falta_min', 0):.0f} min)"
            estado = {"gabarito_gerado": "gabarito pronto", "sessao_concluida": "sessão concluída",
                      "tempo_esgotado": "plano concluído"}.get(estado, estado)
            tree.insert("", "end", iid=appid, values=(j["nome"], appid, prog, e.get("restantes", ""),
                                                       prox, estado))
        if sel and tree.exists(sel[0]):
            tree.selection_set(sel[0])

    def tick():
        atualizar()
        s = tree.selection()
        if s:
            mostrar_log(s[0])
        root.after(1500, tick)

    def fechar():
        vivos = [a for a, pr in procs.items() if pr.poll() is None]
        if vivos:
            if not messagebox.askyesno("Fechar", "Há jogos rodando. Fechar a janela pausa todos "
                                       "(o progresso fica salvo). Fechar mesmo?"):
                return
            for a in vivos:
                with open(flag_path(a), "w") as f:
                    f.write("parar")
            t0 = time.time()
            while time.time() - t0 < 5 and any(procs[a].poll() is None for a in vivos):
                time.sleep(0.2)
        salvar_cfg()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", fechar)
    tick()
    root.mainloop()


if __name__ == "__main__":
    if sys.stdout is None or sys.stderr is None:  # pythonw / exe sem console
        _nul = open(os.devnull, "w", encoding="utf-8")
        sys.stdout = sys.stdout or _nul
        sys.stderr = sys.stderr or _nul
    if "--sair" in sys.argv:
        sair_do_servidor()
    elif "--worker" in sys.argv:
        worker(sys.argv[1:])
    elif "--gui" in sys.argv:
        gui()
    else:
        porta = 8765
        if "--porta" in sys.argv:
            try:
                porta = int(sys.argv[sys.argv.index("--porta") + 1])
            except (ValueError, IndexError):
                pass
        run_server(abrir="--sem-navegador" not in sys.argv, porta_inicial=porta)
