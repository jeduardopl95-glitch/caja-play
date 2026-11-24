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
    buffer:Buffer.from('Código;Producto;Existencia;Departamento\n001;Pan ficticio;10.2;Abarrotes\n002;Agua ficticia;3;Bebidas\n003;Frijol ficticio;0;Abarrotes\n004;Arroz ficticio;2;Abarrotes')
  });
  await page.getByRole('combobox',{name:'Departamento',exact:true}).selectOption('Abarrotes');
  await page.getByText('3 productos del departamento',{exact:true}).waitFor();
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
  await page.getByLabel('Cantidad',{exact:true}).fill('2');
  await page.getByLabel('Piezas ya contadas',{exact:true}).fill('1');
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
  await button('Editar').first().click();
  await page.getByLabel('Cantidad editada').fill('0.5');
  await button('Guardar cambios').click();
  await page.getByText('Movimiento actualizado.',{exact:true}).waitFor();
  await button('Eliminar').first().click();
  await button('Cancelar').click();
  if(await button('Editar').count() !== 5) throw Error('Cancel deleted a movement');
  await page.reload(); await button('Inventario').click(); await button('JUNIOR').click();
  await button('Historial').click();
  if(await button('Editar').count() !== 5) throw Error('Inventory was not recovered');
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
  return 'Inventory flows, storage failure, tab conflict and existing module navigation verified';
}
