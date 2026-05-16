import { type ISensorModule } from "../modules/ISensorModule.js";

/**
 * The Microkernel — a lightweight, immutable-after-boot module registry.
 *
 * Responsibilities:
 *  - Accept module registrations at application startup.
 *  - Resolve an ISensorModule by its string `type` discriminant at request time.
 *  - Enforce uniqueness: duplicate registrations are a programmer error and fail loudly.
 *
 * It is a pure dispatch mechanism.
 */
export class SensorKernel {
  private readonly registry = new Map<string, ISensorModule>();

  /**
   * Registers a sensor module.
   *
   * Throws synchronously if a module for the same `type` is already registered,
   * because duplicate registration is always a configuration bug, not a runtime
   * condition — it should crash the process at startup, not silently overwrite.
   *
   * Returns `this` for fluent chaining:
   *   kernel.register(new TemperatureModule()).register(new PeopleCountModule())
   */
  register(module: ISensorModule): this {
    if (this.registry.has(module.type)) {
      throw new Error(
        `SensorKernel: A module for type '${module.type}' is already registered. ` +
          `Each sensor type must have exactly one handler.`,
      );
    }
    this.registry.set(module.type, module);
    return this;
  }

  /**
   * Resolves a module by its type string.
   * Returns `undefined` if no module is registered for that type.
   */
  resolve(type: string): ISensorModule | undefined {
    return this.registry.get(type);
  }

  /**
   * Returns the list of all registered type strings.
   * Used by the controller to populate informative 404 error responses.
   */
  getRegisteredTypes(): readonly string[] {
    return [...this.registry.keys()];
  }
}
