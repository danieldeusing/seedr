#!/usr/bin/env python3
"""Build the Lead Desk page from desk.json.

  build_desk.py <desk.json> [-o lead-desk.html] [--standalone]

Checks the plan (ids, dependencies, phases), sorts every task into its board column, counts
per epic and story, embeds the screen pictures and the infrastructure drawing, and writes one
HTML file. The default output is the fragment the Artifact tool publishes. --standalone wraps
it in a document, to look at it in a browser; the inbox then shows a notice, because the
shared database exists only on claude.ai.

A task's column: status "done" or "dropped" decides first. Then an explicit "state"
(progress, review, blocked, held). Then "backlog" while a dependency is open, else "ready".
A dependency on an epic id means every task of that epic.

  build_desk.py --self-test    builds the bundled example and checks the result
"""
import argparse, base64, datetime, html, json, mimetypes, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
TEMPLATE = HERE.parent / "assets" / "lead-desk.template.html"
EXAMPLE = HERE.parent / "assets" / "desk.example.json"
COLUMNS = ["blocked", "review", "progress", "ready", "held", "backlog", "done", "dropped"]
STATES = {"progress", "review", "blocked", "held"}
STATUSES = {"open", "done", "dropped"}


def build(src, base, now):
    errors = []
    project = dict(src.get("project") or {})
    for key in ("name", "owner", "lead"):
        if not project.get(key):
            errors.append(f"project.{key} is missing")
    if project.get("pr_url") and not str(project["pr_url"]).startswith("https://"):
        errors.append("project.pr_url must start with https://")
    project["generated"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    epics = [dict(e, tasks=[], stories=[]) for e in src.get("epics", [])]
    stories = [dict(s, tasks=[]) for s in src.get("stories", [])]
    tasks = [dict(t) for t in src.get("tasks", [])]
    E, S, T = ({x.get("id"): x for x in xs} for xs in (epics, stories, tasks))
    for kind, xs, index in (("epic", epics, E), ("story", stories, S), ("task", tasks, T)):
        if len(index) != len(xs) or None in index:
            errors.append(f"every {kind} needs an id, and the id must be unique")
    for e in epics:
        e.setdefault("title", e["id"]); e.setdefault("phase", ""); e.setdefault("goal", "")
        e["deps"] = list(e.get("deps", []))
        errors += [f"epic {e['id']}: unknown epic {d} in deps" for d in e["deps"] if d not in E]
    for s in stories:
        s.setdefault("title", s["id"]); s.setdefault("summary", "")
        if s.get("epic") not in E:
            errors.append(f"story {s['id']}: unknown epic {s.get('epic')}")
        else:
            E[s["epic"]]["stories"].append(s["id"])
    if errors:
        sys.exit("build_desk: " + "; ".join(errors))

    for t in tasks:
        t.setdefault("title", t["id"]); t.setdefault("size", ""); t.setdefault("goal", "")
        t.setdefault("status", "open")
        if t["status"] not in STATUSES:
            errors.append(f"task {t['id']}: status must be one of {sorted(STATUSES)}")
        if t.get("state") and t["state"] not in STATES:
            errors.append(f"task {t['id']}: state must be one of {sorted(STATES)}")
        if t.get("epic") not in E:
            errors.append(f"task {t['id']}: unknown epic {t.get('epic')}")
            continue
        E[t["epic"]]["tasks"].append(t["id"])
        if t.get("story"):
            if t["story"] not in S or S[t["story"]]["epic"] != t["epic"]:
                errors.append(f"task {t['id']}: story {t['story']} is not a story of {t['epic']}")
            else:
                S[t["story"]]["tasks"].append(t["id"])
    for t in tasks:  # after every epic knows its tasks: an epic id stands for all of them
        deps = []
        for d in t.get("deps", []):
            if d in T:
                deps.append(d)
            elif d in E:
                deps += E[d]["tasks"]
            else:
                errors.append(f"task {t['id']}: unknown dependency {d}")
        t["deps"] = [d for d in dict.fromkeys(deps) if d != t["id"]]
    if errors:
        sys.exit("build_desk: " + "; ".join(errors))

    for t in tasks:
        if t["status"] != "open":
            t["column"] = t["status"]
        elif t.get("state"):
            t["column"] = t["state"]
        else:
            t["column"] = "backlog" if any(T[d]["status"] == "open" for d in t["deps"]) else "ready"
    counts = lambda ids: {c: sum(1 for i in ids if T[i]["column"] == c) for c in COLUMNS}
    for x in epics + stories:
        x["counts"], x["total"] = counts(x["tasks"]), len(x["tasks"])

    phases = src.get("phases") or [{"name": "Plan", "what": "", "epics": [e["id"] for e in epics]}]
    placed = [i for p in phases for i in p.get("epics", [])]
    errors += [f"phases: unknown epic {i}" for i in placed if i not in E]
    errors += [f"phases: epic {i} is in no phase" for i in E if i not in placed]
    if len(placed) != len(set(placed)):
        errors.append("phases: an epic is in two phases")
    for p in phases:
        p.setdefault("what", "")

    screens = []
    for g in src.get("screens", []):
        shots = []
        for s in g.get("shots", []):
            s = dict(s)
            if s.get("file"):
                f = base / s.pop("file")
                if not f.is_file():
                    errors.append(f"screens: no file {f}")
                    continue
                mime = mimetypes.guess_type(f.name)[0] or ""
                if not mime.startswith("image/") or mime == "image/svg+xml":
                    errors.append(f"screens: {f.name} must be a PNG, JPEG or WebP picture")
                    continue
                s["img"] = f"data:{mime};base64," + base64.b64encode(f.read_bytes()).decode()
            elif not s.get("lines"):
                errors.append(f"screens: {s.get('name')} needs a file or lines")
            shots.append(s)
        screens.append({"name": g.get("name", ""), "text": g.get("text", ""), "shots": shots})

    infra = None
    if src.get("infra"):
        infra = dict(src["infra"])
        f = base / str(infra.get("svg", ""))
        if not f.is_file():
            errors.append(f"infra: no file {f}")
        else:
            svg = f.read_text(encoding="utf8")
            svg = svg[svg.find("<svg"):] if "<svg" in svg else ""
            # the page inserts the drawing as markup, so it must not carry anything that runs
            if not svg or re.search(r"<script|<foreignObject|\son\w+\s*=|javascript:", svg, re.I):
                errors.append("infra: the SVG must start with <svg and hold no script, foreignObject, on…= handler or javascript: link")
            infra["svg"] = svg
        if not infra.get("stages"):
            errors.append("infra: at least one stage is needed; stage 0 is what exists today")
        for st in infra.get("stages", []):
            errors += [f"infra: unknown task {i} in stage {st.get('name')}" for i in st.get("tasks", []) if i not in T]
    if errors:
        sys.exit("build_desk: " + "; ".join(errors))

    return {"project": project, "phases": phases, "epics": epics, "stories": stories, "tasks": tasks,
            "results": src.get("results", []), "merges": src.get("merges", []), "screens": screens, "infra": infra}


def render(data):
    page = TEMPLATE.read_text(encoding="utf8")
    slot = "const DATA = {};"
    assert page.count(slot) == 1, "the template lost its data slot"
    # "</" would end the script element early; "<\/" is the same string to JavaScript
    blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    page = page.replace(slot, "const DATA = " + blob + ";")
    return page.replace("__DESK_NAME__", html.escape(data["project"]["name"] + " Lead Desk"))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("desk", type=pathlib.Path, help="path to desk.json")
    p.add_argument("-o", "--out", type=pathlib.Path, help="default: lead-desk.html beside desk.json")
    p.add_argument("--standalone", action="store_true", help="a whole document, for a local look")
    a = p.parse_args(argv)
    try:
        src = json.loads(a.desk.read_text(encoding="utf8"))
    except (OSError, json.JSONDecodeError) as e:
        sys.exit(f"build_desk: cannot read {a.desk}: {e}")
    data = build(src, a.desk.resolve().parent, datetime.datetime.now(datetime.timezone.utc))
    page = render(data)
    if a.standalone:
        page = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1">'
                "<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n" + page + "</body></html>\n")
    out = a.out or a.desk.with_name("lead-desk.html")
    out.write_text(page, encoding="utf8")
    cols = {c: sum(1 for t in data["tasks"] if t["column"] == c) for c in COLUMNS}
    print(f"written: {out} ({len(page) // 1024} KB)", file=sys.stderr)
    print(json.dumps({"epics": len(data["epics"]), "stories": len(data["stories"]), "tasks": len(data["tasks"]), "columns": cols}))


def demo():
    src = json.loads(EXAMPLE.read_text(encoding="utf8"))
    data = build(src, EXAMPLE.parent, datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc))
    col = {t["id"]: t["column"] for t in data["tasks"]}
    assert col == {"E01-T01": "done", "E01-T02": "review", "E01-T03": "ready", "E01-T04": "blocked",
                   "E02-T01": "backlog", "E02-T02": "backlog", "E02-T03": "dropped"}, col
    deps = {t["id"]: t["deps"] for t in data["tasks"]}
    assert deps["E02-T01"] == ["E01-T01", "E01-T02", "E01-T03", "E01-T04"], deps["E02-T01"]  # an epic id expands
    assert data["epics"][0]["counts"]["done"] == 1 and data["epics"][0]["total"] == 4
    assert data["phases"][0]["epics"] == ["E01"]
    page = render(data)
    assert "__DESK_NAME__" not in page and "<title>Example Lead Desk</title>" in page
    bad = json.loads(json.dumps(src)); bad["tasks"][0]["deps"] = ["E09-T99"]
    try:
        build(bad, EXAMPLE.parent, datetime.datetime.now(datetime.timezone.utc))
    except SystemExit as e:
        assert "unknown dependency E09-T99" in str(e), str(e)
    else:
        raise AssertionError("an unknown dependency was accepted")
    print("ok")


if __name__ == "__main__":
    demo() if sys.argv[1:] == ["--self-test"] else main()
