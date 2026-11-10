async page => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {value: async () => {
      const code = "0758104100422";
      const patterns = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
      const left = [...code.slice(1, 7)].map(digit => patterns[Number(digit)]).join("");
      const right = [...code.slice(7)].map(digit => patterns[Number(digit)].replace(/[01]/g, bit => bit === "0" ? "1" : "0")).join("");
      const bars = "101" + left + "01010" + right + "101";
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      const draw = () => {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = "black";
        [...bars].forEach((bit, i) => { if (bit === "1") ctx.fillRect(82 + i * 5, 55, 5, 250); });
      };
      draw();
      const stream = canvas.captureStream(12);
      const track = stream.getVideoTracks()[0];
      const timer = setInterval(draw, 85);
      const original = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); original(); };
      window.testCameraTrack = track;
      return stream;
    }});
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, {}, {timeout:15000});
  const context = page.context();
  await context.setOffline(true);
  try {
    await page.reload();
    await page.getByRole("button",{name:"Cobro sin luz",exact:true}).first().click();
    await page.getByRole("button",{name:"Consultor de precios",exact:true}).click();
    const result = page.getByRole("dialog",{name:"Precio del producto"});
    await result.getByText("Agua Bonafont 1L",{exact:true}).waitFor({timeout:10000});
    await result.getByText("$16.00",{exact:true}).waitFor();
    if (await page.evaluate(() => window.testCameraTrack.readyState) !== "ended") throw new Error("Video track still active");
    return "Real ZXing decoded a generated EAN-13 against the offline catalog";
  } finally { await context.setOffline(false); }
}
