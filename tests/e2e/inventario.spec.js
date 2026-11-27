async page => {
  const origin = new URL(page.url()).origin;
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {value: async () => ({
      getTracks: () => [Object.assign(new EventTarget(), {stop:() => { window.camaraCerrada = true; }})]
    })});
  });
  await page.route(/\/[^/]*(?:zxing_browser|zxing\/browser)[^?]*(?:\?|$)/, route => route.fulfill({
    contentType:"application/javascript",
    body:`export class BrowserMultiFormatOneDReader {
      async decodeFromStream(stream,video,callback) {
        const controls={stop(){}};
        callback({getText:()=>"001"},undefined,controls);
        return controls;
      }
    }`
  }));
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin);
  const button = name => page.getByRole('button',{name,exact:true});
  await button('Inventario').click();
  await button('JUNIOR').click();
  await page.getByLabel('Archivo CSV').setInputFiles({
    name:'inventario-ficticio.csv',mimeType:'text/csv',
    buffer:Buffer.from('Código;Producto;Existencia;Departamento\n001;Pan ficticio;10.2;Abarrotes\n002;Agua ficticia;3;Bebidas\n003;Frijol ficticio;0;Abarrotes\n004;Arroz ficticio;2;Abarrotes\n750123;Coca-Cola 600 ml;5;Abarrotes')
  });
  await page.getByRole('combobox',{name:'Departamento',exact:true}).selectOption('Abarrotes');
  await page.getByText('4 productos del departamento',{exact:true}).waitFor();
  await button('Iniciar inventario').click();
  await page.getByRole('navigation',{name:'Vistas de Inventario'}).waitFor();
  const buscar = page.getByLabel('Descripción o código');
  await buscar.fill('Agua');
  await page.getByText('Bebidas · Otro departamento',{exact:true}).waitFor();
  await button('Escanear código').click();
  await page.getByLabel('Cantidad',{exact:true}).waitFor();
  if(await buscar.inputValue() !== '001' || !await page.evaluate(() => window.camaraCerrada)) throw Error('Scanner did not select and stop');
  await page.getByLabel('Cantidad',{exact:true}).fill('10.2');
  await button('Guardar conteo').click();
  await page.getByText('Conteo guardado.',{exact:true}).waitFor();
  await buscar.fill('Pan');
  await button('Pan ficticio 001').click();
  await button('Venta').click();
  await page.getByLabel('¿Cuántas piezas vendiste?',{exact:true}).fill('2');
  if (!await button('Guardar venta').isDisabled()) throw Error('Venta sin modalidad');
  await button('Solo algunas').click();
  const mixta = page.getByLabel(/cuántas habías contado previamente/);
  await mixta.fill('2');
  if (!await button('Guardar venta').isDisabled()) throw Error('Venta mixta igual al total');
  await mixta.fill('1');
  await page.getByText('10.2 → 9.2',{exact:true}).waitFor();
  await page.getByText('10.2 → 8.2',{exact:true}).waitFor();
  await button('Guardar venta').click();
  await page.getByText('Venta guardada.',{exact:true}).waitFor();
  await buscar.fill('Pan');
  await button('Pan ficticio 001').click();
  await button('Entrada').click();
  await page.getByLabel('Cantidad',{exact:true}).fill('0,3');
  await button('Guardar entrada').click();
  await page.getByText('Entrada guardada.',{exact:true}).waitFor();
  await buscar.fill('Frijol');
  await button('Frijol ficticio 003').click();
  await button('Confirmar cero piezas').click();
  await button('Confirmar revisión').click();
  await page.getByText('Conteo guardado.',{exact:true}).waitFor();
  await buscar.fill('EXT');
  await button('Registrar producto externo').click();
  await page.getByLabel('Nombre del producto externo').fill('Externo ficticio');
  await page.getByLabel('Cantidad',{exact:true}).fill('1');
  await button('Guardar conteo').click();
  await page.getByText('Conteo guardado.',{exact:true}).waitFor();
  await button('Guardar avance').click();
  await page.getByText('Avance guardado en este dispositivo.',{exact:true}).waitFor();
  await button('Pendientes').click();
  await button('Arroz ficticio 004').waitFor();
  if(await page.getByText('Frijol ficticio',{exact:true}).count()) throw Error('Reviewed zero appears pending');
  await button('Resultados').click();
  await page.getByText('Externo ficticio',{exact:true}).waitFor();
  await button('Historial').click();
  await button('Ventas (1)').click();
  const horaVenta = await page.locator('time').getAttribute('datetime');
  if (!/^\d{1,2}:\d{2}\s+[ap]\.\s*m\.$/i.test(await page.locator('time').innerText())) throw Error('Hora sin formato de 12 h');
  await button('Editar').first().click();
  if (await mixta.inputValue() !== '1') throw Error('La edición perdió el descuento físico');
  await button('Sí').click();
  await page.getByLabel('¿Cuántas piezas vendiste?',{exact:true}).fill('0.5');
  await button('Guardar cambios').click();
  await page.getByText('Movimiento actualizado.',{exact:true}).waitFor();
  if (await page.locator('time').getAttribute('datetime') !== horaVenta) throw Error('La edición cambió la hora');
  await button('Eliminar').first().click();
  await button('Cancelar').click();
  if(await button('Editar').count() !== 1) throw Error('Cancel deleted a movement');
  await page.reload(); await button('Inventario').click(); await button('JUNIOR').click();
  await button('Historial').click();
  if(await button('Editar').count() !== 3) throw Error('Inventory was not recovered');
  await button('Cambiar sucursal').click(); await button('CHETUMALITO').click();
  await page.getByLabel('Archivo CSV').waitFor();
  await button('Cambiar sucursal').click(); await button('JUNIOR').click();
  await button('Nuevo inventario').click();
  await button('Cancelar').click();
  await button('Historial').click();
  await button('Eliminar').first().click();
  await button('Eliminar movimiento').click();
  await page.getByText('Movimiento eliminado.',{exact:true}).waitFor();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Horizontal overflow');
  await button('Conteo').click();
  await buscar.fill('001'); await button('Pan ficticio 001').click();
  await page.getByLabel('Cantidad',{exact:true}).fill('1');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      window.intentoDeConteo = args[0].movimientos.at(-1);
      IDBObjectStore.prototype.put = put;
      const request = put.apply(this,args);
      request.addEventListener('success',()=>this.transaction.abort(),{once:true});
      return request;
    };
  });
  await button('Guardar conteo').click();
  await page.getByRole('alert').waitFor();
  if(await page.getByLabel('Cantidad',{exact:true}).inputValue() !== '1') throw Error('Failed save lost draft');
  if(await page.getByText('Conteo guardado.',{exact:true}).count()) throw Error('False save confirmation');
  const otra = await page.context().newPage();
  try {
    await otra.goto(origin);
    await otra.evaluate(async () => {
      const { abrirAlmacenInventario } = await import('/src/modules/inventario/almacenamiento.ts');
      const a = abrirAlmacenInventario(), inv = await a.leer('JUNIOR');
      await a.registrar(inv,{id:crypto.randomUUID(),codigo:'001',tipo:'entrada',cantidad:'0.1',fecha:new Date().toISOString()});
    });
    await button('Guardar conteo').click();
    await button('Recargar inventario').click();
    if(await page.getByLabel('Cantidad',{exact:true}).inputValue() !== '1') throw Error('Conflict reload lost draft');
    await button('Guardar conteo').click();
    await page.getByText('Conteo guardado.',{exact:true}).waitFor();
    const reintento = await page.evaluate(async () => {
      const { abrirAlmacenInventario } = await import('/src/modules/inventario/almacenamiento.ts');
      const inv = await abrirAlmacenInventario().leer('JUNIOR');
      const escritos = inv.movimientos.filter(m => m.id === window.intentoDeConteo.id);
      return escritos.length === 1 && escritos[0].registradoEn === window.intentoDeConteo.fecha;
    });
    if (!reintento) throw Error('El reintento duplicó el movimiento o cambió su hora original');
  } finally { await otra.close(); }
  await button('Volver al menú').click();
  for (const nombre of ['Cobro sin luz','Calculadora de precios','Caducidades']) {
    await button(nombre).click();
    await button('Volver al menú').click();
  }
  await button('Corte de caja').click();
  await button('Volver a inicio').waitFor();
  await button('Volver a inicio').click();
  await button('Inventario').click(); await button('JUNIOR').click();
  await buscar.fill('Pan'); await button('Pan ficticio 001').click();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Count layout overflows');
  await page.context().setOffline(true);
  try {
    const seleccionar = async () => {
      await buscar.fill('750123'); await button('Coca-Cola 600 ml 750123').click();
    };
    await seleccionar();
    await page.getByLabel('Cantidad',{exact:true}).fill('3');
    await button('Guardar conteo').click();
    await page.getByText('Conteo guardado.',{exact:true}).waitFor();
    await seleccionar();
    await button('Venta').click();
    const vendidas = page.getByLabel('¿Cuántas piezas vendiste?',{exact:true});
    await vendidas.fill('4');
    await button('Sí').click();
    await page.getByText('No puedes descontar más piezas de las que has contado físicamente.',{exact:true}).waitFor();
    if (!await button('Guardar venta').isDisabled()) throw Error('Venta supera físico');
    await button('Solo algunas').click();
    await mixta.fill('0');
    if (!await button('Guardar venta').isDisabled()) throw Error('Venta mixta en cero');
    await mixta.fill('5');
    if (!await button('Guardar venta').isDisabled()) throw Error('Venta mixta supera el total');
    await mixta.fill('3.1');
    await page.getByText('No puedes descontar más piezas de las que has contado físicamente.',{exact:true}).waitFor();
    await button('No').click();
    await page.getByText('3 → 3',{exact:true}).waitFor();
    await page.getByText('5 → 1',{exact:true}).waitFor();
    await button('Guardar venta').click();
    await page.getByText('Venta guardada.',{exact:true}).waitFor();
    await seleccionar();
    await button('Venta').click();
    await vendidas.fill('1');
    await button('Sí').click();
    await page.getByText('3 → 2',{exact:true}).waitFor();
    await page.getByText('1 → 0',{exact:true}).waitFor();
    await button('Guardar venta').click();
    await page.getByText('Venta guardada.',{exact:true}).waitFor();
    await button('Historial').click();
    const buscarHistorial = page.getByLabel('Buscar en historial');
    await button('Ventas (3)').click();
    for (const q of ['coca','coca 600','600 coca','cocacola','CÓCA','COCA-COLA','012','750123']) {
      await buscarHistorial.fill(q);
      await page.getByText('2 de 3 movimientos',{exact:true}).waitFor();
    }
    if (await page.locator('.inv-row').first().getByText('Venta · 1 · 1 ya contadas',{exact:true}).count() !== 1) throw Error('Orden incorrecto');
    await buscarHistorial.fill('Frijol');
    await page.getByText('No hay movimientos que coincidan.',{exact:true}).waitFor();
    await button('Limpiar búsqueda').click();
    if (await buscarHistorial.inputValue()) throw Error('No se limpió la búsqueda');
    await buscarHistorial.fill('cola');
    await button('Entradas (2)').click();
    if (await buscarHistorial.inputValue()) throw Error('Cambiar filtro no limpió la búsqueda');
    await button('Resultados').click();
    await button('Historial').click();
    if (await button('Entradas (2)').getAttribute('aria-pressed') !== 'true') throw Error('No se recordó el filtro');
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Historial desborda en móvil');
  } finally { await page.context().setOffline(false); }
  return 'Inventory flows, storage failure, tab conflict and existing module navigation verified';
}
