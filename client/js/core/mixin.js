// client/js/core/mixin.js
// Mezcla objetos de métodos en el prototipo de una clase conservando la semántica de los métodos de clase
// (no enumerables, getters/setters intactos). Permite repartir clases grandes en varios módulos sin cambiar lógica.

/**
 * @param {Function} Klass clase destino
 * @param {...object} mixins objetos con métodos (sintaxis de método de objeto literal)
 */
export function mixMethods(Klass, ...mixins) {
  for (const mixin of mixins) {
    const descriptors = Object.getOwnPropertyDescriptors(mixin);
    for (const key of Object.keys(descriptors)) {
      if (Object.prototype.hasOwnProperty.call(Klass.prototype, key)) {
        throw new Error(`mixMethods: ${Klass.name}.${key} ya existe`);
      }
      descriptors[key].enumerable = false;
    }
    Object.defineProperties(Klass.prototype, descriptors);
  }
  return Klass;
}
