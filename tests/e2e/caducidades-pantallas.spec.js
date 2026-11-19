async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/rest/v1/caducidad_accesos?*', route => route.fulfill({json:[{sucursal:'CHETUMALITO'},{sucursal:'JUNIOR'}]}));
  const today = new Date().toLocaleDateString('en-CA', {timeZone:'America/Cancun'});
  const date = days => new Date(Date.parse(today) + days * 86400000).toISOString().slice(0,10);
  let rows = [
    {id:'1',producto:'Promocion prueba',departamento:'Abarrotes',fecha:date(22)},
    {id:'2',producto:'Cambio prueba',departamento:'Coca Cola',fecha:date(5)},
    {id:'3',producto:'Futuro prueba',departamento:'Abarrotes',fecha:date(40)},
    {id:'4',producto:'Vencido prueba',departamento:'Abarrotes',fecha:date(-1)}
  ].map(row => ({...row,cantidad:2,codigo:null,proveedor:null,resuelto:false}));
  await page.route('**/rest/v1/caducidades?*', route => {
    if (route.request().method() === 'PATCH') {
      const id = new URL(route.request().url()).searchParams.get('id').slice(3);
      rows = rows.map(row => row.id === id ? {...row,resuelto:true} : row);
      return route.fulfill({json:{id}});
    }
    const resolved = new URL(route.request().url()).searchParams.get('resuelto') === 'eq.true';
    return route.fulfill({json:rows.filter(row => row.resuelto === resolved)});
  });
  await page.reload();
  await page.getByRole('button',{name:'Caducidades',exact:true}).click();
  await page.getByRole('button',{name:'JUNIOR',exact:true}).click();
  for (const label of ['Visitas de proveedores','Ingresar fecha de caducidad','Listos para poner en promoción','Listos para cambio con proveedor','Consultar todos los registros']) {
    await page.getByRole('button',{name:label,exact:true}).waitFor();
  }
  if (await page.getByLabel('Piezas').count() || await page.getByText('Futuro prueba',{exact:true}).count()) throw new Error('Menu contains form or records');
  await page.getByRole('button',{name:'Listos para cambio con proveedor',exact:true}).click();
  await page.getByText('Cambio prueba',{exact:false}).waitFor();
  if (await page.getByText('Futuro prueba',{exact:false}).count()) throw new Error('Future record in alerts');
  await page.getByRole('button',{name:'Marcar como resuelto',exact:true}).click();
  await page.getByText('No hay productos para esta sección.').waitFor();
  await page.getByRole('button',{name:'Volver a caducidades',exact:true}).click();
  await page.getByRole('button',{name:'Listos para poner en promoción',exact:true}).click();
  await page.getByText('Vencido prueba',{exact:false}).waitFor();
  await page.getByText('Promocion prueba',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Volver a caducidades',exact:true}).click();
  await page.getByRole('button',{name:'Visitas de proveedores',exact:true}).click();
  await page.getByText('No hay calendario disponible para JUNIOR.').waitFor();
  await page.getByRole('button',{name:'Volver a caducidades',exact:true}).click();
  await page.getByRole('button',{name:'Consultar todos los registros',exact:true}).click();
  await page.getByText('Futuro prueba',{exact:true}).waitFor();
  await page.getByRole('combobox').selectOption('resueltos');
  await page.getByText('Cambio prueba',{exact:true}).waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Horizontal overflow');
  return 'Independent screens, Junior alerts, expired items and resolution verified';
}
