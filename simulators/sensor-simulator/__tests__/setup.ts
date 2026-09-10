// Referenced by package.json's `setupFilesAfterEnv`; jest refuses to start without it.
// ESM mode injects no globals, so even `jest` itself has to be imported here.
import { jest } from "@jest/globals";

jest.setTimeout(10_000);
