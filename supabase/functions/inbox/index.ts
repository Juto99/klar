// Brain72 – Eingang für den iPhone-Kurzbefehl.
// Action-Button → diktieren → dieser Endpunkt → KI wertet aus → To-do landet im Eingang.
// Kein Login nötig: Der Kurzbefehl schickt ein persönliches Token, das in inbox_tokens steht.
import Anthropic from 'npm:@anthropic-ai/sdk@0.125.0';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

const rest = (pfad: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${pfad}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

const TOOL = {
  name: 'todo_erfassen',
  description: 'Gibt die erkannten Bestandteile eines diktierten To-dos zurück.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      area: { type: 'string', enum: ['work', 'private', ''] },
      category: { type: 'string' },
      persons: { type: 'array', items: { type: 'string' } },
      project: { type: 'string' },
      due_type: { type: 'string', enum: ['day', 'week', 'month', 'none'] },
      due_date: { type: 'string' },
      priority: { type: 'string', enum: ['high', 'med', 'low', ''] },
      importance: { type: 'string', enum: ['high', 'med', 'low', ''] },
      workload: { type: 'string', enum: ['high', 'med', 'low', ''] },
    },
    required: ['title', 'description', 'area', 'category', 'persons', 'project', 'due_type', 'due_date', 'priority', 'importance', 'workload'],
  },
} as const;

const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const pad = (n: number) => String(n).padStart(2, '0');
const isoTag = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const uuid = () => crypto.randomUUID();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  if (req.method !== 'POST') return json({ error: 'nur POST' }, 405);
  try {
    const { token, text } = await req.json().catch(() => ({}));
    if (!token || !text) return json({ error: 'token und text nötig' }, 400);

    // 1. Token prüfen
    const tr = await rest(`inbox_tokens?token=eq.${encodeURIComponent(token)}&select=user_id`);
    const treffer = tr.ok ? await tr.json() : [];
    if (!treffer.length) return json({ error: 'Token unbekannt' }, 401);
    const user_id = treffer[0].user_id;

    // 2. Stammdaten des Kontos laden (für Namenszuordnung)
    const ir = await rest(`items?user_id=eq.${user_id}&deleted=eq.false&kind=in.(cats,people,projects)&select=id,kind,data`);
    const stamm = ir.ok ? await ir.json() : [];
    const nimm = (k: string) => stamm.filter((r: any) => r.kind === k).map((r: any) => ({ id: r.id, ...r.data }));
    const cats = nimm('cats'), people = nimm('people'), projects = nimm('projects');

    // 3. Auswerten lassen
    const jetzt = new Date();
    const system = [
      'Du wertest diktierte deutsche To-dos aus und füllst damit die Felder einer Aufgabenverwaltung.',
      `Heute ist ${WD[jetzt.getDay()]}, der ${isoTag(jetzt)}. Rechne relative Angaben in konkrete Daten um.`,
      'Wochen beginnen am Montag. due_type "week" bekommt den Montag der Woche, "month" das Format YYYY-MM.',
      'Der Titel ist kurz, aktiv und ohne Datumsangabe. Personennamen dürfen im Titel bleiben.',
      people.length ? `Bekannte Personen: ${people.map((p: any) => p.name).join(', ')}.` : 'Noch keine Personen angelegt.',
      projects.length ? `Bekannte Projekte: ${projects.map((p: any) => p.name).join(', ')}.` : 'Noch keine Projekte angelegt.',
      cats.length ? `Bekannte Unterkategorien (JSON): ${JSON.stringify(cats.map((c: any) => ({ name: c.name, area: c.area })))}. Gib nur einen dieser Namen zurück oder leer.` : 'Noch keine Unterkategorien angelegt.',
      'Erfinde nichts. Was nicht gesagt wurde, bleibt leer.',
    ].join('\n');

    const res = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'todo_erfassen' },
      messages: [{ role: 'user', content: String(text) }],
    });
    const call: any = res.content.find((b: any) => b.type === 'tool_use');
    const f: any = call?.input ?? {};

    // 4. Namen auf IDs abbilden
    const finde = (liste: any[], name: string) => name ? liste.find((x: any) => String(x.name).toLowerCase() === String(name).toLowerCase()) : null;
    const cat = finde(cats, f.category);
    const proj = finde(projects, f.project);
    const persons = (f.persons || []).map((n: string) => finde(people, n)).filter(Boolean).map((p: any) => p.id);
    const area = ['work', 'private'].includes(f.area) ? f.area : (cat?.area ?? proj?.area ?? null);
    const due = f.due_type === 'day' && f.due_date ? { type: 'day', date: f.due_date }
      : f.due_type === 'week' && f.due_date ? { type: 'week', start: f.due_date }
      : f.due_type === 'month' && f.due_date ? { type: 'month', month: String(f.due_date).slice(0, 7) }
      : null;

    const id = uuid(), now = Date.now();
    const daten = {
      id,
      title: String(f.title || text).slice(0, 300),
      desc: String(f.description || ''),
      ctx: '',
      area, cat: cat?.id ?? null, persons, project: proj?.id ?? null, due,
      prio: ['high', 'med', 'low'].includes(f.priority) ? f.priority : null,
      imp: ['high', 'med', 'low'].includes(f.importance) ? f.importance : null,
      load: ['high', 'med', 'low'].includes(f.workload) ? f.workload : null,
      status: 'inbox',
      created: isoTag(jetzt), createdTs: now, doneAt: null,
      raw: String(text), source: 'wispr',
      updatedAt: now,
    };
    const w = await rest('items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify([{ id, user_id, kind: 'todos', data: daten, updated_at: now, deleted: false }]) });
    if (!w.ok) return json({ error: 'Speichern fehlgeschlagen', detail: (await w.text()).slice(0, 200) }, 500);

    await rest(`inbox_tokens?token=eq.${encodeURIComponent(token)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_used: new Date().toISOString() }) });
    return json({ ok: true, titel: daten.title, faellig: due });
  } catch (err) {
    console.error(err);
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
