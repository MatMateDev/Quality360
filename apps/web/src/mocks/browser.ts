import { setupWorker } from "msw/browser";
import { hdus } from "./data";
import { fuentes } from "./dataE7";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

// Solo en modo mock: deja que las pruebas de navegador (axe) cambien fuentes y HDU sin tocar el servidor real.
Object.assign(window, { __q360Mocks: { hdus, fuentes } });
