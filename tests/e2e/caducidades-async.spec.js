async page => {
  await page.route('**/*supabase*js*', route => route.fulfill({contentType:'application/javascript', body:`
    export function createClient() {
      return {
        auth: {onAuthStateChange(callback) { window.authChange = callback; queueMicrotask(() => callback('SIGNED_IN', {user:{id:'a'}})); return {data:{subscription:{unsubscribe(){}}}}; }},
        from(table) {
          const q = {table, method:'GET', filters:{}};
          const chain = {
            select(){return chain}, order(){return chain}, limit(){return chain}, abortSignal(){return chain}, or(){return chain}, single(){return chain},
            eq(key,value){q.filters[key]=value;return chain},
            insert(row){q.method='POST';q.row=row;return chain}, update(row){q.method='PATCH';q.row=row;return chain},
            then(resolve,reject){return window.fakeRequest(q).then(resolve,reject)}
          }; return chain;
        }
      };
    }
  `}));
  await page.addInitScript(() => {
    window.mode = 'ok'; window.writes = 0; window.saved = [];
    window.fakeRequest = async q => {
      if(q.table === 'caducidad_accesos') return {data:[{sucursal:'CHETUMALITO'},{sucursal:'JUNIOR'}]};
      if(q.method === 'GET') {
        const result = {data:[{id:'base',producto:q.filters.sucursal,fecha:'2026-01-01',cantidad:1,departamento:'Abarrotes',resuelto:q.filters.resuelto}]};
        if(window.delayRead === q.filters.sucursal) return new Promise(resolve => window.releaseRead = () => resolve(result));
        return result;
      }
      window.writes++;
      if(window.mode === 'throw') throw Error('test exception');
      if(window.mode === 'error') return {error:{message:'test error'}};
      if(window.mode === 'empty') return {data:null,error:null};
      const result = {data:{id:String(window.writes),...q.row}};
      if(window.mode === 'delay') return new Promise(resolve => window.releaseWrite = () => resolve(result));
      if(window.mode === 'lost') { window.saved.push(result.data); return {error:{message:'response lost'}}; }
      window.saved.push(result.data); return result;
    };
  });
  const start = async () => {
    await page.goto(new URL(page.url()).origin);
    await page.getByRole('button',{name:'Caducidades',exact:true}).click();
    await page.getByRole('button',{name:'CHETUMALITO',exact:true}).click();
    await page.getByRole('button',{name:'Ingresar fecha de caducidad',exact:true}).click();
    await page.getByLabel('Nombre del producto').fill('Producto prueba');
    await page.getByLabel('Fecha de caducidad').fill('2027-12-01');
    await page.getByLabel('Piezas').fill('2');
  };
  const save = () => page.getByRole('button',{name:'Guardar registro',exact:true}).click();
  const failures = [];
  await start();
  await page.evaluate(()=>window.mode='throw'); await save();
  try { await page.waitForFunction(()=> !document.querySelector('fieldset').disabled,{},{timeout:1500}); }
  catch { failures.push('exception leaves controls busy'); }
  await start();
  await page.evaluate(()=>window.mode='delay'); await save();
  await page.waitForFunction(()=>!!window.releaseWrite);
  await page.evaluate(()=>{window.authChange('SIGNED_OUT',null);window.authChange('SIGNED_IN',{user:{id:'b'}});});
  try { await page.getByRole('button',{name:'JUNIOR',exact:true}).click({timeout:1500}); }
  catch { failures.push('new session remains busy'); }
  await page.evaluate(()=>window.releaseWrite());
  await page.waitForTimeout(100);
  if(await page.getByText('Registro guardado.',{exact:true}).count()) failures.push('stale success reaches new session');
  if(failures.length) throw Error(failures.join('; '));
  await start();
  await page.getByRole('button',{name:'Volver a caducidades',exact:true}).click();
  await page.getByRole('button',{name:'Listos para poner en promoción',exact:true}).click();
  await page.evaluate(()=>window.mode='delay');
  await page.getByRole('button',{name:'Marcar como resuelto',exact:true}).click();
  await page.waitForFunction(()=>!!window.releaseWrite);
  await page.evaluate(()=>window.authChange('SIGNED_IN',{user:{id:'b'}}));
  await page.getByRole('button',{name:'JUNIOR',exact:true}).click();
  await page.getByRole('button',{name:'Listos para poner en promoción',exact:true}).click();
  await page.evaluate(()=>window.releaseWrite()); await page.waitForTimeout(100);
  if(await page.getByText('Registro marcado como resuelto.',{exact:true}).count()) throw Error('Stale resolution success');
  if(!await page.getByRole('button',{name:'Marcar como resuelto',exact:true}).count()) throw Error('Stale resolution removed new store record');
  for (const mode of ['error','empty','throw']) {
    await start(); await page.evaluate(mode => window.mode=mode,mode); await save();
    await page.getByRole('alert').waitFor();
    if(await page.getByLabel('Nombre del producto').inputValue() !== 'Producto prueba') throw Error('Failed save lost draft');
    if(await page.getByText('Registro guardado.',{exact:true}).count()) throw Error('False success');
    await page.evaluate(()=>window.mode='ok'); await save();
    await page.getByText('Registro guardado.',{exact:true}).waitFor();
  }
  for (const screen of ['Listos para poner en promoción','Consultar todos los registros']) {
    for (const mode of ['error','empty','throw']) {
      await start();
      await page.getByRole('button',{name:'Volver a caducidades',exact:true}).click();
      await page.getByRole('button',{name:screen,exact:true}).click();
      await page.evaluate(mode=>window.mode=mode,mode);
      await page.getByRole('button',{name:'Marcar como resuelto',exact:true}).click();
      await page.getByRole('alert').waitFor();
      if(!await page.getByRole('button',{name:'Marcar como resuelto',exact:true}).isEnabled()) throw Error('Resolve locked after error');
      await page.evaluate(()=>window.mode='ok');
      await page.getByRole('button',{name:'Marcar como resuelto',exact:true}).click();
      await page.getByText('Registro marcado como resuelto.',{exact:true}).waitFor();
    }
  }
  await start(); await page.evaluate(()=>window.mode='delay'); await save();
  await page.waitForFunction(()=>!!window.releaseWrite);
  if(!await page.getByRole('button',{name:'Volver al menú',exact:true}).isDisabled()) throw Error('Can abandon pending write');
  await page.evaluate(()=>window.releaseWrite());
  await page.getByText('Registro guardado.',{exact:true}).waitFor();
  if(!await page.getByRole('button',{name:'Volver al menú',exact:true}).isEnabled()) throw Error('Menu stays locked');
  // The fake transport deliberately ignores cancellation: the component must reject stale reads.
  for (const filter of ['pendientes','resueltos']) {
    await start();
    await page.getByRole('button',{name:'Volver a caducidades',exact:true}).click();
    await page.getByRole('button',{name:'Elegir otra tienda',exact:true}).click();
    await page.evaluate(()=>window.delayRead='CHETUMALITO');
    await page.getByRole('button',{name:'CHETUMALITO',exact:true}).click();
    await page.getByRole('button',{name:'Consultar todos los registros',exact:true}).click();
    if(filter === 'resueltos') await page.getByRole('combobox').selectOption('resueltos');
    await page.waitForFunction(()=>!!window.releaseRead);
    await page.getByRole('button',{name:'Volver a caducidades',exact:true}).click();
    await page.getByRole('button',{name:'Elegir otra tienda',exact:true}).click();
    await page.getByRole('button',{name:'JUNIOR',exact:true}).click();
    await page.getByRole('button',{name:'Consultar todos los registros',exact:true}).click();
    if(filter === 'resueltos') await page.getByRole('combobox').selectOption('resueltos');
    await page.evaluate(()=>window.releaseRead()); await page.waitForTimeout(100);
    if(await page.getByRole('listitem').filter({hasText:'CHETUMALITO'}).count()) throw Error('Old store response leaked');
    await page.getByRole('listitem').filter({hasText:'JUNIOR'}).waitFor();
  }
  await start(); await page.evaluate(()=>window.mode='lost'); await save();
  await page.getByRole('alert').waitFor();
  await page.evaluate(()=>window.mode='ok'); await save();
  await page.getByText('Registro guardado.',{exact:true}).waitFor();
  const saved = await page.evaluate(()=>window.saved);
  if(saved.length !== 2) throw Error('Lost-response experiment did not exercise duplicate risk');
  return 'Session, exceptions, errors, no-row replies, retries, menu lock and out-of-order store reads pass. Lost response reproduces two saved rows: no identification or database changes introduced.';
}
