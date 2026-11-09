// Una funcion por cada pedido de contrato.js (A_SERVIDOR). Todas devuelven una promesa con la
// respuesta del servidor: {ok:true,...} o {error:'texto en voseo'}. Los nombres de los eventos
// salen siempre de contrato.js, nunca de strings sueltos. Los de las fases 3 a 6 quedan listos
// aunque el cliente todavia no los use.
//
// crearApi(transporte, contrato) -> { hola, perfil, ... }

export function crearApi(t, C) {
  const S = C.A_SERVIDOR;
  const e = (ev) => (datos) => t.emitir(ev, datos || {});
  return {
    hola: e(S.HOLA),              // fase 1
    perfil: e(S.PERFIL),          // fase 1
    sigo: e(S.SIGO),              // fase 1
    ausente: e(S.AUSENTE),        // fase 1
    salir: e(S.SALIR),            // fase 1
    salas: e(S.SALAS),            // fase 1
    nav: e(S.NAV),                // fase 1
    salaCrear: e(S.SALA_CREAR),   // fase 1
    salaEditar: e(S.SALA_EDITAR), // fase 1
    salaBorrar: e(S.SALA_BORRAR), // fase 1
    entrar: e(S.ENTRAR),          // fase 1
    ir: e(S.IR),                  // fase 1
    mirar: e(S.MIRAR),            // fase 1
    decir: e(S.DECIR),            // fase 1
    escribe: e(S.ESCRIBE),        // fase 1
    gesto: e(S.GESTO),            // fase 1
    pedir: e(S.PEDIR),            // fase 1
    inventario: e(S.INVENTARIO),  // fase 1
    poner: e(S.PONER),            // fase 1
    mover: e(S.MOVER),            // fase 1
    rotar: e(S.ROTAR),            // fase 1
    usar: e(S.USAR),              // fase 1
    levantar: e(S.LEVANTAR),      // fase 1
    pintar: e(S.PINTAR),          // fase 1
    derechos: e(S.DERECHOS),      // fase 1
    echar: e(S.ECHAR),            // fase 1
    vetar: e(S.VETAR),            // fase 1
    ficha: e(S.FICHA),            // fase 1
    denunciar: e(S.DENUNCIAR),    // fase 1
    mod: e(S.MOD),                // fase 1
    comprar: e(S.COMPRAR),        // fase 3
    tratoPedir: e(S.TRATO_PEDIR), // fase 4
    tratoResponder: e(S.TRATO_RESPONDER), // fase 4
    tratoOfrecer: e(S.TRATO_OFRECER), // fase 4
    tratoListo: e(S.TRATO_LISTO), // fase 4
    tratoConfirmar: e(S.TRATO_CONFIRMAR), // fase 4
    tratoCancelar: e(S.TRATO_CANCELAR), // fase 4
    propuestas: e(S.PROPUESTAS),  // fase 5
    propuestaGuardar: e(S.PROPUESTA_GUARDAR), // fase 5
    propuestaEnviar: e(S.PROPUESTA_ENVIAR), // fase 5
    propuestaBorrar: e(S.PROPUESTA_BORRAR), // fase 5
    notaPegar: e(S.NOTA_PEGAR),   // fase 6
    notaEscribir: e(S.NOTA_ESCRIBIR), // fase 6
    notaBorrar: e(S.NOTA_BORRAR), // fase 6
  };
}

// Los nombres de las funciones, en el mismo orden que A_SERVIDOR (para las pruebas).
export function nombreDeFuncion(clave) {
  return clave.toLowerCase().replace(/_([a-z])/g, (m, c) => c.toUpperCase());
}
