async page => {
  const url = new URL(page.url()).origin;
  await page.addInitScript(() => {
    const user = {id:"00000000-0000-4000-8000-000000000001",aud:"authenticated",role:"authenticated"};
    const token = btoa(JSON.stringify({alg:"HS256",typ:"JWT"}))+"."+btoa(JSON.stringify({sub:user.id,exp:4102444800}))+".stub";
    window.testSession = {
      access_token:token, refresh_token:"test", expires_at:4102444800, token_type:"bearer", user
    };
    localStorage.setItem("sb-sufykmgjomalxaboryqh-auth-token", JSON.stringify(window.testSession));
    window.cameraStops = 0;
    window.cameraMode = "read";
    window.nextBarcode = "11210000834";
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {value: async () => {
      if (window.cameraMode === "deny") throw new DOMException("Denied", "NotAllowedError");
      if (window.cameraMode === "late") await new Promise(resolve => { window.releaseCamera = resolve; });
      const track = Object.assign(new EventTarget(), {stop:() => window.cameraStops++});
      window.testTrack = track;
      return {getTracks:() => [track]};
    }});
  });
  let posts = 0;
  await page.route("**/rest/v1/caducidad_accesos?*", route => route.fulfill({json:[{sucursal:"CHETUMALITO"}]}));
  await page.route("**/rest/v1/caducidades?*", route => {
    if (route.request().method() !== "POST") return route.fulfill({json:[]});
    posts++;
    const row = route.request().postDataJSON();
    if (row.codigo !== "0000000000002" || row.producto !== "Producto manual") throw new Error("Manual entry lost");
    return route.fulfill({json:{...row,id:"test",resuelto:false}});
  });
  await page.route(/\/[^/]*(?:zxing_browser|zxing\/browser)[^?]*(?:\?|$)/, route => route.fulfill({
    contentType:"application/javascript",
    body:`export class BrowserMultiFormatOneDReader {
      async decodeFromStream(_stream,_video,callback) {
        const controls={stop(){}};
        if (window.cameraMode === "hold") return controls;
        callback({getText:()=>window.nextBarcode},undefined,controls);
        callback({getText:()=>"9999999999999"},undefined,controls);
        return controls;
      }
    }`
  }));
  await page.goto(url);
  await page.getByRole("button",{name:"Caducidades",exact:true}).first().click();
  await page.getByRole("combobox",{name:"Sucursal",exact:true}).selectOption("CHETUMALITO",{timeout:7000});
  const date = page.getByLabel("Fecha de caducidad");
  const pieces = page.getByLabel("Piezas");
  const barcode = page.getByLabel("Código de barras",{exact:true});
  await date.fill("2027-12-03");
  await pieces.fill("3");
  const scan = page.getByRole("button",{name:"Escanear código",exact:true});
  await scan.click({timeout:5000});
  await page.getByText("Salsa Tabasco 60ml",{exact:true}).waitFor();
  if (await barcode.inputValue() !== "11210000834" || await date.inputValue() !== "2027-12-03" || await pieces.inputValue() !== "3" || posts) throw new Error("Scan changed the draft");
  await page.evaluate(()=>{window.cameraMode="late";});
  await scan.click();
  await page.waitForFunction(()=>!!window.releaseCamera);
  await page.getByRole("button",{name:"Cancelar",exact:true}).click();
  await page.evaluate(()=>window.releaseCamera());
  await page.waitForFunction(()=>window.cameraStops===2, {}, {timeout:5000});
  if (await barcode.inputValue() !== "11210000834") throw new Error("Late permission changed the draft");
  await page.evaluate(()=>{window.cameraMode="read";window.nextBarcode="759684031052";});
  await scan.click();
  await page.getByText("Aceite de Olivo 60ml",{exact:true}).waitFor({timeout:5000});
  await page.getByRole("combobox",{name:"Proveedor (opcional)",exact:true}).waitFor({timeout:5000});
  await page.evaluate(()=>{window.cameraMode="hold";window.testTrack=null;});
  await scan.click();
  await page.waitForFunction(()=>!!window.testTrack);
  await page.evaluate(()=>window.testTrack.dispatchEvent(new Event("ended")));
  await page.getByText(/La cámara se interrumpió/).waitFor({timeout:5000});
  await page.getByRole("button",{name:"Cancelar",exact:true}).click();
  await scan.click();
  await page.getByRole("dialog",{name:"Escanear código"}).waitFor();
  await page.evaluate(()=>{
    window.testAuth = new BroadcastChannel("sb-sufykmgjomalxaboryqh-auth-token");
    window.testAuth.postMessage({event:"SIGNED_OUT",session:null});
  });
  await page.getByRole("button",{name:"Iniciar sesión"}).waitFor({timeout:5000});
  await page.evaluate(()=>window.testAuth.postMessage({event:"SIGNED_IN",session:window.testSession}));
  await scan.waitFor({timeout:5000});
  if (await page.getByRole("dialog",{name:"Escanear código"}).count()) throw new Error("Scanner reopened on sign-in");
  await page.evaluate(()=>{window.cameraMode="deny";});
  await scan.click();
  await page.getByText(/No se pudo abrir el lector/).waitFor();
  await page.getByRole("button",{name:"Cancelar",exact:true}).click();
  await page.evaluate(()=>{window.cameraMode="read";window.nextBarcode="0000000000002";});
  await scan.click();
  await page.getByText(/No encontramos ese código/).waitFor();
  if (await barcode.inputValue() !== "0000000000002") throw new Error("Leading zeros lost");
  await page.getByLabel("Nombre del producto").fill("Producto manual");
  await page.getByRole("button",{name:"Guardar registro"}).click();
  await page.getByText("Registro guardado.").waitFor();
  if (posts !== 1) throw new Error("Expected exactly one manual save");
  return "Provider selection, camera interruption, session loss and manual fallback verified";
}
