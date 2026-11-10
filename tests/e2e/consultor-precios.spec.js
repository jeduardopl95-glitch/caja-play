async page => {
  const url = new URL(page.url()).origin;
  await page.addInitScript(() => {
    window.cameraStops = 0;
    window.nextBarcode = "11210000834";
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async constraints => {
        if (constraints.audio !== false) throw new Error("Unexpected audio");
        return { getTracks: () => [Object.assign(new EventTarget(), {stop: () => window.cameraStops++})] };
      }
    });
    localStorage.setItem("cajaplay_checkout", JSON.stringify({
      cart: [{ id: "existing", codigo: "11210000834", name: "Salsa Tabasco 60ml", quantity: 1, price: 69 }],
      sales: []
    }));
    localStorage.setItem("cajaplay_inventory_override_v2", JSON.stringify([
      {id:"1",codigo:"11210000834",descripcion:"Salsa Tabasco 60ml",precio:69,departamento:"Abarrotes"},
      {id:"2",codigo:"0012345678905",descripcion:"A",precio:20,departamento:"General"},
      {id:"3",codigo:"0012345678905",descripcion:"B",precio:30,departamento:"General"},
    ]));
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "cajaplay_checkout" && window.failCheckout) throw new DOMException("Full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.route(/\/[^/]*(?:zxing_browser|zxing\/browser)[^?]*(?:\?|$)/, route => route.fulfill({
    contentType: "application/javascript",
    body: `export class BrowserMultiFormatOneDReader {
      async decodeFromStream(_stream, _video, callback) {
        const controls = {stop(){}};
        callback({getText:()=>window.nextBarcode}, undefined, controls);
        callback({getText:()=>"9999999999999"}, undefined, controls);
        return controls;
      }
    }`
  }));
  await page.goto(url);
  await page.getByRole("button", {name: "Cobro sin luz", exact: true}).first().click();
  const launch = page.getByRole("button", {name: "Consultor de precios", exact: true});
  await launch.click({timeout: 5000});
  const result = page.getByRole("dialog", {name: "Precio del producto"});
  await result.getByText("$69.00", {exact: true}).waitFor();
  const quantity = () => page.evaluate(() => JSON.parse(localStorage.getItem("cajaplay_checkout")).cart[0].quantity);
  if (await quantity() !== 1) throw new Error("Scanning changed the ticket");
  await result.getByRole("button", {name: "Cerrar", exact: true}).click();
  if (await quantity() !== 1) throw new Error("Closing changed the ticket");
  await launch.click();
  await page.evaluate(() => { window.failCheckout = true; });
  await result.getByRole("button", {name: "Agregar al ticket"}).click();
  await result.getByRole("alert").waitFor();
  if (await quantity() !== 1) throw new Error("Failed save changed ticket");
  await page.evaluate(() => { window.failCheckout = false; });
  await result.getByRole("button", {name: "Agregar al ticket"}).click();
  await result.getByText("Agregado al ticket", {exact: true}).waitFor();
  if (!(await result.getByRole("button", {name: "Agregado al ticket"}).isDisabled())) throw new Error("Add still enabled");
  if (await quantity() !== 2) throw new Error("Expected exactly one added unit");
  await page.evaluate(() => { window.nextBarcode = "0000000000002"; });
  await result.getByRole("button", {name: "Escanear otro"}).click();
  await result.getByText("Producto no encontrado").waitFor();
  if (await result.getByRole("button", {name: "Agregar al ticket"}).count()) throw new Error("Unknown barcode can be added");
  await page.evaluate(() => { window.nextBarcode = "0012345678905"; });
  await result.getByRole("button", {name: "Escanear otro"}).click();
  await result.getByText(/coincide con más de un producto/).waitFor();
  if (await result.getByRole("button", {name: "Agregar al ticket"}).count()) throw new Error("Ambiguous barcode can be added");
  if (await page.evaluate(() => window.cameraStops) !== 4) throw new Error("Camera was not stopped after each read");
  await page.keyboard.press("Escape");
  await result.waitFor({state:"hidden"});
  await page.waitForFunction(() => document.activeElement?.textContent.trim() === "Consultor de precios");
  return "Price lookup, explicit add, duplicate callbacks and unknown code verified";
}
