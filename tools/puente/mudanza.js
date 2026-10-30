// La mudanza a la app (parte del puente): a quien escribe en Discord sin tener la cuenta vinculada, el
// bot le manda un mensaje privado por Discord, UNA sola vez, con que el servidor se esta mudando, que
// pronto las cuentas sin vincular no van a poder escribir en Discord, y como vincularla en un clic.
// En los canales no aparece nada. Si la persona tiene cerrados los mensajes privados, no se insiste.
// PUENTE_MUDANZA=0 lo apaga.

let db, api, log, warn, appName, publicUrl;
const enCurso = new Set();

function setup(ctx) {
  ({ db, api, log, warn, appName, publicUrl } = ctx);
  db.exec(`CREATE TABLE IF NOT EXISTS puente_mudanza_avisos (
    discord_user_id TEXT PRIMARY KEY, ultimo INTEGER NOT NULL, veces INTEGER NOT NULL DEFAULT 0
  )`);
  // md: cuando se le mando el mensaje privado (o se intento: con los privados cerrados no se reintenta)
  const cols = db.prepare("SELECT name FROM pragma_table_info('puente_mudanza_avisos')").all().map(c => c.name);
  if (!cols.includes('md')) db.exec('ALTER TABLE puente_mudanza_avisos ADD COLUMN md INTEGER');
}
const on = () => String(process.env.PUENTE_MUDANZA || '1').trim() !== '0';

function texto() {
  const app = appName();
  const url = (publicUrl || '') + '/puente/entrar';
  return [
    `👋 ¡Hola! El servidor de Discord donde escribís se está mudando a **${app}**.`,
    `Dentro de poco (la fecha todavía no está definida), **las cuentas de Discord sin vincular no van a poder escribir más ahí**. Mejor ir haciéndolo ahora: es un clic.`,
    `➡️ Entrá con tu Discord: <${url}>`,
    `Tus mensajes de Discord quedan en tu cuenta y seguís viendo todo lo del servidor, también desde ${app}. Si ya tenés cuenta, vinculá Discord desde "Mi cuenta".`,
  ].join('\n');
}

// Un mensaje de Discord de alguien sin cuenta vinculada (puente.js, al recibirlo)
async function aviso(msg) {
  if (!on() || !msg || !msg.author || msg.author.bot || msg.webhook_id) return;
  const id = String(msg.author.id);
  if (enCurso.has(id)) return;
  const r = db.prepare('SELECT md FROM puente_mudanza_avisos WHERE discord_user_id = ?').get(id);
  if (r && r.md) return; // ya se le escribio
  enCurso.add(id);
  try {
    // se anota antes de mandar: una sola vez, salga o no
    db.prepare(`INSERT INTO puente_mudanza_avisos (discord_user_id, ultimo, veces, md) VALUES (?, ?, 1, ?)
                ON CONFLICT(discord_user_id) DO UPDATE SET ultimo = excluded.ultimo, veces = veces + 1, md = excluded.md`).run(id, Date.now(), Date.now());
    const dm = await api('POST', '/users/@me/channels', { recipient_id: id });
    if (!dm || dm.__error || !dm.id) { warn(`mudanza: no se pudo abrir el privado con ${id} (${dm && dm.__error})`); return; }
    const res = await api('POST', `/channels/${dm.id}/messages`, { content: texto(), allowed_mentions: { parse: [] }, flags: 1 << 2 });
    if (res && res.__error) log(`mudanza: ${msg.author.username} tiene cerrados los privados (${res.__error})`);
    else log(`mudanza: privado a ${msg.author.username} (${id})`);
  } catch (err) { warn('mudanza:', err.message); }
  finally { enCurso.delete(id); }
}

module.exports = { setup, aviso };
