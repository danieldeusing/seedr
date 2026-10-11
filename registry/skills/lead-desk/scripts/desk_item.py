#!/usr/bin/env python3
"""Build one Lead Desk inbox item as a JSON file and print the ArtifactData call that posts it.

A shell cannot write to the desk's database: only a Claude session can, through the ArtifactData
tool. So this script does the half a shell can do. It checks the item against the desk's rules,
writes it to inbox/<id>.json beside desk.json and prints the one tool call that posts it.

  desk_item.py <desk.json> --kind info     --title T --eli5 E --point P [--point P ...] [--recommendation R]
  desk_item.py <desk.json> --kind question --title T --eli5 E --point P ... --recommendation R [--option O ...]
  desk_item.py <desk.json> --kind action   --title T --eli5 E --step 'what to do ::: the command' [--step ...]

A step without ' ::: ' is a click or a check with no command.

Pictures (any kind): upload each file to the desk first, with the Artifact tool
  {"action": "publish", "url": "<desk url>", "asset": true, "file_path": "<absolute path>"}
(one call per file, and Read the file before you upload it). The result names an id of 32 hex
characters. Pass it as --image '<id> ::: caption'; repeat for more pictures. The desk shows a
thumbnail, and a click opens the picture in a dialog with zoom.

  desk_item.py --self-test
"""
import argparse, datetime, json, pathlib, re, sys


def build(a, now):
    errors = []
    if a.kind == "action" and not a.step:
        errors.append("an action needs at least one --step")
    if a.kind == "question" and not a.recommendation:
        errors.append("a question needs --recommendation: one option and its reason")
    if a.kind != "action" and a.step:
        errors.append("--step belongs to an action; a question or info item has none")
    if a.option and a.kind != "question":
        errors.append("--option belongs to a question")
    images = []
    for s in a.image:
        pid, _, caption = (p.strip() for p in s.partition(" ::: "))
        if not re.fullmatch(r"[0-9a-f]{32}", pid):
            errors.append(f"--image wants the asset id the upload returned (32 hex characters), not {pid!r}")
        images.append({"id": pid, "caption": caption} if caption else {"id": pid})
    if len(a.title) > 140:
        errors.append(f"the title has {len(a.title)} characters; keep it under 140")
    if errors:
        sys.exit("desk_item: " + "; ".join(errors))
    slug = a.slug or re.sub(r"[^a-z0-9]+", "-", a.title.lower()).strip("-")[:48].strip("-")
    item = {"kind": a.kind, "status": "open", "priority": a.priority, "from": a.sender,
            "createdAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "title": a.title, "eli5": a.eli5}
    if a.point:
        item["points"] = a.point
    if a.option:
        item["options"] = a.option
    if a.recommendation:
        item["recommendation"] = a.recommendation
    if images:
        item["images"] = images
    if a.step:
        item["steps"] = [dict(zip(("text", "command"), (p.strip() for p in s.split(" ::: ", 1)))) for s in a.step]
    return f"{now:%Y-%m-%d}-{a.kind}-{slug}", item


def main(argv=None, now=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("desk", type=pathlib.Path, help="path to desk.json; project.desk_url names the published desk")
    p.add_argument("--kind", required=True, choices=["info", "question", "action"])
    p.add_argument("--title", required=True)
    p.add_argument("--eli5", required=True, help="two or three plain sentences")
    p.add_argument("--point", action="append", default=[], help="one fact; repeat")
    p.add_argument("--option", action="append", default=[], help="one answer option; repeat")
    p.add_argument("--recommendation")
    p.add_argument("--step", action="append", default=[], help="'text ::: command'; repeat, in order")
    p.add_argument("--image", action="append", default=[], help="'<asset id> ::: caption'; repeat")
    p.add_argument("--priority", type=int, default=5, choices=range(1, 10), help="1 shows first")
    p.add_argument("--from", dest="sender", help="who asks: the session or thread title; default is the lead's name")
    p.add_argument("--slug")
    a = p.parse_args(argv)
    try:
        project = json.loads(a.desk.read_text(encoding="utf8"))["project"]
        url = project["desk_url"]
    except (OSError, ValueError, KeyError) as e:
        sys.exit(f"desk_item: cannot read project.desk_url from {a.desk}: {e!r}")
    if not str(url).startswith("https://claude.ai/"):
        sys.exit("desk_item: project.desk_url is empty; publish the desk first and store its link there")
    a.sender = a.sender or project.get("lead", "")
    doc_id, item = build(a, now or datetime.datetime.now(datetime.timezone.utc))
    out = a.desk.resolve().parent / "inbox"
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{doc_id}.json"
    path.write_text(json.dumps(item, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
    print(f"written: {path}\npost it with the ArtifactData tool:")
    print(json.dumps({"action": "set", "url": url, "collection": "inbox", "doc_id": doc_id, "file_path": str(path)}, indent=1))


def demo():
    ns = argparse.Namespace(kind="action", title="T", eli5="E", point=[], option=[], recommendation=None,
                            step=["open the page", "run it ::: ls -l"], image=["ab" * 16 + " ::: Before"], priority=5, sender="x", slug=None)
    doc_id, item = build(ns, datetime.datetime(2026, 10, 8, tzinfo=datetime.timezone.utc))
    assert doc_id == "2026-10-08-action-t", doc_id
    assert item["steps"] == [{"text": "open the page"}, {"text": "run it", "command": "ls -l"}], item["steps"]
    assert item["images"] == [{"id": "ab" * 16, "caption": "Before"}], item["images"]
    ns.kind, ns.step, ns.image = "question", [], ["/tmp/a.png"]
    try:
        build(ns, datetime.datetime.now(datetime.timezone.utc))
    except SystemExit as e:
        assert "recommendation" in str(e) and "asset id" in str(e), str(e)
    else:
        raise AssertionError("a question without a recommendation was accepted")
    print("ok")


if __name__ == "__main__":
    demo() if sys.argv[1:] == ["--self-test"] else main()
