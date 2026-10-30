// La mudanza a la app (parte del puente): a quien escribe en Discord sin tener la cuenta vinculada, el
// bot le contesta ahi mismo (como mucho una vez por dia a cada uno) que el servidor se esta mudando,
// que pronto las cuentas sin vincular no van a poder escribir en Discord, y como vincularla en un clic.
// La respuesta no llega a la app (el puente no trae los mensajes del bot) y no menciona a nadie.
// PUENTE_MUDANZA=0 la apaga.

let db, api, log, warn, appName, publicUrl;
const CADA_MS = 24 * 3600e3;
const enCurso = new Set();

function setup(ctx) {
  ({ db, api, log, warn, appName, publicUrl } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_mudanza_avisos (
    discord_user_id TEXT PRIMARY KEY, ultimo INTEGER NOT NULL, veces INTEGER NOT NULL DEFAULT 0
  )`);
}
const on = () => String(process.env.PUENTE_MUDANZA || '1').trim() !== '0';

function texto(msg) {
  const app = appName();
  const url = (publicUrl || '') + '/puente/entrar';
  return [
    `👋 Este servidor se está mudando a **${app}**.`,
    `Dentro de poco (la fecha todavía no está definida), **las cuentas de Discord sin vincular no van a poder escribir más acá**. Mejor ir haciéndolo ahora: es un clic.`,
    `➡️ Entrá con tu Discord: <${url}>`,
    `Tus mensajes de Discord quedan en tu cuenta y seguís viendo todo lo de acá, también desde ${app}. Si ya tenés cuenta, vinculá Discord desde "Mi cuenta".`,
  ].join('\n');
}

// Un mensaje de Discord de alguien sin cuenta vinculada (puente.js, al recibirlo)
async function aviso(msg) {
  if (!on() || !msg || !msg.author || msg.author.bot || msg.webhook_id || !msg.channel_id) return;
  const id = String(msg.author.id);
  if (enCurso.has(id)) return;
  const r = db.prepare('SELECT ultimo FROM puente_mudanza_avisos WHERE discord_user_id = ?').get(id);
  if (r && Date.now() - r.ultimo < CADA_MS) return;
  enCurso.add(id);
  try {
    // se anota antes de mandar: si Discord falla, no se reintenta enseguida con cada mensaje
    db.prepare(`INSERT INTO puente_mudanza_avisos (discord_user_id, ultimo, veces) VALUES (?, ?, 1)
                ON CONFLICT(discord_user_id) DO UPDATE SET ultimo = excluded.ultimo, veces = veces + 1`).run(id, Date.now());
    const res = await api('POST', `/channels/${msg.channel_id}/messages`, {
      content: texto(msg),
      message_reference: { message_id: msg.id, fail_if_not_exists: false },
      allowed_mentions: { parse: [], replied_user: false },
      flags: 1 << 2, // sin vista previa del enlace
    });
    if (res && res.__error) warn(`mudanza: no se pudo avisar a ${id} (${res.__error})`);
    else log(`mudanza: aviso a ${msg.author.username} (${id})`);
  } catch (err) { warn('mudanza:', err.message); }
  finally { enCurso.delete(id); }
}

module.exports = { setup, aviso };
