async page => {
  const origin = new URL(page.url()).origin;
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin);
  await page.evaluate(async () => {
    const { abrirAlmacenInventario } = await import('/src/modules/inventario/almacenamiento.ts');
    const a = window.inventarioPrueba = abrirAlmacenInventario();
    await a.crear({sucursal:'PLAYITA',departamento:'Pruebas',fechaReferencia:'2026-11-24T14:00:00Z'},[
      {codigo:'P1',descripcion:'Producto ficticio',departamento:'Pruebas',original:'0.3'}
    ]);
    Object.defineProperty(navigator,'canShare',{value:()=>!!window.compartirDisponible});
    Object.defineProperty(navigator,'share',{value:async ({files})=>{
      window.archivoCompartido = {type:files[0].type, text:new TextDecoder('windows-1252').decode(await files[0].arrayBuffer())};
      if(window.cancelar) throw new DOMException('Canceled','AbortError');
    }});
  });
  const boton = name => page.getByRole('button',{name,exact:true});
  await boton('Inventario').click();
  await boton('PLAYITA').click();
  await boton('Resultados').click();
  await page.evaluate(async () => {
    const a = window.inventarioPrueba;
    const inv = await a.leer('PLAYITA');
    await a.registrar(inv,{id:'externo',codigo:'EXT',tipo:'conteo',cantidad:'0.1',fecha:'2026-11-24T14:00:01Z'},
      {codigo:'EXT',descripcion:'Guardado externo reciente',departamento:null,original:null});
  });
  await boton('Generar PDF').click();
  await page.getByText('Reporte listo.',{exact:true}).waitFor();
  if (await boton('Compartir PDF').count()) throw Error('Share shown without file support');
  const descarga = page.waitForEvent('download');
  await boton('Descargar PDF').click();
  if (!(await descarga).suggestedFilename().endsWith('.pdf')) throw Error('Expected a PDF download');
  await page.evaluate(() => { window.compartirDisponible = true; window.cancelar = true; });
  await boton('Generar PDF').click();
  await boton('Compartir PDF').click();
  await page.waitForFunction(() => !!window.archivoCompartido);
  const datos = await page.evaluate(async () => ({
    ...window.archivoCompartido, revision:(await window.inventarioPrueba.leer('PLAYITA')).revision
  }));
  if (datos.type !== 'application/pdf' || !datos.text.startsWith('%PDF') || !datos.text.includes('Guardado externo reciente')) {
    throw Error('Share did not use the most recent committed data');
  }
  if (datos.revision !== 1 || await page.getByRole('alert').count()) throw Error('Export or cancellation changed inventory');
  await page.evaluate(() => { window.cancelar = false; window.archivoCompartido = undefined; });
  await boton('Compartir PDF').click();
  await page.waitForFunction(() => !!window.archivoCompartido);
  if (await page.evaluate(async () => (await window.inventarioPrueba.leer('PLAYITA')).revision) !== 1) throw Error('Sharing changed inventory');
  return 'Download fallback, native share handoff, cancellation and committed snapshot verified';
}
