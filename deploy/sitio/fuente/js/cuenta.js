// "Mi cuenta" (circulovicioso.club/cuenta): quien sos y tus cuentas vinculadas, con la cuenta unica (cuenta.js del puente)
(function () {
  'use strict';
  var CHAT = 'https://chat.circulovicioso.club';
  var $ = function (id) { return document.getElementById(id); };
  var aca = location.origin + '/cuenta';
  function api(p, body) {
    var opt = { credentials: 'include', cache: 'no-store' };
    if (body) { opt.method = 'POST'; opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    return fetch(CHAT + p, opt).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'No se pudo.'); e.status = r.status; throw e; } return d; }); });
  }
  function mensaje(t, mal) { var m = $('c-mensaje'); m.textContent = t; m.hidden = !t; m.className = 'aviso cuenta__mensaje ' + (mal ? 'aviso--mal' : 'aviso--bien'); }

  // Volviendo de Discord o del foro
  var q = new URLSearchParams(location.search);
  if (q.get('vinculo')) {
    var que = q.get('vinculo') === 'foro' ? 'del foro' : 'de Discord';
    var ERR = { cancelado: 'Cancelaste la vinculación.', caducado: 'El paso caducó. Probá de nuevo.', ocupada: 'Esa cuenta ' + que + ' ya está vinculada a otra cuenta de Círculo Vicioso.', ban: 'Esa cuenta está suspendida.' };
    setTimeout(function () { q.get('ok') ? mensaje('¡Listo! Tu cuenta ' + que + ' quedó vinculada.') : mensaje(ERR[q.get('error')] || 'No se pudo vincular. Probá de nuevo.', true); }, 0);
    history.replaceState(null, '', location.pathname);
  }

  function vinculo(id, info, disponible, con, nombre) {
    var box = $(id), est = box.querySelector('.vinculo__estado'), btn = box.querySelector('button'), icono = box.querySelector('.vinculo__icono');
    if (info) {
      est.textContent = 'Vinculada: ' + (info.nombre || info.usuario) + (info.usuario && info.nombre && info.usuario !== info.nombre ? ' (@' + info.usuario + ')' : '');
      est.className = 'vinculo__estado es-bien';
      if (info.avatar) { icono.innerHTML = ''; var i = document.createElement('img'); i.src = info.avatar; i.alt = ''; icono.appendChild(i); }
      if (info.perfil) { var a = document.createElement('a'); a.href = info.perfil; a.textContent = ' · ver perfil'; a.target = '_blank'; a.rel = 'noopener'; est.appendChild(a); }
      btn.textContent = 'Desvincular'; btn.className = 'btn btn--chico btn--peligro';
      btn.onclick = function () {
        if (!confirm('¿Desvincular tu cuenta ' + nombre + '?' + (con === 'discord' ? ' Tu historial de Discord vuelve a quedar como importado.' : ' Ya no vas a poder entrar con ella.'))) return;
        btn.disabled = true;
        api('/puente/api/cuenta/desconectar', { con: con }).then(function () { mensaje('Cuenta ' + nombre + ' desvinculada.'); cargar(); }).catch(function (e) { mensaje(e.message, true); btn.disabled = false; });
      };
    } else {
      est.textContent = !disponible ? 'No disponible ahora' : con === 'foro' ? 'Sin unir · si no tenés cuenta en el foro, se crea sola la primera vez que entrás' : 'Sin vincular';
      est.className = 'vinculo__estado';
      btn.textContent = 'Conectar'; btn.className = 'btn btn--chico'; btn.disabled = !disponible;
      btn.onclick = function () {
        btn.disabled = true;
        api('/puente/api/cuenta/conectar', { con: con, volver: aca }).then(function (d) { location.href = d.url; }).catch(function (e) { mensaje(e.message, true); btn.disabled = false; });
      };
    }
  }

  function cargar() {
    return api('/puente/api/cuenta/perfil').then(function (d) {
      $('cargando').hidden = true; $('cuenta').hidden = false;
      document.title = d.nombre + ' · Tu cuenta - Circulo Vicioso Club';
      var av = $('c-avatar'); av.textContent = '';
      if (d.avatar) { var i = document.createElement('img'); i.src = d.avatar; i.alt = ''; i.className = 'cuenta__avatar'; av.replaceWith(i); i.id = 'c-avatar'; }
      else av.textContent = (d.nombre || '?').charAt(0).toUpperCase();
      $('c-nombre').textContent = d.nombre;
      $('c-usuario').textContent = '@' + d.usuario + (d.admin ? ' · administrador' : '') + (d.email ? (d.email.confirmado ? ' · email confirmado' : ' · email sin confirmar') : ' · sin email');
      // CV Chat y la pagina son la misma cuenta
      var ec = $('v-chat').querySelector('.vinculo__estado'); ec.textContent = 'La misma cuenta: @' + d.usuario + ' · ';
      var ab = document.createElement('a'); ab.href = CHAT + '/app'; ab.textContent = 'abrir'; ec.appendChild(ab);
      var dp = $('c-dos-pasos'); dp.textContent = '';
      dp.appendChild(document.createTextNode(d.dosPasos ? '✓ Activada. Vale para todo: la página, el foro y el chat te piden el código al entrar. ' : 'Desactivada. Si la activás en los ajustes del chat, vale para todo: la página, el foro y el chat. '));
      var cf = document.createElement('a'); cf.href = CHAT + '/app'; cf.textContent = d.dosPasos ? 'Cambiarla en el chat' : 'Activarla en el chat'; dp.appendChild(cf);
      if (d.dosPasos) dp.classList.add('es-bien');
      vinculo('v-discord', d.discord, d.disponible.discord, 'discord', 'de Discord');
      vinculo('v-foro', d.foro, d.disponible.foro, 'foro', 'del foro');
      $('c-salir').href = CHAT + '/puente/cuenta/salir?volver=' + encodeURIComponent(location.origin + '/');
      return api('/puente/api/wiki/mias').then(function (m) {
        var ul = $('c-aportes'); ul.textContent = '';
        var EST = { pendiente: 'por revisar', aprobada: 'aprobada', rechazada: 'no aprobada' };
        if (!m.propuestas.length) { ul.innerHTML = '<li class="chico">Todavía no aportaste nada. <a href="/wiki?aportar=1">Escribí tu primera entrada</a>.</li>'; return; }
        m.propuestas.forEach(function (p) {
          var li = document.createElement('li'), a = document.createElement('a'), c = document.createElement('span');
          a.textContent = p.titulo; a.href = p.slug ? '/wiki/' + p.slug + '?version=' + p.id : '/wiki';
          c.className = 'estado-chip ' + p.estado; c.textContent = EST[p.estado] || p.estado; if (p.nota) c.title = p.nota;
          li.appendChild(a); li.appendChild(c); ul.appendChild(li);
        });
      }).catch(function () { $('c-aportes').innerHTML = '<li class="chico">No se pudieron cargar.</li>'; });
    }).catch(function (e) {
      $('cargando').hidden = true;
      if (e.status === 401) {
        $('sin-sesion').hidden = false;
        $('s-entrar').href = CHAT + '/?volver=' + encodeURIComponent(aca);
        $('s-registro').href = CHAT + '/?registro=1&volver=' + encodeURIComponent(aca);
      } else { $('cuenta').hidden = false; mensaje('No se pudo cargar tu cuenta. Probá de nuevo en un momento.', true); }
    });
  }
  cargar();
})();
