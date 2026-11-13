async page => {
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(10000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL(page.url()).origin);
  await page.getByRole("button", { name: "Corte de caja", exact: true }).first().click();
  await page.evaluate(() => {
    window.corteAlerts = [];
    window.alert = message => window.corteAlerts.push(String(message));
  });
  const nav = page.getByRole("navigation", { name: "Pasos del corte" });
  if (await page.locator(".labs-corte > div").first().getByRole("button").count() !== 2) throw new Error("Header must have two buttons");
  if (await nav.getByRole("button").count() !== 5) throw new Error("Missing five-step navigation");
  const active = async () => nav.locator('[aria-current="step"]').getAttribute("aria-label");
  if (await active() !== "Info") throw new Error("Info must be active");
  if (await page.getByRole("heading", { level: 1 }).count() !== 1) throw new Error("Expected one active title");
  if (await page.getByRole("heading", { level: 1 }).textContent() !== "Información del turno") throw new Error("Full active title missing");
  await nav.getByRole("button", { name: "Tarjetas" }).click();
  if (await active() !== "Info") throw new Error("Invalid tap advanced");
  const swipe = async (from, to) => page.evaluate(({ from, to }) => {
    const el = document.querySelector(".corte-gesture");
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, isPrimary: true, pointerId: 9, clientX: from[0], clientY: from[1] }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, isPrimary: true, pointerId: 9, clientX: to[0], clientY: to[1] }));
  }, { from, to });
  await swipe([300, 350], [100, 355]);
  if (await active() !== "Info") throw new Error("Invalid swipe advanced");
  const alerts = await page.evaluate(() => window.corteAlerts);
  if (alerts.length !== 2 || alerts.some(message => !message.includes("sucursal"))) throw new Error("Rejected navigation did not validate sucursal");
  await page.locator(".corte-gesture select").first().selectOption("PLAYITA");
  await page.getByPlaceholder("Ej. Sofía Rodríguez").fill("Ana");
  await swipe([300, 350], [100, 355]);
  if (await active() !== "Tarjetas") throw new Error("Swipe did not advance");
  await nav.getByRole("button", { name: "Conteo" }).click();
  if (await active() !== "Conteo") throw new Error("Tap did not navigate");
  await swipe([100, 350], [300, 355]);
  if (await active() !== "Efectivo") throw new Error("Swipe did not go back");
  await swipe([250, 250], [245, 400]);
  if (await active() !== "Efectivo") throw new Error("Vertical gesture navigated");
  const input = page.locator(".corte-gesture input").first();
  await input.evaluate(el => {
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, isPrimary: true, pointerId: 10, clientX: 300, clientY: 300 }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, isPrimary: true, pointerId: 10, clientX: 100, clientY: 300 }));
  });
  if (await active() !== "Efectivo") throw new Error("Input gesture navigated");
  if (await page.getByText("Fórmula y desglose de efectivo esperado:").count()) throw new Error("Repeated formula remains");
  await page.getByPlaceholder("Monto total del reporte de ventas").fill("100");
  for (let index = 0; index < 20; index++) {
    await page.getByRole("button", { name: /Agregar Vale de Consumo/i }).click();
    await page.getByRole("button", { name: /Agregar Ajuste del Turno/i }).click();
  }
  const firstVale = page.getByRole("textbox", { name: "Nombre del vale 1", exact: true });
  const lastVale = page.getByRole("textbox", { name: "Nombre del vale 20", exact: true });
  const firstAjuste = page.getByRole("textbox", { name: "Motivo del ajuste 1", exact: true });
  const lastAjuste = page.getByRole("textbox", { name: "Motivo del ajuste 20", exact: true });
  for (const field of [firstVale, lastVale, firstAjuste, lastAjuste]) {
    await field.scrollIntoViewIfNeeded();
    if (!await field.isVisible()) throw new Error("List entry not reachable");
    const overflow = await field.evaluate(el => {
      let parent = el.parentElement;
      while (parent && !parent.classList.contains("corte-gesture")) {
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return true;
        parent = parent.parentElement;
      }
      return false;
    });
    if (overflow) throw new Error("List has nested scroll");
  }
  await firstVale.fill("Primero");
  await lastVale.fill("Último");
  await firstAjuste.fill("Primero");
  await lastAjuste.fill("Último");
  if (await page.evaluate(() => window.scrollY) === 0) throw new Error("Expected to be scrolled down in step 3");
  await nav.getByRole("button", { name: "Conteo" }).click();
  const sections = page.locator('.corte-gesture section[aria-label]');
  await sections.first().waitFor({ state: "visible" });
  if (await page.evaluate(() => window.scrollY) !== 0) throw new Error("New step did not start at the top");
  const names = await sections.evaluateAll(els => els.map(el => el.getAttribute("aria-label")));
  if (names.join("|") !== "Billetes (MXN)|Monedas (MXN)|Dólares estadounidenses (USD)|Apartados de efectivo") throw new Error("Count sections are not stacked in order");
  const bills = sections.nth(0);
  await bills.locator('input[type="number"]').nth(3).fill("1");
  await page.getByRole("button", { name: "Total de monedas" }).click();
  await page.getByRole("spinbutton", { name: "Total de monedas (MXN)" }).fill("25");
  await page.getByRole("button", { name: /Agregar apartado/i }).click();
  const apartado = sections.nth(3);
  const apartInputs = apartado.locator("input");
  if (await apartInputs.nth(0).inputValue() || await apartInputs.nth(1).inputValue()) throw new Error("New apartado is not blank");
  await apartInputs.nth(0).fill("Cambio");
  await apartInputs.nth(1).fill("10");
  await nav.getByRole("button", { name: "Resumen" }).click();
  await page.getByText("Efectivo Físico Contado", { exact: true }).waitFor({ state: "visible" });
  const physical = page.getByText("Efectivo Físico Contado").locator("..");
  if (!await physical.getByText("$135.00 MXN").count()) throw new Error("Physical total changed");
  const net = page.getByText("Efectivo Entregado").locator("..");
  if (!await net.getByText("$125.00 MXN").count()) throw new Error("Net total changed");
  if (!await page.getByText("Efectivo esperado").count()) throw new Error("Expected cash breakdown missing");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const room = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(el => el.textContent.includes("Finalizar y Cerrar Sesión"));
    return button.getBoundingClientRect().bottom <= document.querySelector(".corte-nav").getBoundingClientRect().top;
  });
  if (!room) throw new Error("Last control hidden behind navigation");
  return "Navigation, long lists, count and summary verified";
}
