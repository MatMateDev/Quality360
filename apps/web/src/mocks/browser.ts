import { setupWorker } from "msw/browser";
import { hdus } from "./data";
import { modoE5, reiniciarE5 } from "./dataE5";
import { fuentes } from "./dataE7";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

// Solo en modo mock: deja que las pruebas de navegador (axe) cambien fuentes y HDU sin tocar el servidor real.
Object.assign(window, { __q360Mocks: { hdus, fuentes, e5: { modo: modoE5, reiniciar: reiniciarE5 } } });

// Revisión visual y axe: un script puede fijar el estado inicial de E5 antes de que cargue la página.
Object.assign(modoE5, (window as unknown as { __q360E5Inicial?: Partial<typeof modoE5> }).__q360E5Inicial ?? {});
