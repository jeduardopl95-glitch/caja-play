async page => {
  await page.goto(new URL(page.url()).origin);
  page.setDefaultTimeout(5000);
  const contexto = await page.evaluate(async () => {
    const seguridad = { seguro: isSecureContext, uuid: typeof crypto.randomUUID, entropia: typeof crypto.getRandomValues };
    const { abrirAlmacenInventario } = await import('/src/modules/inventario/almacenamiento.ts');
    const almacen = window.almacenPrueba = abrirAlmacenInventario();
    const uuid = crypto.randomUUID?.() ?? 'ec6f0f76-70d0-4dc4-906c-ab40688eb949';
    Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=>uuid});
    let guardado = await almacen.crear({sucursal:'PLAYITA',departamento:'Pruebas',fechaReferencia:'2026-11-24T14:00:00Z'},[
      {codigo:'P1',descripcion:'Producto previo',departamento:'Pruebas',original:'2'}
    ]);
    guardado = await almacen.registrar(guardado,{id:'mov-previo',codigo:'P1',tipo:'conteo',cantidad:'1',fecha:'2026-11-24T14:01:00Z'});
    Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});
    window.inventarioPrevio = JSON.stringify(guardado);
    return seguridad;
  });
  const boton = name => page.getByRole('button',{name,exact:true});
  await boton('Inventario').click();
  await boton('JUNIOR').click();
  await page.getByLabel('Archivo CSV').setInputFiles({
    name:'ficticio.csv',mimeType:'text/csv',
    buffer:Buffer.from('Código;Producto;Existencia;Departamento\n001;Pan ficticio;2;Abarrotes')
  });
  await boton('Iniciar inventario').click();
  const fallo = await page.getByRole('alert').textContent({timeout:1000}).catch(() => null);
  if (fallo) throw Error(fallo);
  await page.getByText('Inventario iniciado.',{exact:true}).waitFor();
  await page.getByLabel('Descripción o código').fill('001');
  await boton('Pan ficticio 001').click();
  await page.getByLabel('Cantidad',{exact:true}).fill('1');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(estado,...args) {
      IDBObjectStore.prototype.put = put;
      window.intentoId = estado.movimientos.at(-1).id;
      const request = put.call(this,estado,...args);
      request.addEventListener('success',()=>this.transaction.abort(),{once:true});
      return request;
    };
  });
  await boton('Guardar conteo').click();
  await page.getByRole('alert').waitFor();
  await boton('Guardar conteo').click();
  await page.getByText('Conteo guardado.',{exact:true}).waitFor();
  const datos = await page.evaluate(async () => ({
    nuevo: await window.almacenPrueba.leer('JUNIOR'),
    previoIgual: JSON.stringify(await window.almacenPrueba.leer('PLAYITA')) === window.inventarioPrevio,
    intentoId: window.intentoId
  }));
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const id = datos.nuevo.movimientos[0].id;
  if (!uuidV4.test(datos.nuevo.id) || !uuidV4.test(id) || id === datos.nuevo.id || id !== datos.intentoId ||
    datos.nuevo.movimientos.length !== 1 || !datos.previoIgual) throw Error('IDs, retry or previous inventory changed');
  return contexto;
}
