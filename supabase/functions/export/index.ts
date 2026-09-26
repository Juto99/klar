// Brain72 – Export für das Second Brain (nur lesen).
// Aufruf: GET …/functions/v1/export mit Header  x-export-key: <Schlüssel>  (oder ?key=…)
// Der Schlüssel liegt als Secret BRAIN72_EXPORT_KEY auf Supabase und lokal auf Tobias' Mac
// (~/.config/brain72/export-key). Er erlaubt ausschließlich Lesen; schreiben kann er nichts.
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KEY = Deno.env.get('BRAIN72_EXPORT_KEY') || '';
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const rest = (pfad: string) => fetch(`${SB_URL}/rest/v1/${pfad}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });

Deno.serve(async (req) => {
  if (req.method !== 'GET') return json({ ok: false, nachricht: 'Nur GET' }, 405);
  const url = new URL(req.url);
  const key = req.headers.get('x-export-key') || url.searchParams.get('key') || '';
  if (!KEY || key !== KEY) return json({ ok: false, nachricht: 'Schlüssel fehlt oder falsch' }, 401);
  try {
    const r = await rest('items?deleted=eq.false&select=id,user_id,kind,data,updated_at&order=updated_at.desc&limit=5000');
    if (!r.ok) return json({ ok: false, nachricht: 'Datenbank nicht erreichbar', detail: (await r.text()).slice(0, 200) }, 500);
    const rows: any[] = await r.json();
    const users = [...new Set(rows.map((x: any) => x.user_id))];
    const uid = url.searchParams.get('user') || (users.length === 1 ? users[0] : '');
    if (!uid) return json({ ok: false, nachricht: 'Mehrere Konten vorhanden – user angeben', konten: users.length }, 409);
    const mine = rows.filter((x: any) => x.user_id === uid);
    const by = (k: string) => mine.filter((x: any) => x.kind === k).map((x: any) => ({ ...(x.data || {}), id: x.id }));
    const cats: any[] = by('cats'), people: any[] = by('people'), projects: any[] = by('projects');
    const name = (liste: any[], id: string | null) => (id ? (liste.find((x: any) => x.id === id)?.name ?? null) : null);
    const todos = by('todos').map((t: any) => ({
      id: t.id,
      title: t.title ?? '',
      desc: t.desc ?? '',
      ctx: t.ctx ?? '',
      area: t.area ?? null,
      category: name(cats, t.cat ?? null),
      project: name(projects, t.project ?? null),
      persons: (t.persons || []).map((p: string) => name(people, p)).filter(Boolean),
      due: t.due ?? null,
      urgency: t.prio ?? null,
      importance: t.imp ?? null,
      effort: t.load ?? null,
      status: t.status ?? 'open',
      parked: !!t.parked,
      created: t.created ?? null,
      doneAt: t.doneAt ?? null,
      archivedAt: t.archivedAt ?? null,
      updatedAt: t.updatedAt ?? null,
      source: t.source ?? 'app',
    }));
    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      counts: { todos: todos.length, cats: cats.length, people: people.length, projects: projects.length },
      todos,
      cats: cats.map((c: any) => ({ id: c.id, name: c.name ?? '', area: c.area ?? null, parent: c.parent ?? null })),
      people: people.map((p: any) => ({ id: p.id, name: p.name ?? '' })),
      projects: projects.map((p: any) => ({ id: p.id, name: p.name ?? '', area: p.area ?? null })),
    });
  } catch (err) {
    return json({ ok: false, nachricht: 'Fehler – ' + String((err as Error)?.message ?? err) }, 500);
  }
});
