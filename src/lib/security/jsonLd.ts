/**
 * Serialize JSON for an inline application/ld+json script without allowing a
 * value such as `</script>` to terminate the element.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      ({
        "<": "\\u003c",
        ">": "\\u003e",
        "&": "\\u0026",
        "\u2028": "\\u2028",
        "\u2029": "\\u2029",
      })[character] ?? character,
  );
}
