const UPPERCASE = "ABCDEFGHJKMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%*?";
const ALL_CHARACTERS = `${UPPERCASE}${LOWERCASE}${DIGITS}${SYMBOLS}`;

function randomIndex(max: number) {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] % max;
}

function pick(characters: string) {
  return characters[randomIndex(characters.length)];
}

/** Creates a browser-safe password that satisfies the platform password policy. */
export function generateClientPassword(length = 16) {
  const size = Math.max(12, length);
  const characters = [pick(UPPERCASE), pick(LOWERCASE), pick(DIGITS), pick(SYMBOLS)];

  while (characters.length < size) characters.push(pick(ALL_CHARACTERS));

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join("");
}
