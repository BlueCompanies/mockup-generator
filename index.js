import express from "express";
import puppeteer from "puppeteer";
import dotenv from "dotenv";
import awsS3 from "./_lib/aws.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors(process.env.IP_ADDRESS));
app.use(express.json());

const MAX_SESSIONS = 50;

app.post("/mockup-generator", async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  const body = await req.body;
  const { name, image, designId, designs, productType, sessionId } = body;
  const browser = await puppeteer.launch({
    headless: true, // Enable headless mode for faster execution
    executablePath: "/usr/bin/chromium-browser",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-breakpad",
      "--disable-client-side-phishing-detection",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-domain-reliability",
      "--disable-features=AudioServiceOutOfProcess",
      "--disable-hang-monitor",
      "--disable-ipc-flooding-protection",
      "--disable-notifications",
      "--disable-offer-store-unmasked-wallet-cards",
      "--disable-popup-blocking",
      "--disable-print-preview",
      "--disable-prompt-on-repost",
      "--disable-renderer-backgrounding",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-pings",
      "--password-store=basic",
      "--use-mock-keychain",
      "--disable-blink-features=AutomationControlled",
      "--disable-blink-features=InterestCohort",
    ],
    defaultViewport: {
      width: 1,
      height: 1,
    },
  });

  const [page] = await browser.pages();

  const photopeaIframeContent = {
    files: [
      image.length > 0
        ? image
        : "https://xyzstorage.store/impretion-shops%2Fplaceholder-images%2Fgeneral.webp",
      designId === "no-design"
        ? `https://xyzstorage.store/impretion-shops/psd-designs/${designs}/${productType}/no-design.psd`
        : `https://xyzstorage.store/impretion-shops/psd-designs/${designs}/${productType}/${designId}.psd`,
    ],
    script:
      "function openSmartObjectContents(smartObjectLayer) { if (!smartObjectLayer || smartObjectLayer.kind !== LayerKind.SMARTOBJECT) { return; } if (smartObjectLayer.name.startsWith('#')) { var docRef = app.activeDocument; docRef.activeLayer = smartObjectLayer; var idEditContents = stringIDToTypeID('placedLayerEditContents'); var desc = new ActionDescriptor(); executeAction(idEditContents, desc, DialogModes.NO); app.activeDocument.paste(); var newLayer = app.activeDocument.activeLayer; var smartObjectWidth = app.activeDocument.width; var smartObjectHeight = app.activeDocument.height; var newLayerWidth = newLayer.bounds[2] - newLayer.bounds[0]; var newLayerHeight = newLayer.bounds[3] - newLayer.bounds[1]; var widthScale = (smartObjectWidth / newLayerWidth) * 100; newLayer.resize(widthScale, widthScale, AnchorPosition.MIDDLECENTER); newLayerHeight = newLayer.bounds[3] - newLayer.bounds[1]; if (newLayerHeight < smartObjectHeight) { var heightScale = (smartObjectHeight / newLayerHeight) * 100; newLayer.resize(heightScale, heightScale, AnchorPosition.MIDDLECENTER); } newLayer.translate((smartObjectWidth - (newLayer.bounds[2] - newLayer.bounds[0])) / 2 - newLayer.bounds[0], (smartObjectHeight - (newLayer.bounds[3] - newLayer.bounds[1])) / 2 - newLayer.bounds[1]); var placeholderLayerFound = false; for (var i = app.activeDocument.layers.length - 1; i >= 0; i--) { var currentLayer = app.activeDocument.layers[i]; if (currentLayer !== newLayer && currentLayer.name.includes('!')) { currentLayer.remove(); } if (currentLayer.name === '!placeholder') { placeholderLayerFound = true; } } if (!placeholderLayerFound) { app.echoToOE('placeholderLayerError'); } else { newLayer.name = '!placeholder'; app.activeDocument.save(); app.activeDocument.close(SaveOptions.SAVECHANGES); } } } function processActiveDocument() { var doc = app.activeDocument; try { var layer = doc.layers.getByName('$name'); if (layer && layer.kind === LayerKind.TEXT) { layer.textItem.contents = '" +
      name +
      "'; layer.textItem.justification = Justification.CENTER; } } catch (e) {} if (app.documents.length === 1) { var firstLayer = doc.layers[0]; doc.activeLayer = firstLayer; firstLayer.copy(); } for (var j = 0; j < doc.layers.length; j++) { var layer = doc.layers[j]; openSmartObjectContents(layer); } if (app.documents.length !== 1) { doc.saveToOE('webp:0.8'); } app.echoToOE('processed');} processActiveDocument();",
  };

  const encodedContent = encodeURIComponent(
    JSON.stringify(photopeaIframeContent)
  );

  const iframeUrl = `https://www.photopea.com#${encodedContent}`;

  const htmlContent = `
    <iframe
        src="${iframeUrl}"
        loading="lazy"
    ></iframe>
  `;

  // Set the content of the page
  await page.setContent(htmlContent);

  // Expose a function to handle ArrayBuffer in the Node.js context
  await page.exposeFunction("sendBuffer", async (buffer) => {
    try {
      if (Array.isArray(buffer)) {
        const uint8Array = new Uint8Array(buffer);
        const arrayBuffer = uint8Array.buffer;

        const command = new PutObjectCommand({
          Bucket: "impretion",
          // We make sure to put the designId as the image file so we can cache the mockup.
          Key: `impretion-shops/user-temp-sessions-files/${sessionId}/temp-images/${designId}.webp`,
          Body: arrayBuffer,
        });

        await awsS3().send(command);

        res
          .status(200)
          .send(
            `https://xyzstorage.store/impretion-shops/user-temp-sessions-files/${sessionId}/temp-images/${designId}.webp`
          );
      } else {
        console.error("Received data is not an ArrayBuffer", buffer);
        res.status(500).send("Invalid data received.");
      }
    } catch (error) {
      console.error("Error processing buffer:", error);
      res.status(500).send("Error processing buffer.");
    } finally {
      await browser.close();
    }
  });

  // Add event listener within page.evaluate to listen to postMessage events from the iframe
  await page.evaluate(() => {
    window.addEventListener("message", (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Send the buffer back to Node.js context
        window.sendBuffer(Array.from(new Uint8Array(event.data)));
      } else {
        console.error("Received data is not an ArrayBuffer:", event.data);
      }
      if (event.data === "processed") {
        console.log("Processing complete");
      }
    });
  });
});

let browserCounter = 0;
const browsers = new Map();

app.post("/test-mockup", async (req, res) => {
  const browserId = browserCounter++;
  const debuggingPort = 9222 + browserId;

  try {
    // Lanzar una nueva instancia de Puppeteer
    const browser = await puppeteer.launch({
      headless: false,
      args: [`--remote-debugging-port=${debuggingPort}`],
    });

    console.log(
      `Instancia de Puppeteer ${browserId} lanzada en el puerto ${debuggingPort}. Esperando 5 segundos...`
    );

    // Esperar 5 segundos
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log(`Conectando a la instancia ${browserId} existente...`);

    // Conectarse a la instancia existente
    const browserWSEndpoint = await browser.wsEndpoint();
    console.log(`Endpoint para el navegador ${browserId}:`, browserWSEndpoint);
    const connectedBrowser = await puppeteer.connect({ browserWSEndpoint });

    console.log(
      `Conexión establecida para el navegador ${browserId}. Abriendo una nueva página...`
    );

    // Abrir una página en el navegador
    const page = await connectedBrowser.newPage();
    await page.goto("https://example.com");

    console.log(`Página abierta en el navegador ${browserId}.`);

    // Guardar la referencia del navegador
    browsers.set(browserId, { browser, connectedBrowser });

    // Responder al cliente
    res.json({
      message: "Proceso completado con éxito",
      browserId: browserId,
      wsEndpoint: browserWSEndpoint,
    });
    console.log(browserId, browserWSEndpoint);
  } catch (error) {
    console.error(`Error en el navegador ${browserId}:`, error);
    res.status(500).json({ error: "Ocurrió un error durante el proceso" });
  }
});

app.listen(8080, () => {
  console.log("Server is running on port 8080");
});

process.on("SIGINT", function () {
  console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
  // some other closing procedures go here
  process.exit(1);
});
