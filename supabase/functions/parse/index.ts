// Brain – KI-Parser. Nimmt einen diktierten Satz und gibt strukturierte Felder zurück.
// Läuft auf Supabase (Deno). Der Anthropic-Schlüssel liegt nur hier als Secret, nie in der App.
import Anthropic from 'npm:@anthropic-ai/sdk@0.125.0';

const APP_ORIGIN = 'https://juto99.github.io';
const cors = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

// Ergebnis-Form: strict erzwingt, dass genau diese Felder zurückkommen.
const TOOL = {
  name: 'todo_erfassen',
  description: 'Gibt die erkannten Bestandteile eines diktierten To-dos zurück.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', description: 'Kurzer, aktiver Titel ohne Datums-, Personen- oder Projektangaben.' },
      description: { type: 'string', description: 'Zusätzliche Details, sonst leer.' },
      context: { type: 'string', description: 'Hintergrund/Begründung, sonst leer.' },
      area: { type: ['string', 'null'], enum: ['work', 'private', null], description: 'Arbeit oder Privat, sonst null.' },
      category: { type: ['string', 'null'], description: 'Name einer vorhandenen Unterkategorie oder null.' },
      persons: { type: 'array', items: { type: 'string' }, description: 'Vornamen der genannten Personen.' },
      project: { type: ['string', 'null'], description: 'Name des Projekts oder null.' },
      due_type: { type: 'string', enum: ['day', 'week', 'month', 'none'], description: 'Art der Deadline.' },
      due_date: { type: ['string', 'null'], description: 'Bei day: YYYY-MM-DD. Bei week: Montag der Woche als YYYY-MM-DD. Bei month: YYYY-MM. Sonst null.' },
      unsicher: { type: 'array', items: { type: 'string' }, description: 'Felder, bei denen die Zuordnung unsicher ist.' },
    },
    required: ['title', 'description', 'context', 'area', 'category', 'persons', 'project', 'due_type', 'due_date', 'unsicher'],
  },
} as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { text, today, weekday, people = [], projects = [], cats = [] } = await req.json();
    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'kein Text' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const system = [
      'Du wertest diktierte deutsche To-dos aus und füllst damit die Felder einer Aufgabenverwaltung.',
      `Heute ist ${weekday}, der ${today}. Rechne relative Angaben ("nächste Woche", "übermorgen", "Ende des Monats") in konkrete Daten um.`,
      'Wochen beginnen am Montag. "nächste Woche" oder "im Laufe der Woche" ist due_type "week" mit dem Montag dieser Woche; ein ganzer Monat ist due_type "month".',
      'Der Titel ist kurz und aktiv und enthält KEINE Datumsangabe mehr. Personennamen dürfen im Titel stehen bleiben.',
      people.length ? `Bekannte Personen: ${people.join(', ')}. Nutze exakt diese Schreibweise, wenn gemeint.` : 'Es sind noch keine Personen angelegt.',
      projects.length ? `Bekannte Projekte: ${projects.join(', ')}.` : 'Es sind noch keine Projekte angelegt.',
      cats.length ? `Bekannte Unterkategorien: ${cats.join(', ')}. Wähle nur daraus oder null.` : 'Es sind noch keine Unterkategorien angelegt.',
      'Neue Personen- oder Projektnamen darfst du zurückgeben, auch wenn sie noch nicht angelegt sind.',
      'Erfinde nichts. Was nicht gesagt wurde, bleibt leer bzw. null. Bei Zweifeln nenne das Feld in "unsicher".',
    ].join('\n');

    const res = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'todo_erfassen' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: text }],
    });

    const call = res.content.find((b) => b.type === 'tool_use');
    if (!call) {
      return new Response(JSON.stringify({ error: 'keine Auswertung', stop_reason: res.stop_reason }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, felder: call.input, usage: res.usage }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
