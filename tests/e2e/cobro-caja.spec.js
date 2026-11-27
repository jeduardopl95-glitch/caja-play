async page => {
  return page.evaluate(async () => {
    const { leer, actualizar, finalizar, cambiarVenta, limpiarHistorial, hayLegado, migrar } = await import('/src/modules/cobro/caja.ts');
    const verificar = (condicion, mensaje) => { if (!condicion) throw Error(mensaje); };
    const rechazo = async (promesa, mensaje) => {
      try { await promesa; } catch (error) { verificar(mensaje.test(error.message), error.message); return; }
      throw Error('Se esperaba un error');
    };
    const tienda = 'JUNIOR';
    const item = {id:'uno', name:'Pan', codigo:'001', price:184, quantity:1};
    const pago = {metodo:'dolares', dolares:'20', cambio:'15'};
    let caja = await leer(tienda);
    caja = await actualizar(tienda, caja.revision, {cart:[item]});
    const anterior = caja;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      IDBObjectStore.prototype.put = put;
      const solicitud = put.apply(this, args);
      solicitud.onsuccess = () => this.transaction.abort();
      return solicitud;
    };
    await rechazo(finalizar(tienda, caja.revision, 'v1', pago), /abort|guardar/i);
    verificar((await leer(tienda)).cart.length === 1 && (await leer(tienda)).sales.length === 0, 'Escritura parcial');
    const dobles = await Promise.allSettled([
      finalizar(tienda, caja.revision, 'v1', pago), finalizar(tienda, caja.revision, 'v2', pago)
    ]);
    verificar(dobles.filter(x => x.status === 'fulfilled').length === 1, 'Cobro duplicado');
    caja = await leer(tienda);
    verificar(caja.sales[0].numero === 1 && !caja.cart.length, 'Venta o ticket incorrecto');
    verificar((await finalizar(tienda, anterior.revision, 'v1', pago)).sales.length === 1, 'Reintento duplicado');
    await rechazo(actualizar(tienda, anterior.revision, {cart:[item]}), /pestaña/);
    verificar((await leer('PLAYITA')).sales.length === 0, 'Se mezclaron sucursales');
    await rechazo(limpiarHistorial(tienda, caja.revision), /pendientes/);
    const fecha = caja.sales[0].fecha;
    caja = await cambiarVenta(tienda, caja.revision, 'v1', {traspasada:true});
    await rechazo(cambiarVenta(tienda, caja.revision, 'v1', null), /pendiente/);
    caja = await cambiarVenta(tienda, caja.revision, 'v1', {traspasada:false});
    caja = await cambiarVenta(tienda, caja.revision, 'v1', {items:[{...item, quantity:1,price:185}], pago});
    verificar(caja.sales[0].fecha === fecha && caja.sales[0].total === 18500, 'Edición incorrecta');
    caja = await actualizar(tienda, caja.revision, {cart:[item], cambio:'16'});
    verificar(caja.sales[0].pago.tasa === 1500, 'Se alteró el tipo de cambio histórico');
    caja = await cambiarVenta(tienda, caja.revision, 'v1', {traspasada:true});
    caja = await limpiarHistorial(tienda, caja.revision);
    verificar(caja.cart.length === 1 && caja.cambio === '16', 'La limpieza afectó ticket/configuración');
    caja = await finalizar(tienda, caja.revision, 'v3', {...pago,cambio:'16'});
    verificar(caja.sales[0].numero === 1, 'No se reinició numeración');
    const copia = {cart:[item],sales:[
      {id:'b',fecha:'27/11/2026 14:20',items:[item],total:184,efectivo:500,cambio:316,resumen:'Venta anterior'},
      {id:'a',fecha:'27/11/2026 14:15',items:[item],total:184,efectivo:184,cambio:0,resumen:'Venta anterior'}
    ]};
    localStorage.setItem('cajaplay_checkout', JSON.stringify(copia));
    verificar(await hayLegado(), 'No se detectó el almacenamiento anterior');
    const anteriorMigrada = await migrar('PLAYITA');
    verificar(anteriorMigrada.cart.length === 1 && anteriorMigrada.sales.length === 2 &&
      anteriorMigrada.sales[0].numero === 1 && anteriorMigrada.sales[1].pago.cambioMXN === 31600 &&
      anteriorMigrada.sales[0].fecha < anteriorMigrada.sales[1].fecha && anteriorMigrada.sales.every(v => v.sucursal === 'PLAYITA' && !v.traspasada), 'Copia anterior incompleta');
    verificar(!await hayLegado() && (await migrar('CHETUMALITO')).sales.length === 0 &&
      localStorage.getItem('cajaplay_checkout') === JSON.stringify(copia), 'La migración se repitió o borró los datos de origen');
    return 'Persistencia, conflicto, aborto, reintento e historial verificados';
  });
}
