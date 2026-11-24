async page => {
  const origin = new URL(page.url()).origin;
  const url = origin + '/prueba-inventario';
  await page.context().route(url, route => route.fulfill({contentType:'text/html',body:'<html lang="es"><title>Prueba IndexedDB</title></html>'}));
  const otra = await page.context().newPage();
  const ejecutar = (tab, codigo) => tab.evaluate(async codigo => {
    const { abrirAlmacenInventario } = await import('/src/modules/inventario/almacenamiento.ts');
    const a = window.almacen ??= abrirAlmacenInventario();
    return await eval(codigo)(a);
  }, codigo);
  const inicial = `async a => {
    const crear = sucursal => a.crear({sucursal,departamento:'Abarrotes',fechaReferencia:'2026-11-24T00:00:00Z'},[
      {codigo:'001',descripcion:'Pan ficticio',departamento:'Abarrotes',original:'10.2'},
      {codigo:'002',descripcion:'Agua ficticia',departamento:'Bebidas',original:'3'}
    ]);
    await crear('JUNIOR'); await crear('CHETUMALITO');
    try { await crear('JUNIOR'); } catch(e) { return e.message; }
    throw Error('Sobrescritura permitida');
  }`;
  const conteo = {id:'m1',codigo:'001',tipo:'conteo',cantidad:'10.2',fecha:'2026-11-24T00:00:01Z'};
  const venta = {...conteo,id:'m2',tipo:'venta',cantidad:'8',contabilizadas:'8',fecha:'2026-11-24T00:00:02Z'};
  const entrada = {...conteo,id:'m3',tipo:'entrada',cantidad:'0.1',fecha:'2026-11-24T00:00:03Z'};
  try {
    await page.goto(url); await otra.goto(url);
    if (!/activo/i.test(await ejecutar(page,inicial))) throw Error('Error de sobrescritura incorrecto');
    const resultado = await ejecutar(page,`async a => {
      const inv = await a.leer('JUNIOR');
      const guardar = a.registrar(inv, ${JSON.stringify(conteo)});
      const [confirmado] = await Promise.all([guardar, a.confirmarGuardado()]);
      return confirmado.revision;
    }`);
    if (resultado !== 1) throw Error('No se guardo el conteo');
    await page.reload();
    const recuperado = await ejecutar(page,`async a => a.leer('JUNIOR')`);
    if (recuperado.catalogo[0].original !== '10.2' || recuperado.catalogo.length !== 2 || recuperado.movimientos.length !== 1) throw Error('No recupero catalogo o historial');
    const clave = JSON.stringify({sucursal:'JUNIOR',id:recuperado.id,revision:1});
    const intentar = (tab,m) => ejecutar(tab,`async a => {
      try { await a.registrar(${clave}, ${JSON.stringify(m)}); return 'ok'; }
      catch(e) { if (/pestana|actualiz/i.test(e.message)) return 'conflicto'; throw e; }
    }`);
    // Two tabs use the same snapshot. Only one can commit a new write.
    const carrera = await Promise.all([intentar(page,venta),intentar(otra,entrada)]);
    if (carrera.sort().join() !== 'conflicto,ok') throw Error('Conflicto entre pestanas sin proteger');
    await ejecutar(page,`async a => {
      const assert = (ok, msg) => { if(!ok) throw Error(msg); };
      const rechaza = async (fn,re) => { try { await fn(); } catch(e) { if(re.test(e.message)) return; throw e; } throw Error('Se esperaba rechazo'); };
      let inv = await a.leer('JUNIOR');
      if (inv.movimientos[1].tipo === 'entrada') inv = await a.registrar(inv,{...${JSON.stringify(venta)},fecha:'2026-11-24T00:00:04Z'});
      const v = inv.movimientos.find(m=>m.id==='m2');
      assert((await a.registrar(${clave},v)).revision === inv.revision,'Reintento no idempotente');
      await rechaza(()=>a.registrar(inv,{...v,cantidad:'9'}),/identificador/i);
      await rechaza(()=>a.corregir(inv,'m1','5'),/m2/);
      await rechaza(()=>a.corregir(inv,'m1',null),/m2/);
      inv = await a.corregir(inv,'m2','7','6');
      inv = await a.corregir(inv,'m2',null);
      await rechaza(()=>a.registrar(inv,v),/identificador/i);
      await rechaza(()=>a.registrar(inv,{...${JSON.stringify(entrada)},id:'ext-1',codigo:'001'}, {codigo:'001',descripcion:'Colision',departamento:null,original:null}),/codigo/i);
      assert((await a.leer('CHETUMALITO')).movimientos.length===0,'Sucursales mezcladas');
      inv = await a.registrar(inv,{...${JSON.stringify(entrada)},id:'ext-1',codigo:'EXT',fecha:'2026-11-24T00:00:05Z'}, {codigo:'EXT',descripcion:'Externo ficticio',departamento:null,original:null});
      assert((await a.leer('JUNIOR')).externos[0].original===null,'Externo sin persistir');
      const intento = {...${JSON.stringify(conteo)},id:'reintento',fecha:'2026-11-24T00:00:06Z'};
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) {
        const op = put.apply(this,args);
        op.addEventListener('success',()=>this.transaction.abort(),{once:true});
        return op;
      };
      try {
        const escritura = a.registrar(inv,intento);
        const [operacion,manual] = await Promise.allSettled([escritura,a.confirmarGuardado('JUNIOR')]);
        assert(operacion.status==='rejected' && manual.status==='rejected','Confirmacion falsa tras aborto');
      } finally { IDBObjectStore.prototype.put = put; }
      assert((await a.leer('JUNIOR')).revision === inv.revision,'El aborto dejo cambios parciales');
      inv = await a.registrar(inv,intento);
      await a.confirmarGuardado('JUNIOR');
      assert(inv.movimientos.filter(m=>m.id==='reintento').length===1,'No se pudo reintentar con el mismo ID');
      await rechaza(()=>a.eliminar(${clave}),/pestana|actualiz/i);
      await a.eliminar(inv);
      assert(await a.leer('JUNIOR')===null && (await a.leer('CHETUMALITO')).catalogo.length===2,'Borrado fuera de alcance');
      const nuevo = await a.crear({sucursal:'JUNIOR',departamento:'Abarrotes',fechaReferencia:'2026-11-24T00:00:00Z'}, inv.catalogo);
      await rechaza(()=>a.registrar(inv,intento),/inventario cambio/i);
      assert(nuevo.id!==inv.id && (await a.leer('JUNIOR')).movimientos.length===0,'Una clave vieja afecto el nuevo inventario');
    }`);
    return 'IndexedDB: recuperacion, concurrencia, reintentos, historial y sucursales correctos';
  } finally { await otra.close(); }
}
